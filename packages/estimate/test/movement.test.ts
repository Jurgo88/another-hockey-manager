import { describe, expect, it } from 'vitest'
import { clubChanges, continuity, midSeasonMoves } from '../src/movement.js'
import {
  calendarOf,
  movesOf,
  playersWithSeveralClubs,
  stintsOf,
  type MovementHistory,
  type SeasonPlayer,
  type Stint,
} from '../src/nhl/movement.js'

const player = (
  playerId: number,
  season: number,
  birthYear = 1995,
  matchesPlayed = 60,
): SeasonPlayer => ({
  season,
  playerId,
  position: 'C',
  lastName: `P${playerId}`,
  birthDate: `${birthYear}-01-01`,
  matchesPlayed,
  toiPerMatch: 900,
})

const stint = (
  playerId: number,
  season: number,
  club: string,
  matchesPlayed = 60,
  timeOnIce = 54_000,
): Stint => ({
  season,
  playerId,
  club,
  matchesPlayed,
  timeOnIce,
  goalie: false,
})

const calendar = { season: 2023, start: '2023-10-10', end: '2024-04-18', deadline: '2024-03-08' }

describe('reading the responses', () => {
  it('orders a game log and finds each change of Club, Arizona counted as Utah', () => {
    const log = {
      gameLog: [
        { gameDate: '2024-03-10', teamAbbrev: 'VGK' },
        { gameDate: '2023-11-01', teamAbbrev: 'ARI' },
        { gameDate: '2024-03-07', teamAbbrev: 'ARI' },
        { gameDate: '2024-04-01', teamAbbrev: 'VGK' },
      ],
    }
    expect(movesOf(2023, 7, log)).toEqual([
      {
        season: 2023,
        playerId: 7,
        from: 'UTA',
        to: 'VGK',
        lastFor: '2024-03-07',
        firstFor: '2024-03-10',
      },
    ])
  })

  it('takes the regular season from a schedule and adds the deadline', () => {
    const schedule = {
      games: [
        { gameType: 1, gameDate: '2023-09-25' },
        { gameType: 2, gameDate: '2024-04-18' },
        { gameType: 2, gameDate: '2023-10-10' },
        { gameType: 3, gameDate: '2024-04-25' },
      ],
    }
    expect(calendarOf(2023, schedule)).toEqual(calendar)
  })

  it('reads stints from club-stats and finds Players with more than one Club', () => {
    // The responses as the API sends them: its field names are not this domain's words.
    const clubs = JSON.parse(`{
      "TOR": {
        "skaters": [{ "playerId": 1, "gamesPlayed": 40, "avgTimeOnIcePerGame": 900 }],
        "goalies": [{ "playerId": 3, "gamesPlayed": 30 }]
      },
      "MTL": {
        "skaters": [
          { "playerId": 1, "gamesPlayed": 20, "avgTimeOnIcePerGame": 600 },
          { "playerId": 2, "gamesPlayed": 82 }
        ]
      }
    }`) as Record<string, unknown>
    const stints = stintsOf(2023, clubs)
    expect(stints.find((s) => s.club === 'TOR' && s.playerId === 1)!.timeOnIce).toBe(36_000)
    expect(stints.find((s) => s.playerId === 3)!.goalie).toBe(true)
    expect(playersWithSeveralClubs(stints)).toEqual([1])
  })
})

describe('changing Club between seasons', () => {
  it('compares the Club he ended a season with to the one he started the next with', () => {
    const history: MovementHistory = {
      players: [
        player(1, 2023),
        player(2, 2023),
        player(3, 2023),
        player(1, 2024),
        player(2, 2024),
      ],
      stints: [
        stint(1, 2023, 'TOR'),
        stint(2, 2023, 'TOR', 50),
        stint(2, 2023, 'MTL', 10),
        stint(3, 2023, 'TOR'),
        stint(1, 2024, 'TOR'),
        stint(2, 2024, 'MTL'),
      ],
      // Player 2 ended 2023 in Montreal, though most of his Fixtures were in Toronto.
      moves: [
        {
          season: 2023,
          playerId: 2,
          from: 'TOR',
          to: 'MTL',
          lastFor: '2024-03-01',
          firstFor: '2024-03-10',
        },
      ],
      calendars: [],
    }
    const { all } = clubChanges(history)
    // Player 3 did not play in 2024 and is left out; nobody changed Club.
    expect(all).toEqual({ group: 'All', players: 2, count: 0, share: 0 })
  })
})

describe('moving during a season', () => {
  it('places a move by the last Fixture for the old Club against the deadline', () => {
    const history: MovementHistory = {
      players: [player(1, 2023), player(2, 2023), player(3, 2023), player(4, 2023)],
      stints: [
        stint(1, 2023, 'TOR'),
        stint(1, 2023, 'MTL', 10),
        stint(2, 2023, 'TOR'),
        stint(3, 2023, 'BOS'),
      ],
      moves: [
        {
          season: 2023,
          playerId: 1,
          from: 'TOR',
          to: 'MTL',
          lastFor: '2024-03-07',
          firstFor: '2024-03-10',
        },
        {
          season: 2023,
          playerId: 4,
          from: 'BOS',
          to: 'NYR',
          lastFor: '2023-11-01',
          firstFor: '2023-11-03',
        },
        {
          season: 2023,
          playerId: 4,
          from: 'NYR',
          to: 'BOS',
          lastFor: '2024-03-20',
          firstFor: '2024-03-22',
        },
      ],
      calendars: [calendar],
    }
    const moves = midSeasonMoves(history)
    expect(moves.severalClubs).toMatchObject({ players: 4, count: 1 })
    expect(moves.nearDeadline).toMatchObject({ players: 3, count: 1 })
    expect(moves.afterDeadline).toMatchObject({ players: 3, count: 1 })
    expect(moves.byTenth.reduce((a, b) => a + b, 0)).toBe(3)
    expect(moves.byTenth[1]).toBe(1)
  })
})

describe('continuity', () => {
  it('is the share of ice time played by those who played for the Club the season before', () => {
    const history: MovementHistory = {
      players: [],
      stints: [
        stint(1, 2023, 'TOR'),
        stint(2, 2023, 'TOR'),
        stint(1, 2024, 'TOR', 60, 3_000),
        stint(3, 2024, 'TOR', 60, 1_000),
        // A Club in its first season has nothing to return.
        stint(4, 2024, 'SEA'),
      ],
      moves: [],
      calendars: [],
    }
    expect(continuity(history)).toEqual({ mean: 0.75, clubSeasons: 1, min: 0.75, max: 0.75 })
  })
})
