import type { Club, MatchEvent } from '@ahm/sim'
import type { Play } from '~~/shared/types/play'

/** A save shows in the reader only off a shot at least this dangerous. */
const NOTABLE_DANGER = 0.2

const blank = {
  club: null,
  player: null,
  assists: [],
  penalty: null,
  minutes: null,
  fixtures: null,
  powerPlay: false,
  emptyNet: false,
  homeGoals: null,
  awayGoals: null,
}

/** The events a reader cares about, in order. Everything else stays in the stream. */
export function playByPlay(events: readonly MatchEvent[], clubs: readonly Club[]): Play[] {
  const names = playerNames(clubs)
  const name = (id: string) => names.get(id) ?? id
  const clubOf = (id: string) => clubs.find((club) => club.id === id)?.name ?? id

  return events.flatMap((event): Play[] => {
    const at = { period: event.period, clock: event.clock }
    switch (event.type) {
      case 'goal':
        return [
          {
            ...blank,
            ...at,
            kind: 'goal',
            club: clubOf(event.clubId),
            player: name(event.scorer),
            assists: event.assists.map(name),
            powerPlay: event.strength === 'powerplay',
            emptyNet: event.emptyNet,
          },
        ]
      case 'shot':
        if (event.result !== 'save' || event.danger < NOTABLE_DANGER) return []
        return [
          {
            ...blank,
            ...at,
            kind: 'chance',
            club: clubOf(event.clubId),
            player: name(event.shooter),
          },
        ]
      case 'penalty':
        return [
          {
            ...blank,
            ...at,
            kind: 'penalty',
            club: clubOf(event.clubId),
            player: name(event.player),
            penalty: event.kind,
            minutes: event.minutes,
          },
        ]
      case 'injury':
        return [
          {
            ...blank,
            ...at,
            kind: 'injury',
            club: clubOf(event.clubId),
            player: name(event.player),
            fixtures: event.fixtures,
          },
        ]
      case 'lineup_change':
        return [{ ...blank, ...at, kind: 'lineup', club: clubOf(event.clubId) }]
      case 'period_end':
        return [
          {
            ...blank,
            ...at,
            kind: 'period_end',
            homeGoals: event.homeGoals,
            awayGoals: event.awayGoals,
          },
        ]
      default:
        return []
    }
  })
}
