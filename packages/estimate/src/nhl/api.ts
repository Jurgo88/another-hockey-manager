import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { RawHistory } from './history.js'
import { playersWithSeveralClubs, stintsOf, type RawMovement } from './movement.js'
import type { RawOutcome } from './outcome.js'
import { GOALIE_REPORTS, SKATER_REPORTS, type RawSeason } from './records.js'

/**
 * I/O with public NHL endpoints, each response cached as a
 * file so an estimate can be repeated without the network (ADR-021). The cache
 * is not committed.
 */

const STATS = 'https://api.nhle.com/stats/rest/en'
const WEB = 'https://api-web.nhle.com/v1'

export interface FetchOptions {
  cacheDir: string
  /** Fetch again even where a cached response exists. */
  refresh: boolean
  log: (message: string) => void
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function getJson(url: string): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url)
    if (response.ok) return response.json()
    // 404 is an answer: EDGE has nothing for some Players.
    if (response.status === 404) return null
    if (attempt === 8) throw new Error(`${url}: HTTP ${response.status}`)
    // 429 means too fast: wait as long as the server asks, or back off.
    const asked = Number(response.headers.get('retry-after'))
    await pause(Number.isFinite(asked) && asked > 0 ? asked * 1000 : 2000 * 2 ** attempt)
  }
}

async function cached(path: string, url: string, options: FetchOptions): Promise<unknown> {
  if (!options.refresh && existsSync(path)) {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown
  }
  const value = await getJson(url)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value))
  return value
}

const seasonFilter = (season: string) =>
  `cayenneExp=${encodeURIComponent(`seasonId=${season} and gameTypeId=2`)}`

/** Every response a season needs except EDGE, which depends on who is chosen. */
export async function fetchSeason(
  season: string,
  clubCodes: readonly string[],
  options: FetchOptions,
): Promise<RawSeason> {
  const dir = join(options.cacheDir, season)
  const report = (kind: 'skater' | 'goalie', name: string) =>
    cached(
      join(dir, `${kind}-${name}.json`),
      `${STATS}/${kind}/${name}?limit=-1&${seasonFilter(season)}`,
      options,
    )

  options.log(`Season ${season}: league reports`)
  const skater: Record<string, unknown> = {}
  for (const name of SKATER_REPORTS) skater[name] = await report('skater', name)
  const goalie: Record<string, unknown> = {}
  for (const name of GOALIE_REPORTS) goalie[name] = await report('goalie', name)

  options.log(`Season ${season}: ${clubCodes.length} Clubs`)
  const clubs: Record<string, unknown> = {}
  for (const code of clubCodes) {
    clubs[code] = await cached(
      join(dir, 'clubs', `${code}.json`),
      `${WEB}/club-stats/${code}/${season}/2`,
      options,
    )
  }

  return { season, skater, goalie, clubs, edge: {} } as RawSeason
}

/** NHL EDGE detail for the given Skaters, a few requests at a time. */
export async function fetchEdge(
  season: string,
  playerIds: readonly number[],
  options: FetchOptions,
): Promise<Record<string, unknown>> {
  const dir = join(options.cacheDir, season, 'edge')
  const edge: Record<string, unknown> = {}
  const queue = [...playerIds]
  let done = 0

  options.log(`Season ${season}: NHL EDGE for ${playerIds.length} Skaters`)
  const worker = async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      edge[String(id)] = await cached(
        join(dir, `${id}.json`),
        `${WEB}/edge/skater-detail/${id}/${season}/2`,
        options,
      )
      if (++done % 100 === 0) options.log(`  ${done}/${playerIds.length}`)
    }
  }
  await Promise.all(Array.from({ length: 2 }, worker))
  return edge
}

/** The real table and leaders, for comparing a simulated Season with (#18). */
export async function fetchOutcome(raw: RawSeason, options: FetchOptions): Promise<RawOutcome> {
  const dir = join(options.cacheDir, raw.season)
  return {
    season: raw.season,
    teamSummary: await cached(
      join(dir, 'team-summary.json'),
      `${STATS}/team/summary?limit=-1&${seasonFilter(raw.season)}`,
      options,
    ),
    teamList: await cached(join(dir, 'team-list.json'), `${STATS}/team`, options),
    skaterSummary: raw.skater.summary,
    goalieSummary: raw.goalie.summary,
  }
}

const rangeFilter = (first: string, last: string) =>
  `cayenneExp=${encodeURIComponent(`seasonId>=${first} and seasonId<=${last} and gameTypeId=2`)}`

/**
 * Everything the Phase 2 measurements read (#83): per-season reports, careers
 * across the range with their drafts, draft classes, and NHL EDGE for the
 * Skaters of the last season in the season before it.
 */
