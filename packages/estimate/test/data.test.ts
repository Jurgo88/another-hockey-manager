import { readFileSync } from 'node:fs'
import { NHL_2026_27, SKATER_ATTRIBUTE_KEYS, buildNaiveLineup, readRosterFile } from '@ahm/sim'
import { describe, expect, it } from 'vitest'

/** The committed estimate of the real league (ADR-021), checked as the game will read it. */
const rosters = readRosterFile(
  readFileSync(new URL('../data/nhl-20252026.json', import.meta.url), 'utf8'),
  NHL_2026_27,
)

describe('the NHL 2025-26 roster file', () => {
  it('dresses a Lineup for every Club, with a real Goalie in net', () => {
    for (const club of rosters.clubs) {
      const lineup = buildNaiveLineup(club)
      expect(lineup.starter.startsWith('nhl-')).toBe(true)
      expect(lineup.backup.startsWith('nhl-')).toBe(true)
    }
  })

  it('says where every attribute of every Player came from (D-11)', () => {
    for (const skater of rosters.clubs.flatMap((c) => c.skaters)) {
      for (const key of SKATER_ATTRIBUTE_KEYS) expect(skater.provenance?.[key]).toBeDefined()
    }
  })

  it('is mostly real Players', () => {
    const players = rosters.clubs.flatMap((c) => [...c.skaters, ...c.goalies])
    const real = players.filter((p) => p.id.startsWith('nhl-'))
    expect(real.length / players.length).toBeGreaterThan(0.95)
  })
})
