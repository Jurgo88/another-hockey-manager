import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pagePropsOf, viewOf, type CapView } from './pages.js'

/**
 * Club pages from CapWages (#122): live for the season to come, and from the
 * Internet Archive for the end of earlier seasons. Only each page's embedded
 * data is cached, outside git, and only derived tables are committed (R-10).
 */

const SITE = 'https://capwages.com/teams'
const ARCHIVE = 'https://web.archive.org/web'
const USER_AGENT = 'Mozilla/5.0 (compatible; measurement script)'

/** The 32 Club pages, by their slug on CapWages. */
export const CAPWAGES_CLUBS = [
  'anaheim_ducks',
  'boston_bruins',
  'buffalo_sabres',
  'calgary_flames',
  'carolina_hurricanes',
  'chicago_blackhawks',
  'colorado_avalanche',
  'columbus_blue_jackets',
  'dallas_stars',
  'detroit_red_wings',
  'edmonton_oilers',
  'florida_panthers',
  'los_angeles_kings',
  'minnesota_wild',
  'montreal_canadiens',
  'nashville_predators',
  'new_jersey_devils',
  'new_york_islanders',
  'new_york_rangers',
  'ottawa_senators',
  'philadelphia_flyers',
  'pittsburgh_penguins',
  'san_jose_sharks',
  'seattle_kraken',
  'st_louis_blues',
  'tampa_bay_lightning',
  'toronto_maple_leafs',
  'utah_mammoth',
  'vancouver_canucks',
  'vegas_golden_knights',
  'washington_capitals',
  'winnipeg_jets',
] as const

/** Earlier slugs of a Club that was renamed. */
const FORMER_SLUGS: Readonly<Record<string, readonly string[]>> = {
  utah_mammoth: ['utah_hockey_club'],
}

export interface CapFetchOptions {
  cacheDir: string
  refresh: boolean
  log: (message: string) => void
}

type Props = Readonly<Record<string, unknown>>

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function getText(url: string): Promise<string | null> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } })
    if (response.ok) return response.text()
    if (response.status === 404) return null
    if (attempt === 5) throw new Error(`${url}: HTTP ${response.status}`)
    await pause(3000 * 2 ** attempt)
  }
}

async function cachedProps(
  path: string,
  load: () => Promise<Props | null>,
  options: CapFetchOptions,
) {
  if (!options.refresh && existsSync(path))
    return JSON.parse(readFileSync(path, 'utf8')) as Props | null
  const props = await load()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(props))
  await pause(1500)
  return props
}

/** What a Club page holds that the measurements read. */
const reduce = (props: Props | null): Props | null =>
  props && {
    teamMetadata: props.teamMetadata,
    teamName: props.teamName,
    teamSummary: props.teamSummary,
    data: props.data,
  }

/** The live Club pages: the season to come. */
export async function fetchLivePages(view: string, options: CapFetchOptions): Promise<Props[]> {
  const pages: Props[] = []
  options.log(`CapWages ${view}: live Club pages`)
  for (const slug of CAPWAGES_CLUBS) {
    const props = await cachedProps(
      join(options.cacheDir, 'capwages', view, `${slug}.json`),
      async () => {
        const html = await getText(`${SITE}/${slug}`)
        return reduce(html ? pagePropsOf(html) : null)
      },
      options,
    )
    if (!props) throw new Error(`CapWages ${slug}: no page data`)
    pages.push(props)
  }
  return pages
}

/**
 * Club pages as the Internet Archive kept them during a season: the latest
 * copy inside [from, to] (YYYYMMDD) that still shows that season, known by its
 * upper limit. Late in spring a page may already show the next league year,
 * without the contracts that ended. A Club without such a copy is left out
 * and logged. The chosen copy's timestamp is kept with the page.
 */
export async function fetchArchivedPages(
  view: string,
  window: { from: string; to: string; upperLimit: number },
  options: CapFetchOptions,
): Promise<Props[]> {
  const pages: Props[] = []
  options.log(`CapWages ${view}: archived Club pages, ${window.from} to ${window.to}`)
  for (const slug of CAPWAGES_CLUBS) {
    const props = await cachedProps(
      join(options.cacheDir, 'capwages', view, `${slug}.json`),
      async () => {
        for (const candidate of [slug, ...(FORMER_SLUGS[slug] ?? [])]) {
          const list = await getText(
            `https://web.archive.org/cdx/search/cdx?url=capwages.com/teams/${candidate}&from=${window.from}&to=${window.to}&filter=statuscode:200&fl=timestamp`,
          )
          const stamps = (list ?? '')
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => /^\d{14}$/.test(line))
          for (const stamp of stamps.reverse().slice(0, 6)) {
            const html = await getText(`${ARCHIVE}/${stamp}id_/${SITE}/${candidate}`)
            const props = html ? pagePropsOf(html) : null
            const summary = props?.teamSummary as { upperLimit?: unknown } | undefined
            if (props && summary?.upperLimit === window.upperLimit)
              return { ...reduce(props), archivedAt: stamp }
            await pause(1500)
          }
        }
        return null
      },
      options,
    )
    if (props) pages.push(props)
    else
      options.log(
        `  ${slug}: no archived copy of the season between ${window.from} and ${window.to}`,
      )
  }
  return pages
}

/**
 * The archived views read, by the season they show: the latest copy within the
 * season whose upper limit is still that season's (#122).
 */
export const ARCHIVED_VIEWS: Readonly<
  Record<number, { label: string; from: string; to: string; upperLimit: number }>
> = {
  2024: { label: '2024-25', from: '20241001', to: '20250630', upperLimit: 88_000_000 },
  2025: { label: '2025-26', from: '20251001', to: '20260630', upperLimit: 95_500_000 },
}

/** The league as a season saw it: archived for an earlier season, live for the one to come. */
export async function fetchView(season: number, options: CapFetchOptions): Promise<CapView> {
  const archived = ARCHIVED_VIEWS[season]
  if (archived) return viewOf(season, await fetchArchivedPages(archived.label, archived, options))
  if (season === 2026) return viewOf(season, await fetchLivePages('2026-27', options))
  throw new Error(`no CapWages view of season ${season}`)
}
