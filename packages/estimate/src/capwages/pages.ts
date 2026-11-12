/**
 * Contracts as CapWages shows them on a Club's page (#122): the JSON the page
 * embeds, reduced to what the Phase 3 measurements read. A view is the league
 * as one season saw it - the live pages for the season to come, archived pages
 * from the end of earlier seasons.
 */

export interface CapSeason {
  /** The calendar year the season starts in. */
  season: number
  /** In dollars. */
  capHit: number
}

export interface CapContract {
  type: string
  entryLevel: boolean
  signedWith: string
  /** 'UFA', 'RFA', or as given: 'RFA (Arb)', 'UFA (Group 6)'. */
  expiryStatus: string
  seasons: readonly CapSeason[]
}

export interface CapPlayer {
  slug: string
  lastName: string
  /** ISO date. */
  birthDate: string
  position: string
  /** The Club whose page lists him. */
  club: string
  clubName: string
  contracts: readonly CapContract[]
}

export interface CapClub {
  club: string
  name: string
  upperLimit: number
  lowerLimit: number
  /** The Club's cap hit in all, dead money included, as the page summarises it. */
  payroll: number
}

export interface CapView {
  /** The season the view shows, by its starting year. */
  season: number
  clubs: readonly CapClub[]
  players: readonly CapPlayer[]
}

type Row = Readonly<Record<string, unknown>>
const isRow = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const str = (row: Row | undefined, key: string): string | undefined => {
  const value = row?.[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}
const num = (row: Row | undefined, key: string): number | undefined => {
  const value = row?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** The page's embedded data, or null when it has none. */
export function pagePropsOf(html: string): Row | null {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)
  if (!match) return null
  const data: unknown = JSON.parse(match[1]!)
  const props = isRow(data) && isRow(data.props) ? data.props.pageProps : undefined
  return isRow(props) ? props : null
}

/** '$13,250,000' in dollars. */
export function dollars(text: string | undefined): number | undefined {
  if (!text) return undefined
  const value = Number(text.replace(/[$,\s]/g, ''))
  return Number.isFinite(value) ? value : undefined
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** 'Sep. 17, 1997' as '1997-09-17'. */
export function isoDate(text: string | undefined): string | undefined {
  const match = text?.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),\s*(\d{4})$/)
  if (!match) return undefined
  const month = MONTHS.indexOf(match[1]!.slice(0, 3).toLowerCase())
  if (month < 0) return undefined
  return `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[2]!.padStart(2, '0')}`
}

/** '2025-26' as 2025. */
const seasonYear = (text: string | undefined) => (text ? Number(text.slice(0, 4)) : NaN)

function contractOf(row: Row): CapContract | null {
  const details = Array.isArray(row.details) ? row.details.filter(isRow) : []
  const seasons = details
    .map((d) => ({ season: seasonYear(str(d, 'season')), capHit: dollars(str(d, 'capHit')) }))
    .filter((s): s is CapSeason => Number.isFinite(s.season) && s.capHit !== undefined)
  const type = str(row, 'type') ?? ''
  if (seasons.length === 0) return null
  return {
    type,
    entryLevel: /entry-level/i.test(type),
    signedWith: str(row, 'signingTeam') ?? '',
    expiryStatus: str(row, 'expiryStatus') ?? '',
    seasons: seasons.sort((a, b) => a.season - b.season),
  }
}

/** Lists of Players under contract: the roster and those outside it, not dead money. */
function playerLists(data: Row): Row[] {
  const lists: Row[] = []
  for (const group of ['roster', 'inactive', 'non-roster']) {
    const section = data[group]
    if (!isRow(section)) continue
    for (const list of Object.values(section))
      if (Array.isArray(list)) lists.push(...list.filter(isRow))
  }
  return lists
}

/** One Club's page in a view. */
export function clubPageOf(props: Row): { club: CapClub; players: CapPlayer[] } {
  const meta = isRow(props.teamMetadata) ? props.teamMetadata : undefined
  const summary = isRow(props.teamSummary) ? props.teamSummary : undefined
  const capHit = summary && isRow(summary.capHit) ? summary.capHit : undefined
  const code = str(meta, 'tricode')
  const name = str(meta, 'name') ?? str(props, 'teamName')
  const upperLimit = num(summary, 'upperLimit')
  const lowerLimit = num(summary, 'lowerLimit')
  const payroll = num(capHit, 'total')
  if (
    !code ||
    !name ||
    upperLimit === undefined ||
    lowerLimit === undefined ||
    payroll === undefined
  ) {
    throw new Error('a CapWages page without its Club or cap summary')
  }
  const data = isRow(props.data) ? props.data : {}
  const seen = new Set<string>()
  const players: CapPlayer[] = []
  for (const row of playerLists(data)) {
    const slug = str(row, 'slug')
    const fullName = str(row, 'name')
    const birthDate = isoDate(str(row, 'born'))
    if (!slug || !fullName || !birthDate || seen.has(slug)) continue
    seen.add(slug)
    const contracts = (Array.isArray(row.contracts) ? row.contracts.filter(isRow) : [])
      .map(contractOf)
      .filter((c): c is CapContract => c !== null)
    players.push({
      slug,
      lastName: fullName.split(',')[0]!.trim(),
      birthDate,
      position: str(row, 'pos') ?? '',
      club: code,
      clubName: name,
      contracts,
    })
  }
  return { club: { club: code, name, upperLimit, lowerLimit, payroll }, players }
}

/** A view from its Club pages' embedded data. */
export function viewOf(season: number, pages: readonly Row[]): CapView {
  const clubs: CapClub[] = []
  const players: CapPlayer[] = []
  for (const props of pages) {
    const page = clubPageOf(props)
    clubs.push(page.club)
    players.push(...page.players)
  }
  return { season, clubs, players }
}
