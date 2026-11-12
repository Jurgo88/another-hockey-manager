import { ageOn } from './estimate.js'
import type { MovementHistory, SeasonCalendar, Stint } from './nhl/movement.js'

/**
 * The Phase 3 measurements of movement (#122): who changes Club between
 * seasons, who moves during one and when, and how much of a Club returns.
 * Pure functions of the history; `pnpm sim:measure --movement` prints them.
 */

const ageIn = (birthDate: string, season: number) => ageOn(birthDate, `${season}-10-01`)

export const MOVEMENT_AGE_BANDS = [
  { label: '23 or younger', from: 0, to: 23 },
  { label: '24-27', from: 24, to: 27 },
  { label: '28-30', from: 28, to: 30 },
  { label: '31-33', from: 31, to: 33 },
  { label: '34 or older', from: 34, to: 99 },
] as const

export interface ShareRow {
  group: string
  players: number
  count: number
  share: number
}

const shareRow = (group: string, players: number, count: number): ShareRow => ({
  group,
  players,
  count,
  share: players ? count / players : 0,
})

const key = (playerId: number, season: number) => `${playerId}:${season}`

/** Each Player's Club at the end of a season and at the start of it. */
function endsOfSeason(history: MovementHistory): {
  first: Map<string, string>
  last: Map<string, string>
} {
  const first = new Map<string, string>()
  const last = new Map<string, string>()
  const most = new Map<string, Stint>()
  for (const s of history.stints) {
    const k = key(s.playerId, s.season)
    const best = most.get(k)
    if (!best || s.matchesPlayed > best.matchesPlayed) most.set(k, s)
  }
  for (const [k, s] of most) {
    first.set(k, s.club)
    last.set(k, s.club)
  }
  // A Player with a move: the game log orders his Clubs.
  const ordered = [...history.moves].sort((a, b) => a.firstFor.localeCompare(b.firstFor))
  const seen = new Set<string>()
  for (const m of ordered) {
    const k = key(m.playerId, m.season)
    if (!seen.has(k)) first.set(k, m.from)
    seen.add(k)
    last.set(k, m.to)
  }
  return { first, last }
}

/**
 * Of Players with `minMatches` or more in a season who play the next, the share
 * who start it with another Club than the one they ended with, by age.
 */
export function clubChanges(
  history: MovementHistory,
  minMatches = 20,
): { all: ShareRow; byAge: ShareRow[] } {
  const { first, last } = endsOfSeason(history)
  const final = Math.max(...history.players.map((p) => p.season))
  const rows = history.players
    .filter((p) => p.matchesPlayed >= minMatches && p.season < final)
    .filter((p) => first.has(key(p.playerId, p.season + 1)) && last.has(key(p.playerId, p.season)))
    .map((p) => ({
      age: ageIn(p.birthDate, p.season),
      changed: last.get(key(p.playerId, p.season)) !== first.get(key(p.playerId, p.season + 1)),
    }))
  const tally = (label: string, members: typeof rows) =>
    shareRow(label, members.length, members.filter((r) => r.changed).length)
  return {
    all: tally('All', rows),
    byAge: MOVEMENT_AGE_BANDS.map((b) =>
      tally(
        b.label,
        rows.filter((r) => r.age >= b.from && r.age <= b.to),
      ),
    ),
  }
}

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000

/** The day a move is taken to have happened: halfway between the two Clubs' Fixtures. */
const moveDay = (lastFor: string, firstFor: string) => (day(lastFor) + day(firstFor)) / 2

export interface MidSeasonMoves {
  /** Players with `minMatches` or more who played for more than one Club. */
  severalClubs: ShareRow
  /** Moves by tenth of the regular season, from its first day to its last. */
  byTenth: readonly number[]
  /** Moves in the `windowDays` before the deadline, through its day. */
  nearDeadline: ShareRow
  /** Moves after the deadline: waiver claims and the like. */
  afterDeadline: ShareRow
  perSeason: readonly { season: number; moves: number; nearDeadline: number }[]
}

export function midSeasonMoves(
  history: MovementHistory,
  minMatches = 20,
  windowDays = 14,
): MidSeasonMoves {
  const calendars = new Map<number, SeasonCalendar>(history.calendars.map((c) => [c.season, c]))
  const clubs = new Map<string, Set<string>>()
  for (const s of history.stints) {
    const k = key(s.playerId, s.season)
    clubs.set(k, (clubs.get(k) ?? new Set()).add(s.club))
  }
  const regulars = history.players.filter((p) => p.matchesPlayed >= minMatches)
  const several = regulars.filter(
    (p) => (clubs.get(key(p.playerId, p.season))?.size ?? 0) > 1,
  ).length

  const byTenth = Array.from({ length: 10 }, () => 0)
  const perSeason = new Map<number, { moves: number; nearDeadline: number }>()
  let near = 0
  let after = 0
  let counted = 0
  for (const m of history.moves) {
    const cal = calendars.get(m.season)
    if (!cal) continue
    const at = moveDay(m.lastFor, m.firstFor)
    const share = (at - day(cal.start)) / (day(cal.end) - day(cal.start))
    byTenth[Math.min(9, Math.max(0, Math.floor(share * 10)))]! += 1
    const deadline = day(cal.deadline)
    // The first Fixture for the new Club comes after the deadline; the move
    // itself is on or before it whenever the last Fixture for the old Club is.
    const isNear = day(m.lastFor) <= deadline && day(m.lastFor) > deadline - windowDays
    const isAfter = day(m.lastFor) > deadline
    if (isNear) near++
    if (isAfter) after++
    counted++
    const row = perSeason.get(m.season) ?? { moves: 0, nearDeadline: 0 }
    perSeason.set(m.season, {
      moves: row.moves + 1,
      nearDeadline: row.nearDeadline + (isNear ? 1 : 0),
    })
  }

  return {
    severalClubs: shareRow('Players with more than one Club', regulars.length, several),
    byTenth,
    nearDeadline: shareRow(`Moves in the ${windowDays} days before the deadline`, counted, near),
    afterDeadline: shareRow('Moves after the deadline', counted, after),
    perSeason: [...perSeason].sort((a, b) => a[0] - b[0]).map(([season, r]) => ({ season, ...r })),
  }
}

/**
 * The share of a Club's Skater ice time in a season played by Skaters who also
 * played for it the season before, averaged over Clubs and seasons. A Club in
 * its first season is left out.
 */
export function continuity(history: MovementHistory): {
  mean: number
  clubSeasons: number
  min: number
  max: number
} {
  const played = new Set(history.stints.map((s) => `${s.club}:${s.season}:${s.playerId}`))
  const totals = new Map<string, { all: number; returning: number }>()
  for (const s of history.stints) {
    if (s.goalie) continue
    const k = `${s.club}:${s.season}`
    const row = totals.get(k) ?? { all: 0, returning: 0 }
    const returning = played.has(`${s.club}:${s.season - 1}:${s.playerId}`)
    totals.set(k, {
      all: row.all + s.timeOnIce,
      returning: row.returning + (returning ? s.timeOnIce : 0),
    })
  }
  const clubSeasons = new Set(history.stints.map((s) => `${s.club}:${s.season}`))
  const shares = [...totals]
    .filter(([k]) => {
      const [club, season] = k.split(':') as [string, string]
      return clubSeasons.has(`${club}:${Number(season) - 1}`)
    })
    .map(([, r]) => (r.all > 0 ? r.returning / r.all : 0))
  const mean = shares.reduce((a, b) => a + b, 0) / (shares.length || 1)
  return { mean, clubSeasons: shares.length, min: Math.min(...shares), max: Math.max(...shares) }
}
