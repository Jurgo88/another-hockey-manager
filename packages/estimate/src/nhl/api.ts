import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { RawOutcome } from './outcome.js'
import { GOALIE_REPORTS, SKATER_REPORTS, type RawSeason } from './records.js'

/**
 * The only I/O in the package: public NHL endpoints, each response cached as a
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
