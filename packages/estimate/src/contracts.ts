import type { CapContract, CapPlayer, CapView } from './capwages/pages.js'
import { ageOn } from './estimate.js'
import type { SeasonPlayer } from './nhl/movement.js'

/**
 * The Phase 3 measurements of contracts (#122): what share of the cap a role
 * is paid, how Club payrolls spread, how long contracts run by age, and who
 * re-signs. Pure functions of CapWages views joined with NHL seasons;
 * `pnpm sim:measure --contracts` prints them.
 */

/** The league minimum by season, from the CBA (ADR-030). */
export const LEAGUE_MINIMUM: Readonly<Record<number, number>> = {
  2024: 775_000,
  2025: 775_000,
  2026: 850_000,
}

export const CONTRACT_AGE_BANDS = [
  { label: '21 or younger', from: 0, to: 21 },
  { label: '22-24', from: 22, to: 24 },
  { label: '25-27', from: 25, to: 27 },
  { label: '28-30', from: 28, to: 30 },
  { label: '31-33', from: 31, to: 33 },
  { label: '34 or older', from: 34, to: 99 },
] as const

export type Group = 'forward' | 'defence' | 'goalie'
export const GROUPS: readonly Group[] = ['forward', 'defence', 'goalie']
const groupOf = (position: string): Group | undefined =>
  position === 'G'
    ? 'goalie'
    : position === 'D'
      ? 'defence'
      : 'CLR'.includes(position) && position
        ? 'forward'
        : undefined

const ageIn = (birthDate: string, season: number) => ageOn(birthDate, `${season}-10-01`)

/** Lower case, letters only, accents dropped: 'Stützle' and 'Stuetzle' still differ, 'Slafkovský' does not. */
export const nameKey = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')

export interface Joined {
  cap: CapPlayer
  nhl: SeasonPlayer
}

/**
 * CapWages Players matched with NHL Players of the view's season by birth date
 * and last name, or by birth date alone where only one NHL Player has it.
 */
export function joinView(
  view: CapView,
  players: readonly SeasonPlayer[],
): { joined: Joined[]; unmatched: number } {
  const season = players.filter((p) => p.season === view.season)
  const byKey = new Map(season.map((p) => [`${p.birthDate}:${nameKey(p.lastName)}`, p]))
  const byBirth = new Map<string, SeasonPlayer[]>()
  for (const p of season) byBirth.set(p.birthDate, [...(byBirth.get(p.birthDate) ?? []), p])
  const joined: Joined[] = []
  const used = new Set<number>()
  const slugs = new Set<string>()
  let unmatched = 0
  for (const cap of view.players) {
    // Archived pages of a view are copied on different days, so a Player
    // traded between two copies is listed by both Clubs: he counts once.
    if (slugs.has(cap.slug)) continue
    slugs.add(cap.slug)
    const exact = byKey.get(`${cap.birthDate}:${nameKey(cap.lastName)}`)
    const alone = byBirth.get(cap.birthDate)
    const nhl = exact ?? (alone?.length === 1 ? alone[0] : undefined)
    if (nhl && !used.has(nhl.playerId)) {
      used.add(nhl.playerId)
      joined.push({ cap, nhl })
    } else unmatched++
  }
  return { joined, unmatched }
}

/** The contract covering a season, if any. */
export function contractIn(player: CapPlayer, season: number): CapContract | undefined {
  return player.contracts.find((c) => c.seasons.some((s) => s.season === season))
}

const capHitIn = (player: CapPlayer, season: number) =>
  contractIn(player, season)?.seasons.find((s) => s.season === season)?.capHit

const upperLimitOf = (view: CapView) => {
  const limit = view.clubs[0]?.upperLimit
  if (!limit) throw new Error(`view ${view.season}: no upper limit`)
  return limit
}

const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / (values.length || 1)
function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}
const sd = (values: readonly number[]) => {
  const m = mean(values)
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)))
}

/** A regular with his role: rank by ice time per Fixture in his group, Goalies by Fixtures (ADR-027). */
export interface Regular {
  joined: Joined
  group: Group
  /** 0 for the top tenth of his group, 9 for the bottom. */
  tenth: number
  share: number
  contract: CapContract
}

