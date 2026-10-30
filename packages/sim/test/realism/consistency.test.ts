import { describe, expect, it } from 'vitest'
import type { MatchEvent, ShiftChangeEvent } from '../../src/domain/event.js'
import { simulateSeason } from '../../src/cli/season.js'
import { points } from '../../src/stats/match.js'
import { endOfPlay, skatersAllowed } from '../support/events.js'

/**
 * Tier 4 internal consistency (04-validation-targets.md), held over every
 * stream of a full Season. Shootouts account for themselves: their attempts
 * are `shot` events in Period 'SO' with no `goal` or `save` behind them.
 */

const SEASON_SEED = 4
/** Replaying is as slow as playing, so every tenth Fixture stands for the rest. */
const REPLAY_EVERY = 10

describe('Tier 4 internal consistency', async () => {
  const season = await simulateSeason(SEASON_SEED)
  const played = season.fixtures.map((fixture, i) => ({
    fixture,
    match: season.matches[i]!,
    events: season.replay(fixture.id),
  }))

  const count = (events: readonly MatchEvent[], keep: (event: MatchEvent) => boolean) =>
    events.filter(keep).length

  it('covers the whole Season, stream by stream', () => {
    expect(played).toHaveLength(1344)
    for (const { fixture, match } of played) expect(match.fixtureId).toBe(fixture.id)
  })

  it('derives goals from the count of goal events', () => {
    for (const { match, events } of played) {
      const { result, homeClubId, awayClubId } = match
      const goalsBy = (clubId: string) =>
        count(events, (e) => e.type === 'goal' && e.clubId === clubId)
      const shootoutBonus = (clubId: string) =>
        result.decidedIn === 'shootout' && result.winner === clubId ? 1 : 0

      expect(result.homeGoals).toBe(goalsBy(homeClubId) + shootoutBonus(homeClubId))
      expect(result.awayGoals).toBe(goalsBy(awayClubId) + shootoutBonus(awayClubId))
    }
  })

  it('precedes every goal and save with the shot that produced it, at the same clock', () => {
    for (const { events } of played) {
      events.forEach((event, i) => {
        if (event.type !== 'goal' && event.type !== 'save') return
        expect(events[i - 1]).toMatchObject({
          type: 'shot',
          clock: event.clock,
          result: event.type,
          shooter: event.type === 'goal' ? event.scorer : event.shooter,
        })
      })
    }
  })

  it('backs every shot that hit the net with a goal or save event', () => {
    for (const { events } of played) {
      const onNet = count(
        events,
        (e) =>
          e.type === 'shot' && e.period !== 'SO' && (e.result === 'goal' || e.result === 'save'),
      )
      expect(count(events, (e) => e.type === 'goal' || e.type === 'save')).toBe(onNet)
    }
  })

  it('counts shots on goal as goals plus saves, excluding blocks and misses', () => {
    for (const { match, events } of played) {
      for (const club of match.clubs.values()) {
        const goals = count(events, (e) => e.type === 'goal' && e.clubId === club.clubId)
        const savesAgainst = count(events, (e) => e.type === 'save' && e.clubId !== club.clubId)
        expect(club.shotsFor).toBe(goals + savesAgainst)
      }
    }
  })

  it('sums Player points to goals plus assists, with no orphan credit', () => {
    for (const { match, events } of played) {
      let credits = 0
      for (const event of events) {
        if (event.type !== 'goal') continue
        credits += 1 + event.assists.length
        for (const playerId of [event.scorer, ...event.assists]) {
          expect(match.skaters.get(playerId)?.clubId).toBe(event.clubId)
        }
      }
      const total = [...match.skaters.values()].reduce((sum, s) => sum + points(s), 0)
      expect(total).toBe(credits)
    }
  })

  it('times the power play as the time one Club had more Skaters, ignoring an extra attacker', () => {
    for (const { match, events } of played) {
      const changes = events.filter((e): e is ShiftChangeEvent => e.type === 'shift_change')
      const advantage = new Map<string, number>()
      const add = (clubId: string, seconds: number) =>
        advantage.set(clubId, (advantage.get(clubId) ?? 0) + seconds)

      for (let i = 0; i < changes.length; i += 2) {
        const [a, b] = [changes[i]!, changes[i + 1]!]
        const seconds = (changes[i + 2]?.clock ?? endOfPlay(events)) - a.clock
        if (skatersAllowed(a) > skatersAllowed(b)) add(a.clubId, seconds)
        if (skatersAllowed(b) > skatersAllowed(a)) add(b.clubId, seconds)
      }
      for (const club of match.clubs.values()) {
        expect(club.powerPlaySeconds).toBe(advantage.get(club.clubId) ?? 0)
      }
    }
  })

  it('closes every powerplay_start with a powerplay_end', () => {
    for (const { events } of played) {
      const open = new Map<string, number>()
      for (const event of events) {
        if (event.type === 'powerplay_start') {
          open.set(event.clubId, (open.get(event.clubId) ?? 0) + 1)
        } else if (event.type === 'powerplay_end') {
          const depth = open.get(event.clubId) ?? 0
          expect(depth).toBeGreaterThan(0)
          open.set(event.clubId, depth - 1)
        }
      }
      expect([...open.values()].every((depth) => depth === 0)).toBe(true)
    }
  })

  it('never moves the clock backwards', () => {
    for (const { events } of played) {
      expect(events.every((e, i) => i === 0 || e.clock >= events[i - 1]!.clock)).toBe(true)
    }
  })

  it('never puts a Player in two units in the same shift_change', () => {
    for (const { events } of played) {
      const shifts = events.filter((e): e is ShiftChangeEvent => e.type === 'shift_change')
      expect(shifts.every((e) => new Set(e.onIce).size === e.onIce.length)).toBe(true)
    }
  })

  it('reproduces any Fixture exactly from its stored seed', () => {
    for (const { fixture, events } of played.filter((_, i) => i % REPLAY_EVERY === 0)) {
      expect(JSON.stringify(season.replay(fixture.id))).toBe(JSON.stringify(events))
    }
  })
})
