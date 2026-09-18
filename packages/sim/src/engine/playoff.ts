import type { CompetitionStructure } from '../domain/competition.js'
import type {
  PlayoffBracket,
  PlayoffFormat,
  PlayoffRound,
  PlayoffSeed,
  PlayoffSeries,
  QualificationRule,
} from '../domain/playoff.js'
import { sortStandings, type StandingsRow } from '../domain/standings.js'

/**
 * Playoff qualification and bracket construction.
 *
 * Formats are data (see `domain/playoff.ts`). This module interprets them, so
 * supporting another league is a matter of declaring a `PlayoffFormat` rather
 * than editing this file - unless the league needs a bracket shape that does
 * not exist yet, which is one new builder.
 */

/** Rank of every Club within its own conference, 1-based, by record. */
function conferenceRanks(ranked: readonly StandingsRow[]): Map<string, number> {
  const seen = new Map<string, number>()
  const ranks = new Map<string, number>()

  for (const row of ranked) {
    const next = (seen.get(row.conferenceId) ?? 0) + 1
    seen.set(row.conferenceId, next)
    ranks.set(row.clubId, next)
  }

  return ranks
}

function applyRule(
  rule: QualificationRule,
  ranked: readonly StandingsRow[],
  taken: ReadonlySet<string>,
  structure: CompetitionStructure,
  ranks: ReadonlyMap<string, number>,
): PlayoffSeed[] {
  const available = ranked.filter((row) => !taken.has(row.clubId))

  const seed = (
    row: StandingsRow,
    rankInGroup: number,
    via: PlayoffSeed['via'],
  ): PlayoffSeed => ({
    clubId: row.clubId,
    conferenceId: row.conferenceId,
    divisionId: row.divisionId,
    rankInGroup,
    via,
    conferenceRank: ranks.get(row.clubId) ?? 0,
    points: row.points,
  })

  switch (rule.kind) {
    case 'division-top':
      return structure.divisions.flatMap((division) =>
        available
          .filter((row) => row.divisionId === division.id)
          .slice(0, rule.count)
          .map((row, index) => seed(row, index + 1, 'division')),
      )

    case 'conference-wildcard':
      return structure.conferences.flatMap((conference) =>
        available
          .filter((row) => row.conferenceId === conference.id)
          .slice(0, rule.count)
          .map((row, index) => seed(row, index + 1, 'wildcard')),
      )

    case 'conference-top':
      return structure.conferences.flatMap((conference) =>
        available
          .filter((row) => row.conferenceId === conference.id)
          .slice(0, rule.count)
          .map((row, index) => seed(row, index + 1, 'conference')),
      )

    case 'league-top':
      return available.slice(0, rule.count).map((row, index) => seed(row, index + 1, 'league'))
  }
}

export function qualify(
  format: PlayoffFormat,
  standings: readonly StandingsRow[],
  structure: CompetitionStructure,
): PlayoffSeed[] {
  const ranked = sortStandings(standings)
  const ranks = conferenceRanks(ranked)
  const taken = new Set<string>()
  const seeds: PlayoffSeed[] = []

  for (const rule of format.qualification) {
    for (const seed of applyRule(rule, ranked, taken, structure, ranks)) {
      seeds.push(seed)
      taken.add(seed.clubId)
    }
  }

  return seeds
}

/**
 * The NHL first round.
 *
 * Per conference the two division winners are ordered by record. The better
 * one is paired with the weaker wild card, the other with the stronger wild
 * card - so a strong regular season is rewarded with an easier opening
 * opponent. Each division's second and third seeds meet each other.
 *
 * Note that a wild card can be placed in the bracket of the other division,
 * which is what allows three Clubs from one division to meet in that
 * division's half of the bracket.
 */