export function regularsOf(view: CapView, joined: readonly Joined[], minMatches = 20): Regular[] {
  const limit = upperLimitOf(view)
  const regulars: Regular[] = []
  for (const group of GROUPS) {
    const members = joined
      .filter((j) => groupOf(j.nhl.position) === group && j.nhl.matchesPlayed >= minMatches)
      .map((j) => ({
        j,
        contract: contractIn(j.cap, view.season),
        capHit: capHitIn(j.cap, view.season),
      }))
      .filter(
        (m): m is { j: Joined; contract: CapContract; capHit: number } =>
          !!m.contract && m.capHit !== undefined,
      )
      .sort((a, b) =>
        group === 'goalie'
          ? b.j.nhl.matchesPlayed - a.j.nhl.matchesPlayed
          : b.j.nhl.toiPerMatch - a.j.nhl.toiPerMatch,
      )
    members.forEach((m, rank) =>
      regulars.push({
        joined: m.j,
        group,
        tenth: Math.min(9, Math.floor((rank / members.length) * 10)),
        share: m.capHit / limit,
        contract: m.contract,
      }),
    )
  }
  return regulars
}

export interface TenthRow {
  tenth: number
  players: number
  mean: number
  median: number
}

/** Cap share by tenth of role, for one group. */
export function shareByTenth(regulars: readonly Regular[], group: Group): TenthRow[] {
  return Array.from({ length: 10 }, (_, tenth) => {
    const shares = regulars
      .filter((r) => r.group === group && r.tenth === tenth)
      .map((r) => r.share)
    return { tenth, players: shares.length, mean: mean(shares), median: median(shares) }
  })
}

export type Status = 'entry-level' | 'restricted' | 'unrestricted'
export const statusOf = (c: CapContract): Status =>
  c.entryLevel ? 'entry-level' : c.expiryStatus.startsWith('RFA') ? 'restricted' : 'unrestricted'

/** Skaters' mean cap share by thirds of role and contract status. */
export function shareByStatus(
  regulars: readonly Regular[],
): { third: number; status: Status; players: number; mean: number }[] {
  const rows: { third: number; status: Status; players: number; mean: number }[] = []
  for (let third = 0; third < 3; third++) {
    for (const status of ['entry-level', 'restricted', 'unrestricted'] as const) {
      const shares = regulars
        .filter(
          (r) => r.group !== 'goalie' && Math.min(2, Math.floor((r.tenth * 3) / 10)) === third,
        )
        .filter((r) => statusOf(r.contract) === status)
        .map((r) => r.share)
      rows.push({ third, status, players: shares.length, mean: mean(shares) })
    }
  }
  return rows
}

/** Regulars' cap share by age, with the mean tenth of their role. */
export function shareByAge(regulars: readonly Regular[], season: number) {
  return CONTRACT_AGE_BANDS.map((band) => {
    const members = regulars.filter((r) => {
      const age = ageIn(r.joined.cap.birthDate, season)
      return age >= band.from && age <= band.to
    })
    return {
      group: band.label,
      players: members.length,
      mean: mean(members.map((r) => r.share)),
      meanTenth: mean(members.map((r) => r.tenth)) + 1,
    }
  })
}

/** League-wide shares among regulars: at the minimum, and on entry-level contracts. */
export function contractMix(regulars: readonly Regular[], view: CapView) {
  const minimum = LEAGUE_MINIMUM[view.season]
  if (minimum === undefined) throw new Error(`no league minimum for ${view.season}`)
  const limit = upperLimitOf(view)
  const atMinimum = regulars.filter((r) => r.share * limit <= minimum + 1_000).length
  const status = (s: Status) => regulars.filter((r) => statusOf(r.contract) === s).length
  return {
    regulars: regulars.length,
    atMinimum: atMinimum / (regulars.length || 1),
    entryLevel: status('entry-level') / (regulars.length || 1),
    restricted: status('restricted') / (regulars.length || 1),
    unrestricted: status('unrestricted') / (regulars.length || 1),
  }
}

/** Club payrolls as shares of the cap. */
export function payrolls(view: CapView, nearFloor = 0.03) {
  const shares = view.clubs.map((c) => c.payroll / c.upperLimit)
  const floor = (view.clubs[0]?.lowerLimit ?? 0) / upperLimitOf(view)
  return {
    clubs: shares.length,
    mean: mean(shares),
    sd: sd(shares),
    min: Math.min(...shares),
    max: Math.max(...shares),
    floor,
    nearFloor: shares.filter((s) => s <= floor + nearFloor).length,
  }
}

