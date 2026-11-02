import {
  DEFENCE_SLOT_ABILITY,
  FORWARD_SLOT_ABILITY,
  GOALIE_ABILITY_NOISE,
  GOALIE_ATTRIBUTE_KEYS,
  GOALIE_SLOT_ABILITY,
  ROSTER_SHAPE,
  SKATER_ATTRIBUTE_KEYS,
  abilityOfLevel,
  createRng,
  drawAbility,
  drawHeadroom,
  generateAgeAndHeadroom,
  generateDistinctNames,
  generateGoalie,
  generateGoalieAttributes,
  generateSkater,
  generateSkaterAttributes,
  goalieLevel,
  potentialOf,
  skaterLevel,
  type AttributeProvenance,
  type Club,
  type CompetitionRosters,
  type CompetitionStructure,
  type Goalie,
  type GoalieAttributes,
  type Rng,
  type Skater,
  type SkaterAttributes,
  type SkaterPosition,
} from '@ahm/sim'
import type { ClubStint, GoalieRecord, SeasonRecords, SkaterRecord } from './nhl/records.js'
import { assignPositions, fillPositions } from './positions.js'
import { buildReference, groupOf, quantile, type PositionGroup, type Reference } from './reference.js'
import {
  adjustedForZoneStarts,
  confidenceOf,
  evidence,
  percentiles,
  type Sample,
} from './scale.js'

/**
 * Real NHL Rosters from a season's records (ADR-021). Pure: the same records
 * and options always give the same Rosters.
 */

export interface ClubIdentity {
  id: string
  code: string
  name: string
}

export interface EstimateOptions {
  structure: CompetitionStructure
  /** The Clubs of the structure with their NHL codes. */
  clubs: readonly ClubIdentity[]
  /** YYYY-MM-DD, the day ages are taken on. */
  ageDate: string
  reference?: Reference
  /** Seeds the generated parts. Each Player draws from a stream of his own. */
  seed?: number
}

export const ESTIMATE_SEED = 17

/** Fixtures of ice time at which a Player's own rate weighs as much as his ice-time level. */
const MATCHES_HALF_WEIGHT = 10

export function ageOn(birthDate: string, date: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number]
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0)
}

