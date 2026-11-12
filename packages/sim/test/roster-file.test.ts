import { beforeAll, describe, expect, it } from 'vitest'
import { NHL_2026_27, NHL_CAP_RULES } from '../src/data/nhl-2026-27.js'
import type { CompetitionRosters } from '../src/domain/roster.js'
import {
  createFileRosterProvider,
  readRosterFile,
  rosterFileOf,
  RosterFileError,
  rostersFromFile,
  writeRosterFile,
  type RosterFile,
} from '../src/roster/file.js'
import { advanceDay, startSeason, type SeasonState } from '../src/season/index.js'

const SEED = 16
const CAP = NHL_CAP_RULES.upperLimit

let generated: SeasonState
let rosters: CompetitionRosters

beforeAll(async () => {
  generated = await startSeason(SEED)
  rosters = { structure: NHL_2026_27, clubs: generated.clubs }
})

/** A plain, editable copy of the exported file. */
function exported(): Record<string, unknown> & { clubs: Record<string, unknown>[] } {
  return JSON.parse(writeRosterFile(rosters, CAP)) as Record<string, unknown> & {
    clubs: Record<string, unknown>[]
  }
}

function problemsOf(file: unknown): readonly string[] {
  try {
    rostersFromFile(file, NHL_2026_27)
  } catch (error) {
    if (error instanceof RosterFileError) return error.problems
    throw error
  }
  return []
}

const skaterOf = (file: ReturnType<typeof exported>, club: number, skater: number) =>
  (file.clubs[club]!.skaters as Record<string, unknown>[])[skater]!

describe('roster file round trip', () => {
  it('reads back exactly the Rosters it wrote', () => {
    expect(readRosterFile(writeRosterFile(rosters, CAP), NHL_2026_27)).toEqual(rosters)
  })

  it('starts the same Season as the generator it came from (ADR-020)', async () => {
    const provider = createFileRosterProvider(writeRosterFile(rosters, CAP), NHL_2026_27)
    const imported = await startSeason(SEED, provider)
    expect(imported).toEqual(generated)

    const a = advanceDay(generated)
    const b = advanceDay(imported)
    expect(b.played.map((p) => p.events)).toEqual(a.played.map((p) => p.events))
  })

  it('writes the provenance of every attribute', () => {
    const file = rosterFileOf(rosters, CAP)
    const skater = file.clubs[0]!.skaters[0]!
    expect(Object.keys(skater.provenance!)).toHaveLength(11)
    expect(skater.provenance!.speed).toEqual({ source: 'generated', confidence: 0.25 })
  })

  it('puts the Clubs in the order of the structure, whatever the order in the file', () => {
    const file = exported()
    file.clubs.reverse()
    expect(rostersFromFile(file, NHL_2026_27)).toEqual(rosters)
  })
})

describe('provenance on import', () => {
  it('keeps what the file gives, note included', () => {
    const file = exported()
    const skater = skaterOf(file, 0, 0)
    skater.provenance = {
      speed: { source: 'measured', confidence: 0.95, note: 'NHL EDGE max speed 23.9 mph' },
    }
    const imported = rostersFromFile(file, NHL_2026_27).clubs[0]!.skaters[0]!
    expect(imported.provenance!.speed).toEqual({
      source: 'measured',
      confidence: 0.95,
      note: 'NHL EDGE max speed 23.9 mph',
    })
  })

  it('keeps how many Seasons of ageing followed a value (ADR-022)', () => {
    const file = exported()
    skaterOf(file, 0, 0).provenance = {
      speed: { source: 'measured', confidence: 0.75, seasonsAged: 2 },
    }
    const imported = rostersFromFile(file, NHL_2026_27)
    expect(imported.clubs[0]!.skaters[0]!.provenance!.speed).toEqual({
      source: 'measured',
      confidence: 0.75,
      seasonsAged: 2,
    })
    expect(readRosterFile(writeRosterFile(imported, CAP), NHL_2026_27)).toEqual(imported)
  })

  it('refuses Seasons of ageing that are not a whole number from 0', () => {
    const file = exported()
    skaterOf(file, 0, 0).provenance = {
      speed: { source: 'measured', confidence: 0.75, seasonsAged: -1 },
    }
    expect(problemsOf(file)).toEqual([
      'clubs[0].skaters[0].provenance.speed.seasonsAged: must be a whole number from 0',
    ])
  })

  it('makes an attribute the file leaves out rated', () => {
    const file = exported()
    skaterOf(file, 0, 0).provenance = { speed: { source: 'measured', confidence: 0.95 } }
    delete skaterOf(file, 0, 1).provenance

    const club = rostersFromFile(file, NHL_2026_27).clubs[0]!
    expect(club.skaters[0]!.provenance!.shooting).toEqual({ source: 'rated', confidence: 0.8 })
    for (const entry of Object.values(club.skaters[1]!.provenance!)) {
      expect(entry).toEqual({ source: 'rated', confidence: 0.8 })
    }
  })
})