export async function fetchHistory(
  seasons: readonly string[],
  careerRange: { first: string; last: string },
  draftYears: readonly number[],
  options: FetchOptions,
): Promise<RawHistory> {
  const dir = join(options.cacheDir, 'history')
  const report = (season: string, kind: string, name: string) =>
    cached(
      join(options.cacheDir, season, `${kind}-${name}.json`),
      `${STATS}/${kind}/${name}?limit=-1&${seasonFilter(season)}`,
      options,
    )

  const bySeason: Record<string, RawHistory['seasons'][string]> = {}
  for (const season of seasons) {
    options.log(`Season ${season}`)
    bySeason[season] = {
      skaterSummary: await report(season, 'skater', 'summary'),
      skaterBios: await report(season, 'skater', 'bios'),
      skaterRates: await report(season, 'skater', 'scoringRates'),
      goalieSummary: await report(season, 'goalie', 'summary'),
      goalieBios: await report(season, 'goalie', 'bios'),
      goalieSaves: await report(season, 'goalie', 'savesByStrength'),
      teamSummary: await report(season, 'team', 'summary'),
    }
  }

  const range = rangeFilter(careerRange.first, careerRange.last)
  const career = (kind: string) =>
    cached(
      join(dir, `career-${kind}-${careerRange.first}-${careerRange.last}.json`),
      `${STATS}/${kind}/bios?isAggregate=true&limit=-1&${range}`,
      options,
    )

  options.log(
    `Careers ${careerRange.first}-${careerRange.last}, drafts ${draftYears[0]}-${draftYears.at(-1)}`,
  )
  const drafts: Record<string, unknown> = {}
  for (const year of draftYears) {
    drafts[String(year)] = await cached(
      join(dir, `draft-${year}.json`),
      `${WEB}/draft/picks/${year}/all`,
      options,
    )
  }

  // EDGE has no league-wide report, so one pair of seasons: the last one's
  // Skaters, already fetched for the roster file, and the season before.
  const last = seasons[seasons.length - 1]!
  const before = seasons[seasons.length - 2]!
  const lastEdge = await fetchEdge(last, edgeIdsOf(options.cacheDir, last), options)
  const beforeEdge = await fetchEdge(before, Object.keys(lastEdge).map(Number), options)

  return {
    seasons: bySeason,
    teamList: await cached(join(dir, 'team-list.json'), `${STATS}/team`, options),
    careerSkaters: await career('skater'),
    careerGoalies: await career('goalie'),
    drafts,
    edge: { [before]: beforeEdge, [last]: lastEdge },
  }
}

/** The Club codes of a season: every code in its Skaters' `teamAbbrevs`. */
function clubCodesOf(skaterSummary: unknown): string[] {
  const data =
    typeof skaterSummary === 'object' && skaterSummary !== null
      ? (skaterSummary as { data?: unknown }).data
      : undefined
  const codes = new Set<string>()
  for (const row of Array.isArray(data) ? data : []) {
    const abbrevs = (row as { teamAbbrevs?: unknown }).teamAbbrevs
    if (typeof abbrevs === 'string') for (const code of abbrevs.split(',')) codes.add(code.trim())
  }
  return [...codes].filter((code) => code !== '').sort()
}

/**
 * Everything the Phase 3 measurements of movement read (#122): per season, the
 * league reports, each Club's stints, one Club's schedule for the calendar, and
 * the game logs of the Players who played for more than one Club.
 */
export async function fetchMovement(
  seasons: readonly string[],
  options: FetchOptions,
): Promise<RawMovement> {
  const bySeason: Record<string, RawMovement['seasons'][string]> = {}
  for (const season of seasons) {
    const dir = join(options.cacheDir, season)
    const report = (kind: string, name: string) =>
      cached(
        join(dir, `${kind}-${name}.json`),
        `${STATS}/${kind}/${name}?limit=-1&${seasonFilter(season)}`,
        options,
      )

    const skaterSummary = await report('skater', 'summary')
    const codes = clubCodesOf(skaterSummary)
    options.log(`Season ${season}: ${codes.length} Clubs`)
    const clubs: Record<string, unknown> = {}
    for (const code of codes) {
      clubs[code] = await cached(
        join(dir, 'clubs', `${code}.json`),
        `${WEB}/club-stats/${code}/${season}/2`,
        options,
      )
    }
    const schedule = await cached(
      join(dir, 'schedule-TOR.json'),
      `${WEB}/club-schedule-season/TOR/${season}`,
      options,
    )

    const several = playersWithSeveralClubs(stintsOf(Number(season.slice(0, 4)), clubs))
    options.log(`Season ${season}: game logs of ${several.length} Players with more than one Club`)
    const gameLogs: Record<string, unknown> = {}
    for (const id of several) {
      gameLogs[String(id)] = await cached(
        join(dir, 'game-logs', `${id}.json`),
        `${WEB}/player/${id}/game-log/${season}/2`,
        options,
      )
    }

    bySeason[season] = {
      skaterSummary,
      skaterBios: await report('skater', 'bios'),
      goalieSummary: await report('goalie', 'summary'),
      goalieBios: await report('goalie', 'bios'),
      clubs,
      schedule,
      gameLogs,
    }
  }
  return { seasons: bySeason }
}

/** Player ids with EDGE already cached for a season. */
function edgeIdsOf(cacheDir: string, season: string): number[] {
  const dir = join(cacheDir, season, 'edge')
  return existsSync(dir) ? readdirSync(dir).map((file) => Number(file.replace('.json', ''))) : []
}
