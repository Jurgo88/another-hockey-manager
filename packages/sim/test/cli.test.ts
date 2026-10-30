import { beforeAll, describe, expect, it } from 'vitest'
import { NHL_2026_27 } from '../src/data/nhl-2026-27.js'
import {
  type Column,
  renderGoalieLeaders,
  renderPlayByPlay,
  renderScoringLeaders,
  renderSeason,
  renderStandings,
  renderTable,
  seasonDump,
} from '../src/cli/format.js'
import { simulateSeason, type SimulatedSeason } from '../src/cli/season.js'
import { points } from '../src/stats/match.js'

const SEED = 11

describe('renderTable', () => {
  const columns: Column<{ code: string; pts: number }>[] = [
    { header: 'Club', align: 'left', value: (row) => row.code },
    { header: 'PTS', value: (row) => row.pts },
  ]

  it('aligns names left and numbers right, under a rule', () => {
    const table = renderTable(columns, [
      { code: 'BOS', pts: 104 },
      { code: 'VGK', pts: 9 },
    ])
    expect(table.split('\n')).toEqual(['Club  PTS', '---------', 'BOS   104', 'VGK     9'])
  })

  it('renders an empty table as its header', () => {
    expect(renderTable(columns, []).split('\n')).toHaveLength(2)
  })
})

describe('a printed Season', () => {
  let season: SimulatedSeason

  beforeAll(async () => {
    season = await simulateSeason(SEED)
  })

  const fixtureWhere = (decidedIn: string) =>
    season.matches.find((m) => m.result.decidedIn === decidedIn)!.fixtureId

  it('prints every Division and Conference, each Club in both', () => {
    const output = renderStandings(season, NHL_2026_27)
    for (const { name } of [...NHL_2026_27.divisions, ...NHL_2026_27.conferences]) {
      expect(output).toContain(name)
    }
    for (const club of season.clubs) {
      expect(output.match(new RegExp(`^${club.code} `, 'gm'))).toHaveLength(2)
    }
  })

  it('ranks scoring leaders by points and honours the row limit', () => {
    const lines = renderScoringLeaders(season, 5).split('\n')
    expect(lines).toHaveLength(2 + 5)

    const best = Math.max(...[...season.season.skaters.values()].map(points))
    const pointsColumn = lines[0]!.indexOf('PTS') + 3
    expect(lines[2]!.slice(0, pointsColumn).trimEnd().endsWith(String(best))).toBe(true)
  })

  it('keeps out Goalies below the Fixture minimum', () => {
    const output = renderGoalieLeaders(season, 100)
    const appeared = [...season.season.goalies.values()].filter((g) => g.gamesPlayed >= 20)
    expect(output.split('\n')).toHaveLength(2 + appeared.length)
  })

  it('prints the same report for the same seed (FR-02)', async () => {
    const again = await simulateSeason(SEED)
    expect(renderSeason(again, NHL_2026_27, 10)).toBe(renderSeason(season, NHL_2026_27, 10))
  })

  it('replays a Fixture to the stream its statistics came from', () => {
    const match = season.matches[100]!
    const goals = season
      .replay(match.fixtureId)
      .filter((event) => event.type === 'goal' && event.period !== 'SO')
    expect(goals).toHaveLength(match.scoring.length)
  })

  it('refuses a Fixture the Season does not have', () => {
    expect(() => renderPlayByPlay(season, 'nope')).toThrow(/No Fixture nope/)
  })

  it('prints one line per goal in the play-by-play, on the clock of its Period', () => {
    const match = season.matches.find((m) => m.scoring.some((play) => play.period === 3))!
    const output = renderPlayByPlay(season, match.fixtureId)

    expect(output.match(/ GOAL /g)).toHaveLength(match.scoring.length)
    for (const line of output.split('\n').filter((text) => text.includes(' GOAL '))) {
      const minutes = Number(/^\s+(\d+):\d\d/.exec(line)![1])
      expect(minutes).toBeLessThanOrEqual(20)
    }
  })

  it('names the decision and shows the attempts of a shootout', () => {
    const output = renderPlayByPlay(season, fixtureWhere('shootout'))
    expect(output).toContain('(shootout)')
    expect(output).toContain('SHOOTOUT ')
  })

  it('dumps the Season as plain JSON', () => {
    const dump = JSON.parse(JSON.stringify(seasonDump(season, NHL_2026_27))) as {
      seed: number
      standings: unknown[]
      skaters: { name: string }[]
      fixtures: unknown[]
    }
    expect(dump.seed).toBe(SEED)
    expect(dump.standings).toHaveLength(32)
    expect(dump.fixtures).toHaveLength(1344)
    expect(dump.skaters[0]!.name).not.toMatch(/^\d/)
  })
})
