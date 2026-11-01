import type { Lineup } from '@ahm/sim'

/** What the Lineup and Tactics screens work from. */
export interface LineupPage {
  lineup: Lineup
  locked: boolean
  players: {
    id: string
    name: string
    positions: readonly string[]
    out: number
  }[]
}
