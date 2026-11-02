import type { SkaterPosition } from '@ahm/sim'
import type { ListedPosition } from './nhl/records.js'

/**
 * Natural positions for a real Club (ADR-021). The NHL lists positions loosely
 * and does not separate left from right defence, while a Lineup needs four of
 * each forward position and three on each defence side. Positions move as
 * little as that needs, and a moved Player keeps his old one as his second.
 */

export interface PositionedPlayer {
  id: number
  listed: ListedPosition
  shoots: 'L' | 'R'
  faceoffsTaken: number
  /** Ice time at the Club, the tie-break for who moves. */
  clubToi: number
}

export const MINIMUM_PER_POSITION: Readonly<Record<SkaterPosition, number>> = {
  LW: 4,
  C: 4,
  RW: 4,
  LD: 3,
  RD: 3,
}

const FORWARDS: readonly SkaterPosition[] = ['LW', 'C', 'RW']
const DEFENCE: readonly SkaterPosition[] = ['LD', 'RD']

function listedNatural(player: PositionedPlayer): SkaterPosition {
  switch (player.listed) {
    case 'C':
      return 'C'
    case 'L':
      return 'LW'
    case 'R':
      return 'RW'
    case 'D':
      return player.shoots === 'R' ? 'RD' : 'LD'
  }
}

function secondPosition(natural: SkaterPosition, shoots: 'L' | 'R'): SkaterPosition {
  switch (natural) {
    case 'C':
      return shoots === 'R' ? 'RW' : 'LW'
    case 'LW':
      return 'RW'
    case 'RW':
      return 'LW'
    case 'LD':
      return 'RD'
    case 'RD':
      return 'LD'
  }
}

/** The wing a Player's shooting hand suits, so a move to the wing keeps it where it can. */
const handWing = (shoots: 'L' | 'R'): SkaterPosition => (shoots === 'R' ? 'RW' : 'LW')

/**
 * Which Player moves to `to`, from any position with one to spare: to centre,
 * the one who takes the most draws; otherwise the hand that suits first, then
 * the fewest draws, so a winger moves before a centre, then the least ice time.
 */
function mover(
  candidates: readonly PositionedPlayer[],
  natural: ReadonlyMap<number, SkaterPosition>,
  to: SkaterPosition,
) {
  // Draws decide a move to centre; away from it they keep a real centre where he is.
  const score = (p: PositionedPlayer): number[] => {
    if (to === 'C') return [-p.faceoffsTaken, p.clubToi]
    const suits = DEFENCE.includes(to) ? (to === 'RD') === (p.shoots === 'R') : handWing(p.shoots) === to
    return [suits ? 0 : 1, p.faceoffsTaken, p.clubToi]
  }
  const compare = (a: PositionedPlayer, b: PositionedPlayer) => {
    const [sa, sb] = [score(a), score(b)]
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i]! - sb[i]!
    return a.id - b.id
  }
  return [...candidates].sort(compare)[0]!
}

function balance(
  players: readonly PositionedPlayer[],
  group: readonly SkaterPosition[],
  natural: Map<number, SkaterPosition>,
  moved: Map<number, SkaterPosition>,
  extra: Map<SkaterPosition, number>,
): void {
  const count = (position: SkaterPosition) =>
    players.filter((p) => natural.get(p.id) === position).length + (extra.get(position) ?? 0)

  for (;;) {
    const short = group.find((position) => count(position) < MINIMUM_PER_POSITION[position])
    if (short === undefined) return
    const donors = group.filter(
      (position) => position !== short && count(position) > MINIMUM_PER_POSITION[position],
    )
    const candidates = players.filter((p) => donors.includes(natural.get(p.id)!))
    if (candidates.length === 0) return
    const player = mover(candidates, natural, short)
    moved.set(player.id, natural.get(player.id)!)
    natural.set(player.id, short)
  }
}

/**
 * Preferred positions per Player, natural first. `extra` counts Players to be
 * added at a position (generated fill), so they are reckoned with.
 */
export function assignPositions(
  players: readonly PositionedPlayer[],
  extra: ReadonlyMap<SkaterPosition, number> = new Map(),
): Map<number, readonly SkaterPosition[]> {
  const natural = new Map(players.map((p) => [p.id, listedNatural(p)]))
  const moved = new Map<number, SkaterPosition>()
  const fill = new Map(extra)

  balance(players.filter((p) => p.listed !== 'D'), FORWARDS, natural, moved, fill)
  balance(players.filter((p) => p.listed === 'D'), DEFENCE, natural, moved, fill)

  return new Map(
    players.map((p) => {
      const position = natural.get(p.id)!
      const second = moved.get(p.id) ?? secondPosition(position, p.shoots)
      return [p.id, second === position ? [position] : [position, second]]
    }),
  )
}

/** Where generated fill goes: each one to the position furthest below its minimum, then the least filled. */
export function fillPositions(
  listed: readonly SkaterPosition[],
  group: 'forwards' | 'defence',
  count: number,
): SkaterPosition[] {
  const positions = group === 'forwards' ? FORWARDS : DEFENCE
  const counts = new Map(positions.map((p) => [p, listed.filter((l) => l === p).length]))
  const fill: SkaterPosition[] = []
  for (let i = 0; i < count; i++) {
    const next = [...positions].sort(
      (a, b) =>
        counts.get(a)! - MINIMUM_PER_POSITION[a] - (counts.get(b)! - MINIMUM_PER_POSITION[b]),
    )[0]!
    counts.set(next, counts.get(next)! + 1)
    fill.push(next)
  }
  return fill
}
