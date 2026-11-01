/** One line of a play-by-play, ready to be worded in either language. */
export interface Play {
  kind: 'goal' | 'chance' | 'penalty' | 'injury' | 'lineup' | 'period_end'
  period: number | string
  clock: number
  club: string | null
  player: string | null
  assists: readonly string[]
  penalty: string | null
  minutes: number | null
  fixtures: number | null
  powerPlay: boolean
  emptyNet: boolean
  homeGoals: number | null
  awayGoals: number | null
}