function buildNhlDivisionalFirstRound(
  seeds: readonly PlayoffSeed[],
  structure: CompetitionStructure,
  winsRequired: number,
): PlayoffSeries[] {
  const series: PlayoffSeries[] = []

  for (const conference of structure.conferences) {
    const inConference = seeds.filter((seed) => seed.conferenceId === conference.id)

    const divisionWinners = inConference
      .filter((seed) => seed.via === 'division' && seed.rankInGroup === 1)
      .sort((a, b) => a.conferenceRank - b.conferenceRank)

    const wildcards = inConference
      .filter((seed) => seed.via === 'wildcard')
      .sort((a, b) => a.rankInGroup - b.rankInGroup)

    if (divisionWinners.length !== 2 || wildcards.length !== 2) {
      throw new Error(
        `nhl-divisional needs 2 division winners and 2 wild cards per conference; ` +
          `conference ${conference.id} has ${divisionWinners.length} and ${wildcards.length}`,
      )
    }

    const [topWinner, otherWinner] = divisionWinners as [PlayoffSeed, PlayoffSeed]
    const [strongWildcard, weakWildcard] = wildcards as [PlayoffSeed, PlayoffSeed]

    // Better division winner draws the weaker wild card.
    series.push(
      makeSeries(1, topWinner, weakWildcard, winsRequired),
      makeSeries(1, otherWinner, strongWildcard, winsRequired),
    )

    // Second against third, inside each division.
    for (const division of structure.divisions.filter((d) => d.conferenceId === conference.id)) {
      const second = inConference.find(
        (seed) => seed.divisionId === division.id && seed.via === 'division' && seed.rankInGroup === 2,
      )
      const third = inConference.find(
        (seed) => seed.divisionId === division.id && seed.via === 'division' && seed.rankInGroup === 3,
      )

      if (!second || !third) {
        throw new Error(`Division ${division.id} did not produce a second and third seed`)
      }

      series.push(makeSeries(1, second, third, winsRequired))
    }
  }

  return series
}

function buildSeededFirstRound(
  seeds: readonly PlayoffSeed[],
  winsRequired: number,
  groupBy: 'conference' | 'league',
  structure: CompetitionStructure,
): PlayoffSeries[] {
  const groups =
    groupBy === 'conference'
      ? structure.conferences.map((conference) =>
          seeds.filter((seed) => seed.conferenceId === conference.id),
        )
      : [[...seeds]]

  return groups.flatMap((group) => {
    const ordered = [...group].sort((a, b) => a.rankInGroup - b.rankInGroup)
    const pairs: PlayoffSeries[] = []

    for (let i = 0; i < ordered.length / 2; i++) {
      const high = ordered[i]!
      const low = ordered[ordered.length - 1 - i]!
      pairs.push(makeSeries(1, high, low, winsRequired))
    }

    return pairs
  })
}

function makeSeries(
  round: number,
  higherSeed: PlayoffSeed,
  lowerSeed: PlayoffSeed,
  winsRequired: number,
): PlayoffSeries {
  return {
    id: `r${round}-${higherSeed.clubId}-${lowerSeed.clubId}`,
    round,
    higherSeed,
    lowerSeed,
    winsRequired,
  }
}

const NHL_ROUND_NAMES = ['First Round', 'Division Final', 'Conference Final', 'Final'] as const

function roundName(bracket: PlayoffFormat['bracket'], round: number, totalRounds: number): string {
  if (bracket === 'nhl-divisional' && totalRounds === 4) {
    return NHL_ROUND_NAMES[round - 1] ?? `Round ${round}`
  }
  if (round === totalRounds) return 'Final'
  if (round === totalRounds - 1) return 'Semi-Final'
  return `Round ${round}`
}

/**
 * Builds the bracket with its first round populated.
 *
 * Later rounds depend on who wins, so they are not known here. A Season
 * advances the bracket round by round as series resolve.
 */
export function seedPlayoffs(
  format: PlayoffFormat,
  standings: readonly StandingsRow[],
  structure: CompetitionStructure,
): PlayoffBracket {
  const seeds = qualify(format, standings, structure)
  const winsRequired = format.winsPerRound[0]

  if (winsRequired === undefined) {
    throw new Error(`Format ${format.id} declares no rounds`)
  }

  const firstRoundSeries =
    format.bracket === 'nhl-divisional'
      ? buildNhlDivisionalFirstRound(seeds, structure, winsRequired)
      : buildSeededFirstRound(
          seeds,
          winsRequired,
          format.bracket === 'conference-seeded' ? 'conference' : 'league',
          structure,
        )

  const firstRound: PlayoffRound = {
    round: 1,
    name: roundName(format.bracket, 1, format.winsPerRound.length),
    series: firstRoundSeries,
  }

  return { formatId: format.id, seeds, rounds: [firstRound] }
}
