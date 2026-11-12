import type { CompetitionRosters, Contract, Player } from '@ahm/sim'
import type { CapContract, CapView } from './capwages/pages.js'
import { contractIn, joinView } from './contracts.js'
import type { SeasonPlayer } from './nhl/movement.js'

/**
 * Real contracts on estimated Rosters (#125, ADR-030): each NHL Player matched to
 * CapWages as the measurements match him, holding the contract that covers the
 * view's season. Shares are of that season's cap, which the roster file names,
 * so a league with another cap keeps them. A Player not matched, and every
 * generated fill, gets the contract the league opens with.
 */

/** A CapWages contract as `@ahm/sim` holds it in the view's season. */
export function contractOf(
  contract: CapContract,
  season: number,
  upperLimit: number,
): Contract | undefined {
  const left = contract.seasons.filter((s) => s.season >= season)
  const now = left.find((s) => s.season === season)
  if (!now) return undefined
  return {
    capHit: now.capHit / upperLimit,
    years: left.length,
    kind: contract.entryLevel ? 'entry-level' : 'standard',
    onExpiry: contract.expiryStatus.startsWith('RFA') ? 'restricted' : 'unrestricted',
  }
}

/** The Rosters with the contracts the view shows, and how many Players got one. */
export function withContracts(
  rosters: CompetitionRosters,
  view: CapView,
  players: readonly SeasonPlayer[],
): { rosters: CompetitionRosters; upperLimit: number; contracted: number; players: number } {
  const upperLimit = view.clubs[0]?.upperLimit
  if (!upperLimit) throw new Error(`CapWages view ${view.season}: no upper limit`)
  const byNhlId = new Map(
    joinView(view, players).joined.map(({ cap, nhl }) => [`nhl-${nhl.playerId}`, cap]),
  )
  let contracted = 0
  let total = 0
  const sign = <P extends Player>(player: P): P => {
    total++
    const cap = byNhlId.get(player.id)
    const held = cap && contractIn(cap, view.season)
    const contract = held && contractOf(held, view.season, upperLimit)
    if (!contract) return player
    contracted++
    return { ...player, contract }
  }
  const clubs = rosters.clubs.map((club) => ({
    ...club,
    skaters: club.skaters.map(sign),
    goalies: club.goalies.map(sign),
  }))
  return { rosters: { ...rosters, clubs }, upperLimit, contracted, players: total }
}
