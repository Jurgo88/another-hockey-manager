import type { Fixture } from '../../src/domain/fixture.js'
import type { ClubId } from '../../src/domain/player.js'

export function fixtureBetween(homeClubId: ClubId, awayClubId: ClubId, id = 'f1'): Fixture {
  return {
    id,
    competitionId: 'nhl',
    seasonId: 's1',
    round: 0,
    day: 0,
    homeClubId,
    awayClubId,
    overtime: 'regular-3on3-then-shootout',
  }
}