/** Each NHL Player's third of role in his group in a season, among those with `minMatches` or more. */
export function thirdsOfRole(
  players: readonly SeasonPlayer[],
  season: number,
  minMatches = 20,
): Map<number, number> {
  const thirds = new Map<number, number>()
  for (const group of GROUPS) {
    const members = players
      .filter(
        (p) =>
          p.season === season && p.matchesPlayed >= minMatches && groupOf(p.position) === group,
      )
      .sort((a, b) =>
        group === 'goalie' ? b.matchesPlayed - a.matchesPlayed : b.toiPerMatch - a.toiPerMatch,
      )
    members.forEach((p, rank) =>
      thirds.set(p.playerId, Math.min(2, Math.floor((rank / members.length) * 3))),
    )
  }
  return thirds
}

const termRow = (group: string, terms: readonly number[]) => ({
  group,
  contracts: terms.length,
  median: median(terms),
  mean: mean(terms),
  oneYear: terms.filter((t) => t === 1).length / (terms.length || 1),
  fivePlus: terms.filter((t) => t >= 5).length / (terms.length || 1),
})

/**
 * Standard contracts that begin in the view's season, signed by Players who
 * were regulars the season before: how long they run, by age at their start
 * and by third of the role they had. Entry-level contracts follow the CBA and
 * are left out.
 */
export function termsAtSigning(view: CapView, players: readonly SeasonPlayer[]) {
  const before = view.season - 1
  const thirds = thirdsOfRole(players, before)
  const { joined } = joinView({ ...view, season: before }, players)
  const signed = joined.flatMap(({ cap, nhl }) => {
    const third = thirds.get(nhl.playerId)
    if (third === undefined) return []
    return cap.contracts
      .filter((c) => !c.entryLevel && c.seasons[0]?.season === view.season)
      .map((c) => ({ age: ageIn(cap.birthDate, view.season), third, term: c.seasons.length }))
  })
  return {
    byAge: CONTRACT_AGE_BANDS.map((band) =>
      termRow(
        band.label,
        signed.filter((s) => s.age >= band.from && s.age <= band.to).map((s) => s.term),
      ),
    ),
    byRole: ['Top third', 'Middle third', 'Bottom third'].map((label, third) =>
      termRow(
        label,
        signed.filter((s) => s.third === third).map((s) => s.term),
      ),
    ),
  }
}

/**
 * Regulars whose contract ended with the `before` season, and what `after`
 * shows of them: a contract from the next season with the same Club, with
 * another, or none yet.
 */
export function reSigning(before: CapView, after: CapView, regulars: readonly Regular[]) {
  const later = new Map(after.players.map((p) => [p.slug, p]))
  // A Club by its name in either view; Utah was renamed between them.
  const codes = new Map<string, string>([['Utah Hockey Club', 'UTA']])
  for (const c of [...before.clubs, ...after.clubs]) codes.set(c.name, c.club)
  const signedWith = (contract: CapContract, listedWith: CapPlayer) =>
    contract.signedWith ? (codes.get(contract.signedWith) ?? contract.signedWith) : listedWith.club
  const tally = { restricted: [0, 0, 0, 0], unrestricted: [0, 0, 0, 0] }
  for (const r of regulars) {
    const ending = r.contract.seasons.at(-1)?.season === before.season
    if (!ending) continue
    const status = r.contract.expiryStatus.startsWith('RFA') ? 'restricted' : 'unrestricted'
    const next = later.get(r.joined.cap.slug)
    const contract = next?.contracts.find((c) => c.seasons[0]?.season === before.season + 1)
    const row = tally[status]
    row[0]! += 1
    if (!contract || !next) row[3]! += 1
    else if (signedWith(contract, next) === r.joined.cap.club) row[1]! += 1
    else row[2]! += 1
  }
  return (['restricted', 'unrestricted'] as const).map((status) => {
    const [players, same, other, none] = tally[status] as [number, number, number, number]
    return { status, players, sameClub: same, otherClub: other, none }
  })
}