const minutes = (seconds: number) => seconds / 60
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`

// ---------------------------------------------------------------------------
// Who plays where

export interface ChosenPlayer<R> {
  record: R
  stint: ClubStint
}

export interface ChosenClub {
  club: ClubIdentity
  forwards: ChosenPlayer<SkaterRecord>[]
  defence: ChosenPlayer<SkaterRecord>[]
  goalies: ChosenPlayer<GoalieRecord>[]
}

/**
 * A Player belongs to the Club he played the most Fixtures for, and each Club
 * keeps the 16 forwards, 10 defencemen and 3 Goalies with the most ice time there.
 */
export function chooseRosters(records: SeasonRecords, clubs: readonly ClubIdentity[]): ChosenClub[] {
  const known = new Set(clubs.map((c) => c.code))
  const home = new Map<string, ClubStint>()
  for (const stint of records.stints) {
    if (!known.has(stint.clubCode)) continue
    const key = `${stint.goalie ? 'g' : 's'}${stint.playerId}`
    const best = home.get(key)
    if (
      !best ||
      stint.matchesPlayed > best.matchesPlayed ||
      (stint.matchesPlayed === best.matchesPlayed && stint.timeOnIce > best.timeOnIce)
    ) {
      home.set(key, stint)
    }
  }

  const skaters = new Map(records.skaters.map((r) => [r.playerId, r]))
  const goalies = new Map(records.goalies.map((r) => [r.playerId, r]))
  const byIce = (a: ChosenPlayer<unknown>, b: ChosenPlayer<unknown>) =>
    b.stint.timeOnIce - a.stint.timeOnIce || a.stint.playerId - b.stint.playerId

  return clubs.map((club) => {
    const here = [...home.values()].filter((s) => s.clubCode === club.code)
    const skatersHere = here
      .filter((s) => !s.goalie && skaters.has(s.playerId))
      .map((stint) => ({ record: skaters.get(stint.playerId)!, stint }))
      .sort(byIce)
    return {
      club,
      forwards: skatersHere.filter((p) => p.record.position !== 'D').slice(0, ROSTER_SHAPE.forwards),
      defence: skatersHere.filter((p) => p.record.position === 'D').slice(0, ROSTER_SHAPE.defence),
      goalies: here
        .filter((s) => s.goalie && goalies.has(s.playerId))
        .map((stint) => ({ record: goalies.get(stint.playerId)!, stint }))
        .sort(byIce)
        .slice(0, ROSTER_SHAPE.goalies),
    }
  })
}

// ---------------------------------------------------------------------------
// What the data says about each attribute

interface Component {
  /** Share of this component in the attribute. */
  share: number
  sample(r: SkaterRecord): { value: number; weight: number } | undefined
  /** Sample at which the Player's own figure weighs as much as his ice-time level. */
  halfWeight: number
  zoneAdjusted?: boolean
}

interface Rule {
  key: keyof SkaterAttributes
  source: 'measured' | 'derived'
  /** Confidence with a full sample. */
  start: number
  components: readonly Component[]
  /** Ranking pool of a Skater, or none when the data says nothing about him. */
  pool?(entry: SkaterEntry): string | undefined
  /** Which group's distribution the pool is mapped onto. */
  reference?: PositionGroup
  note(r: SkaterRecord): string
}

const fiveOnFiveMinutes = (r: SkaterRecord) => minutes(r.toi5v5PerMatch * r.matchesPlayed)
const allMinutes = (r: SkaterRecord) => minutes(r.toiPerMatch * r.matchesPlayed)
const per60 = (count: number, mins: number) => (mins > 0 ? (count / mins) * 60 : 0)

function highDangerPer60(r: SkaterRecord): number | undefined {
  const shots = r.edge?.shots
  const high = r.edge?.highDangerShots
  if (r.shotsPer60At5v5 === undefined || !shots || high === undefined) return undefined
  return r.shotsPer60At5v5 * (high / shots)
}

/** The faceoff pool: forwards with enough draws, wingers included, ranked against centres. */
export const FACEOFF_MINIMUM = 100

const RULES: readonly Rule[] = [
  {
    key: 'speed',
    source: 'measured',
    start: 0.95,
    components: [
      {
        share: 1,
        halfWeight: MATCHES_HALF_WEIGHT,
        sample: (r) =>
          r.edge?.topSpeed === undefined ? undefined : { value: r.edge.topSpeed, weight: r.matchesPlayed },
      },
    ],
    note: (r) => `NHL EDGE top speed ${r.edge?.topSpeed?.toFixed(1)} mph`,
  },
  {
    key: 'faceoffs',
    source: 'measured',
    start: 0.95,
    components: [
      {
        share: 1,
        halfWeight: 200,
        sample: (r) => ({ value: r.faceoffsWon / r.faceoffsTaken, weight: r.faceoffsTaken }),
      },
    ],
    pool: (entry) =>
      entry.group !== 'D' && entry.record.faceoffsTaken >= FACEOFF_MINIMUM ? 'F' : undefined,
    reference: 'C',
    note: (r) => `${r.faceoffsWon} of ${r.faceoffsTaken} draws won`,
  },
  {
    key: 'shooting',
    source: 'derived',
    start: 0.5,
    components: [
      {
        share: 0.65,
        halfWeight: 80,
        sample: (r) => (r.shots > 0 ? { value: r.goals / r.shots, weight: r.shots } : undefined),
      },
      {
        share: 0.35,
        halfWeight: MATCHES_HALF_WEIGHT,
        sample: (r) =>
          r.edge?.topShotSpeed === undefined
            ? undefined
            : { value: r.edge.topShotSpeed, weight: r.matchesPlayed },
      },
    ],
    note: (r) =>
      `${r.goals} goals on ${r.shots} shots` +
      (r.edge?.topShotSpeed === undefined ? '' : `, top shot ${r.edge.topShotSpeed.toFixed(1)} mph`),
  },
  {
    key: 'offPositioning',
    source: 'derived',
    start: 0.5,
    components: [
      {
        share: 1,
        halfWeight: 300,
        zoneAdjusted: true,
        sample: (r) => {
          const value = highDangerPer60(r)
          return value === undefined ? undefined : { value, weight: fiveOnFiveMinutes(r) }
        },
      },
    ],
    note: (r) => `${highDangerPer60(r)?.toFixed(2)} high-danger shots per 60 at 5v5, zone-adjusted`,
  },
  {
    key: 'passing',
    source: 'derived',
    start: 0.5,
    components: [
      {
        share: 1,
        halfWeight: 400,
        zoneAdjusted: true,
        sample: (r) => {
          const mins = fiveOnFiveMinutes(r)
          return mins > 0 ? { value: per60(r.primaryAssists5v5, mins), weight: mins } : undefined
        },
      },
    ],
    note: (r) =>
      `${per60(r.primaryAssists5v5, fiveOnFiveMinutes(r)).toFixed(2)} primary assists per 60 at 5v5, zone-adjusted`,
  },
  {
    key: 'puckControl',
    source: 'derived',
    start: 0.4,
    components: [
      {
        share: 0.6,
        halfWeight: 400,
        zoneAdjusted: true,
        sample: (r) =>
          r.satRelative5v5 === undefined
            ? undefined
            : { value: r.satRelative5v5, weight: fiveOnFiveMinutes(r) },
      },
      {
        share: 0.4,
        halfWeight: 40,
        sample: (r) => {
          const touches = r.takeaways + r.giveaways
          return touches > 0 ? { value: r.takeaways / touches, weight: touches } : undefined
        },
      },
    ],
    note: (r) =>
      `relative shot attempts ${((r.satRelative5v5 ?? 0) * 100).toFixed(1)}% at 5v5, ` +
      `${r.takeaways} takeaways and ${r.giveaways} giveaways`,
  },
  {
    key: 'discipline',
    source: 'derived',
    start: 0.5,
    components: [
      {
        share: 1,
        halfWeight: 600,
        sample: (r) => {
          const mins = allMinutes(r)
          return mins > 0 ? { value: -per60(r.minorPenalties, mins), weight: mins } : undefined
        },
      },
    ],
    note: (r) => `${r.minorPenalties} minor penalties in ${Math.round(allMinutes(r))} minutes`,
  },
  {
    key: 'stamina',
    source: 'derived',
    start: 0.5,
    components: [
      {
        share: 1,
        halfWeight: MATCHES_HALF_WEIGHT,
        sample: (r) =>
          r.edge?.distance === undefined
            ? undefined
            : { value: r.edge.distance / r.matchesPlayed, weight: r.matchesPlayed },
      },
    ],
    note: (r) =>
      `NHL EDGE ${((r.edge?.distance ?? 0) / r.matchesPlayed).toFixed(2)} miles skated per Fixture`,
  },
]

interface SkaterEntry {
  record: SkaterRecord
  stint: ClubStint
  clubId: string
  positions: readonly SkaterPosition[]
  group: PositionGroup
}

interface Estimated {
  value: number
  provenance: AttributeProvenance
}

/** Percentiles of a pool, each pulled towards the Player's ice-time level by how little data is behind it. */
function estimateRule(
  rule: Rule,
  entries: readonly SkaterEntry[],
  anchor: ReadonlyMap<number, number>,
  reference: Reference,
): Map<number, Estimated> {
  const pools = new Map<string, SkaterEntry[]>()
  for (const entry of entries) {
    const pool = rule.pool ? rule.pool(entry) : entry.group
    if (pool !== undefined) pools.set(pool, [...(pools.get(pool) ?? []), entry])
  }

  const zoneStarts = new Map(
    entries.flatMap((e) =>
      e.record.offensiveZoneStarts5v5 === undefined
        ? []
        : [[e.record.playerId, e.record.offensiveZoneStarts5v5] as const],
    ),
  )

  const result = new Map<number, Estimated>()
  for (const pool of pools.values()) {
    const composite: Sample[] = []
    const shareOfEvidence = new Map<number, number>()
    const perComponent = rule.components.map((component) => {
      let samples: Sample[] = pool.flatMap((e) => {
        const sample = component.sample(e.record)
        return sample ? [{ id: e.record.playerId, ...sample }] : []
      })
      if (component.zoneAdjusted) samples = adjustedForZoneStarts(samples, zoneStarts)
      return { component, samples, ranks: percentiles(samples) }
    })

    for (const entry of pool) {
      const id = entry.record.playerId
      let value = 0
      let known = 0
      let share = 0
      for (const { component, samples, ranks } of perComponent) {
        const rank = ranks.get(id)
        const level = anchor.get(id)!
        if (rank === undefined) {
          value += component.share * level
          continue
        }
        const weight = samples.find((s) => s.id === id)!.weight
        const own = evidence(weight, component.halfWeight)
        value += component.share * (own * rank + (1 - own) * level)
        share += component.share * own
        known++
      }
      if (known === 0) continue
      composite.push({ id, value, weight: 1 })
      shareOfEvidence.set(id, share)
    }

    const group = rule.reference ?? pool[0]!.group
    const sorted = reference.attributes[group][rule.key]
    for (const [id, p] of percentiles(composite)) {
      const record = pool.find((e) => e.record.playerId === id)!.record
      result.set(id, {
        value: quantile(sorted, p),
        provenance: {
          source: rule.source,
          confidence: confidenceOf(rule.start, shareOfEvidence.get(id)!),
          note: rule.note(record),
        },
      })
    }
  }
  return result
}

/** A Player's level as ice time ranks him in his group, percentile 0-1. */
function iceTimeLevels(entries: readonly SkaterEntry[]): Map<number, number> {
  const levels = new Map<number, number>()
  for (const group of ['C', 'W', 'D'] as const) {
    const pool = entries.filter((e) => e.group === group)
    const toi = pool.map((e) => e.record.toiPerMatch).sort((a, b) => a - b)
    const prior = quantile(toi, 0.2)
    const samples = pool.map((e) => {
      const { matchesPlayed: gp, toiPerMatch } = e.record
      return {
        id: e.record.playerId,
        value: (toiPerMatch * gp + prior * MATCHES_HALF_WEIGHT) / (gp + MATCHES_HALF_WEIGHT),
        weight: gp,
      }
    })
    for (const [id, p] of percentiles(samples)) levels.set(id, p)
  }
  return levels
}

// ---------------------------------------------------------------------------
// Assembly

function playerRng(seed: number, playerId: number): Rng {
  return createRng(seed).fork(`nhl:${playerId}`)
}

function skaterOf(
  entry: SkaterEntry,
  estimates: ReadonlyMap<keyof SkaterAttributes, ReadonlyMap<number, Estimated>>,
  level: number,
  reference: Reference,
  options: Required<Pick<EstimateOptions, 'ageDate' | 'seed'>>,
): Skater {
  const { record, stint } = entry
  const id = record.playerId
  const rng = playerRng(options.seed, id)
  const natural = entry.positions[0]!
  const ability = quantile(reference.ability[entry.group], level)
  const generated = generateSkaterAttributes(rng.fork('attributes'), ability, natural)

  const attributes = { ...generated }
  const provenance = {} as Record<keyof SkaterAttributes, AttributeProvenance>
  for (const key of SKATER_ATTRIBUTE_KEYS) {
    const estimate = estimates.get(key)?.get(id)
    if (estimate) {
      attributes[key] = estimate.value
      provenance[key] = estimate.provenance
    } else {
      provenance[key] = {
        source: 'generated',
        confidence: 0.25,
        note: `generated around the level of ${clock(record.toiPerMatch)} ice time per Fixture`,
      }
    }
  }

  const age = ageOn(record.birthDate, options.ageDate)
  const levelNow = skaterLevel(attributes)
  return {
    kind: 'skater',
    id: `nhl-${id}`,
    clubId: entry.clubId,
    firstName: stint.firstName,
    lastName: stint.lastName,
    age,
    potential: potentialOf(levelNow, abilityOfLevel(levelNow), drawHeadroom(rng.fork('potential'), age)),
    handedness: record.shoots === 'R' ? 'right' : 'left',
    form: 50,
    fatigue: 0,
    preferredPositions: entry.positions,
    attributes,
    provenance,
  }
}

const GOALIE_HALF_WEIGHT = 1500

function estimateGoalies(
  chosen: readonly { player: ChosenPlayer<GoalieRecord>; clubId: string }[],
  reference: Reference,
  options: Required<Pick<EstimateOptions, 'ageDate' | 'seed'>>,
): Goalie[] {
  const anchor = percentiles(
    chosen.map(({ player }) => ({ id: player.record.playerId, value: player.record.timeOnIce, weight: 1 })),
  )
  const saves = percentiles(
    chosen
      .filter(({ player }) => player.record.evShotsAgainst > 0)
      .map(({ player: { record } }) => ({
        id: record.playerId,
        value: record.evSaves / record.evShotsAgainst,
        weight: record.evShotsAgainst,
      })),
  )
  const final = percentiles(
    chosen.map(({ player: { record } }) => {
      const level = anchor.get(record.playerId)!
      const rank = saves.get(record.playerId)
      const own = rank === undefined ? 0 : evidence(record.evShotsAgainst, GOALIE_HALF_WEIGHT)
      return { id: record.playerId, value: own * (rank ?? 0) + (1 - own) * level, weight: 1 }
    }),
  )

  return chosen.map(({ player: { record, stint }, clubId }) => {
    const rng = playerRng(options.seed, record.playerId)
    const ability = quantile(reference.goalieAbility, final.get(record.playerId)!)
    const attributes: GoalieAttributes = generateGoalieAttributes(rng.fork('attributes'), ability)
    const shots = record.evShotsAgainst
    const entry: AttributeProvenance =
      shots > 0
        ? {
            source: 'derived',
            confidence: confidenceOf(0.4, evidence(shots, GOALIE_HALF_WEIGHT)),
            note: `level from ${(record.evSaves / shots).toFixed(3)} even-strength save percentage on ${shots} shots`,
          }
        : { source: 'generated', confidence: 0.25, note: 'generated around the level of his ice time' }
    const age = ageOn(record.birthDate, options.ageDate)
    const level = goalieLevel(attributes)
    return {
      kind: 'goalie',
      id: `nhl-${record.playerId}`,
      clubId,
      firstName: stint.firstName,
      lastName: stint.lastName,
      age,
      potential: potentialOf(level, abilityOfLevel(level), drawHeadroom(rng.fork('potential'), age)),
      handedness: record.catches === 'R' ? 'right' : 'left',
      form: 50,
      fatigue: 0,
      attributes,
      provenance: Object.fromEntries(GOALIE_ATTRIBUTE_KEYS.map((key) => [key, entry])) as Record<
        keyof GoalieAttributes,
        AttributeProvenance
      >,
    }
  })
}

/** Generated Players for what a real Club lacks, at the depth of a call-up (ADR-020). */
function fillClub(
  clubId: string,
  forwards: readonly SkaterPosition[],
  defence: readonly SkaterPosition[],
  goalies: number,
  seed: number,
): { skaters: Skater[]; goalies: Goalie[] } {
  const total = forwards.length + defence.length + goalies
  if (total === 0) return { skaters: [], goalies: [] }

  const rng = createRng(seed).fork(`fill:${clubId}`)
  const names = generateDistinctNames(rng, total)
  let n = 0
  const skater = (natural: SkaterPosition, slots: readonly number[]) => {
    const { ability } = drawAbility(rng, slots[slots.length - 1]!, 0)
    const { age, headroom } = generateAgeAndHeadroom(rng, ability)
    return generateSkater(rng, {
      id: `${clubId}-fill-${n}`,
      clubId,
      person: names[n++]!,
      natural,
      ability,
      age,
      headroom,
    })
  }

  const skaters = [
    ...forwards.map((p) => skater(p, FORWARD_SLOT_ABILITY)),
    ...defence.map((p) => skater(p, DEFENCE_SLOT_ABILITY)),
  ]
  const generatedGoalies = Array.from({ length: goalies }, () => {
    const slot = GOALIE_SLOT_ABILITY[GOALIE_SLOT_ABILITY.length - 1]!
    const { ability } = drawAbility(rng, slot, 0, GOALIE_ABILITY_NOISE)
    const { age, headroom } = generateAgeAndHeadroom(rng, ability)
    return generateGoalie(rng, {
      id: `${clubId}-fill-${n}`,
      clubId,
      person: names[n++]!,
      ability,
      age,
      headroom,
    })
  })
  return { skaters, goalies: generatedGoalies }
}

const listedNatural = (r: SkaterRecord): SkaterPosition =>
  r.position === 'C' ? 'C' : r.position === 'L' ? 'LW' : r.position === 'R' ? 'RW' : r.shoots === 'R' ? 'RD' : 'LD'

export function estimateRosters(records: SeasonRecords, options: EstimateOptions): CompetitionRosters {
  const reference = options.reference ?? buildReference()
  const settings = { ageDate: options.ageDate, seed: options.seed ?? ESTIMATE_SEED }
  const chosen = chooseRosters(records, options.clubs)

  const entries: SkaterEntry[] = []
  const fills = new Map<string, ReturnType<typeof fillClub>>()
  for (const { club, forwards, defence, goalies } of chosen) {
    const skaters = [...forwards, ...defence]
    const fillForwards = fillPositions(
      forwards.map((p) => listedNatural(p.record)),
      'forwards',
      ROSTER_SHAPE.forwards - forwards.length,
    )
    const fillDefence = fillPositions(
      defence.map((p) => listedNatural(p.record)),
      'defence',
      ROSTER_SHAPE.defence - defence.length,
    )
    const extra = new Map<SkaterPosition, number>()
    for (const p of [...fillForwards, ...fillDefence]) extra.set(p, (extra.get(p) ?? 0) + 1)

    const positions = assignPositions(
      skaters.map(({ record, stint }) => ({
        id: record.playerId,
        listed: record.position,
        shoots: record.shoots,
        faceoffsTaken: record.faceoffsTaken,
        clubToi: stint.timeOnIce,
      })),
      extra,
    )
    for (const { record, stint } of skaters) {
      const playerPositions = positions.get(record.playerId)!
      entries.push({
        record,
        stint,
        clubId: club.id,
        positions: playerPositions,
        group: groupOf(playerPositions[0]!),
      })
    }
    fills.set(
      club.id,
      fillClub(club.id, fillForwards, fillDefence, ROSTER_SHAPE.goalies - goalies.length, settings.seed),
    )
  }

  const levels = iceTimeLevels(entries)
  const estimates = new Map(RULES.map((rule) => [rule.key, estimateRule(rule, entries, levels, reference)]))
  const goalies = estimateGoalies(
    chosen.flatMap(({ club, goalies: list }) => list.map((player) => ({ player, clubId: club.id }))),
    reference,
    settings,
  )

  const clubsById = new Map<string, Club>(
    chosen.map(({ club }) => {
      const fill = fills.get(club.id)!
      return [
        club.id,
        {
          id: club.id,
          code: club.code,
          name: club.name,
          skaters: [
            ...entries
              .filter((e) => e.clubId === club.id)
              .map((e) => skaterOf(e, estimates, levels.get(e.record.playerId)!, reference, settings)),
            ...fill.skaters,
          ],
          goalies: [...goalies.filter((g) => g.clubId === club.id), ...fill.goalies],
        },
      ]
    }),
  )

  const order = options.structure.divisions.flatMap((division) => division.clubIds)
  const missing = order.filter((id) => !clubsById.has(id))
  if (missing.length > 0) throw new Error(`No NHL code for Clubs ${missing.join(', ')}`)
  return { structure: options.structure, clubs: order.map((id) => clubsById.get(id)!) }
}