describe('roster file validation', () => {
  it('names the path of an attribute out of scale', () => {
    const file = exported()
    ;(skaterOf(file, 3, 12).attributes as Record<string, unknown>).speed = 23
    expect(problemsOf(file)).toEqual(['clubs[3].skaters[12].attributes.speed: 23 is outside 1-20'])
  })

  it('reports every problem at once', () => {
    const file = exported()
    const skater = skaterOf(file, 0, 0)
    skater.age = 12.5
    skater.handedness = 'both'
    delete skater.lastName
    expect(problemsOf(file)).toHaveLength(3)
  })

  it('refuses a field the format does not have, so a misspelling is caught', () => {
    const file = exported()
    ;(skaterOf(file, 0, 0).attributes as Record<string, unknown>).speeed = 12
    expect(problemsOf(file)).toContain('clubs[0].skaters[0].attributes.speeed: is not a field of the format')
  })

  it('refuses a newer version', () => {
    expect(problemsOf({ ...exported(), formatVersion: 3 })).toEqual([
      'formatVersion: 3 is newer than this version of the game reads (2)',
    ])
  })

  it('refuses something that is not a roster file', () => {
    expect(problemsOf({ hello: 'world' })[0]).toMatch(/^file\.hello/)
    expect(() => readRosterFile('{ not json', NHL_2026_27)).toThrow(RosterFileError)
  })

  it('wants every Club of the Competition, each once', () => {
    const file = exported()
    file.clubs[1] = file.clubs[0]!
    const problems = problemsOf(file)
    expect(problems).toContain(`clubs: has no Club "${rosters.clubs[1]!.id}"`)
    expect(problems).toContain(`clubs: has Club "${rosters.clubs[0]!.id}" 2 times`)
  })

  it('wants every Player id once across the file', () => {
    const file = exported()
    const firstId = skaterOf(file, 0, 0).id as string
    skaterOf(file, 5, 2).id = firstId
    expect(problemsOf(file)).toEqual([`clubs[5].skaters[2].id: "${firstId}" is used by another Player`])
  })

  it('holds a Club to the Roster shape (ADR-012)', () => {
    const file = exported()
    const club = file.clubs[0]!
    club.goalies = (club.goalies as unknown[]).slice(0, 2)
    skaterOf(file, 0, 0).positions = ['LD']
    expect(problemsOf(file)).toEqual([
      'clubs[0].skaters: must hold 16 forwards and 10 defencemen by natural position, has 15 and 11',
      'clubs[0].goalies: must hold 3, has 2',
    ])
  })

  it('wants the Competition the Season is for', () => {
    expect(problemsOf({ ...exported(), competitionId: 'shl' })).toEqual([
      'competitionId: must be "nhl", got "shl"',
    ])
  })

  it('checks a file when a provider is made from it', () => {
    expect(() => createFileRosterProvider('{}', NHL_2026_27)).toThrow(RosterFileError)
  })

  it('serves only the Competition it holds', async () => {
    const provider = createFileRosterProvider(writeRosterFile(rosters, CAP), NHL_2026_27)
    await expect(provider.loadCompetition('shl')).rejects.toThrow(/asked for "shl"/)
  })

  it('types an exported file as the format', () => {
    const file: RosterFile = rosterFileOf(rosters, CAP)
    expect(file.format).toBe('ahm-roster')
    expect(file.clubs).toHaveLength(32)
  })
})

describe('contracts in the file (ADR-030, #125)', () => {
  it('writes each cap hit in whole currency against the cap it names', () => {
    const file = exported()
    expect(file.formatVersion).toBe(2)
    expect(file.capUpperLimit).toBe(CAP)
    const contract = skaterOf(file, 0, 0).contract as { capHit: number }
    expect(Number.isInteger(contract.capHit)).toBe(true)
    expect(contract.capHit / CAP).toBe(rosters.clubs[0]!.skaters[0]!.contract!.capHit)
  })

  it('keeps the share of the cap when the file names another cap', () => {
    const file = exported()
    file.capUpperLimit = 95_500_000
    skaterOf(file, 0, 0).contract = {
      capHit: 9_550_000,
      years: 3,
      kind: 'standard',
      onExpiry: 'unrestricted',
    }
    const imported = rostersFromFile(file, NHL_2026_27).clubs[0]!.skaters[0]!
    expect(imported.contract).toEqual({
      capHit: 0.1,
      years: 3,
      kind: 'standard',
      onExpiry: 'unrestricted',
    })
  })

  it('reads version 1, and the league opens every Player under contract', async () => {
    const file = exported()
    file.formatVersion = 1
    delete file.capUpperLimit
    for (const club of file.clubs)
      for (const player of [
        ...(club.skaters as Record<string, unknown>[]),
        ...(club.goalies as Record<string, unknown>[]),
      ])
        delete player.contract
    const provider = createFileRosterProvider(JSON.stringify(file), NHL_2026_27)
    const opened = await startSeason(SEED, provider)
    expect(opened.clubs).toEqual(generated.clubs)
  })

  it('wants the cap a contract is in, and no contract in version 1', () => {
    const file = exported()
    delete file.capUpperLimit
    expect(problemsOf(file)).toContain(
      'clubs[0].skaters[0].contract: needs the file to name its capUpperLimit',
    )
    expect(problemsOf({ ...exported(), formatVersion: 1 })).toContain(
      'capUpperLimit: is not a field of format version 1',
    )
  })

  it('names what is wrong with a contract', () => {
    const file = exported()
    skaterOf(file, 0, 0).contract = { capHit: 1.5, years: 0, kind: 'two-way', onExpiry: 'free' }
    expect(problemsOf(file)).toEqual([
      'clubs[0].skaters[0].contract.capHit: must be a whole number, got 1.5',
      'clubs[0].skaters[0].contract.years: 0 is outside 1-10',
      'clubs[0].skaters[0].contract.kind: must be one of entry-level, standard',
      'clubs[0].skaters[0].contract.onExpiry: must be one of restricted, unrestricted',
    ])
  })

  it('will not write contracts without the cap they are shares of', () => {
    expect(() => writeRosterFile(rosters)).toThrow(/need the cap/)
  })
})
