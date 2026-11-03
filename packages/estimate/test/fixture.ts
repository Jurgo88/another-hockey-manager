import { NHL_2026_27_CLUB_SEEDS, createRng } from '@ahm/sim'
import type { ClubStint, GoalieRecord, SeasonRecords, SkaterRecord } from '../src/nhl/records.js'

/**
 * A made-up season shaped like the NHL's: every Club uses more Players than
 * a Roster holds, ice time falls down the depth chart, and better Players have
 * better rates, with noise. No network, no real data.
 */

export interface FixtureOptions {
  /** Goalies per Club; below three forces generated fill. */
  goaliesPerClub?: number
  forwardsPerClub?: number
  defencePerClub?: number
}

export function fixtureSeason(options: FixtureOptions = {}): SeasonRecords {
  const { goaliesPerClub = 4, forwardsPerClub = 19, defencePerClub = 12 } = options
  const rng = createRng(2025)
  const skaters: SkaterRecord[] = []
  const goalies: GoalieRecord[] = []
  const stints: ClubStint[] = []
  let nextId = 8_400_000

  const noise = () => rng.next() - 0.5

  NHL_2026_27_CLUB_SEEDS.forEach((club) => {
    const listed: SkaterRecord['position'][] = [
      ...Array.from({ length: forwardsPerClub }, (_, i) => (['C', 'L', 'R'] as const)[i % 3]!),
      ...Array.from({ length: defencePerClub }, () => 'D' as const),
    ]
    listed.forEach((position, depth) => {
      const playerId = nextId++
      const forward = position !== 'D'
      const slot = forward ? depth : depth - forwardsPerClub
      const quality = Math.max(0.05, 1 - slot / (forward ? forwardsPerClub : defencePerClub) + noise() * 0.3)
      const matchesPlayed = slot < (forward ? 13 : 7) ? 70 + Math.round(noise() * 20) : 3 + (slot % 9)
      const toiPerMatch = (forward ? 600 : 800) + quality * 600
      const toi5v5PerMatch = toiPerMatch * 0.8
      const minutes5v5 = (toi5v5PerMatch * matchesPlayed) / 60
      const shots = Math.round(matchesPlayed * (1 + quality * 2.5))
      skaters.push({
        playerId,
        position,
        shoots: rng.chance(position === 'R' ? 0.4 : 0.65) ? 'L' : 'R',
        birthDate: `${1990 + (slot % 15)}-0${1 + (slot % 9)}-15`,
        matchesPlayed,
        toiPerMatch,
        toi5v5PerMatch,
        goals: Math.round(shots * (0.06 + quality * 0.08 + noise() * 0.03)),
        shots,
        assists: Math.round(matchesPlayed * quality * 0.6),
        primaryAssists5v5: Math.round((minutes5v5 / 60) * (0.2 + quality * 0.7)),
        points5v5: Math.round((minutes5v5 / 60) * (0.6 + quality * 1.6)),
        onIceGoalShare5v5: 0.4 + quality * 0.2 + noise() * 0.1,
        shotsPer60At5v5: 3 + quality * 6 + noise(),
        offensiveZoneStarts5v5: 0.5 + noise() * 0.3,
        satRelative5v5: (quality - 0.5) * 0.08 + noise() * 0.02,
        takeaways: Math.round(matchesPlayed * (0.2 + quality * 0.5)),
        giveaways: Math.round(matchesPlayed * 0.4),
        minorPenalties: Math.round(matchesPlayed * (0.3 + noise() * 0.2)),
        faceoffsWon: position === 'C' ? Math.round(matchesPlayed * 8 * (0.45 + quality * 0.1)) : 0,
        faceoffsTaken: position === 'C' ? matchesPlayed * 8 : 0,
        edge: {
          topSpeed: 21 + quality * 2.5 + noise(),
          topShotSpeed: 80 + quality * 15 + noise() * 4,
          distance: matchesPlayed * (2 + quality),
          shots,
          highDangerShots: Math.round(shots * (0.25 + quality * 0.15)),
        },
      })
      stints.push({
        clubCode: club.code,
        playerId,
        firstName: 'First',
        lastName: `Skater${playerId}`,
        goalie: false,
        matchesPlayed,
        timeOnIce: toiPerMatch * matchesPlayed,
      })
    })

    for (let slot = 0; slot < goaliesPerClub; slot++) {
      const playerId = nextId++
      const matchesPlayed = [55, 25, 6, 2][slot] ?? 1
      const evShotsAgainst = matchesPlayed * 24
      const saveRate = 0.915 + noise() * 0.02 - slot * 0.004
      goalies.push({
        playerId,
        catches: 'L',
        birthDate: `${1992 + slot}-03-01`,
        matchesPlayed,
        timeOnIce: matchesPlayed * 3500,
        evShotsAgainst,
        evSaves: Math.round(evShotsAgainst * saveRate),
      })
      stints.push({
        clubCode: club.code,
        playerId,
        firstName: 'First',
        lastName: `Goalie${playerId}`,
        goalie: true,
        matchesPlayed,
        timeOnIce: matchesPlayed * 3500,
      })
    }
  })

  return { season: '20252026', skaters, goalies, stints }
}
