import {
  ATTRIBUTE_MAX,
  ATTRIBUTE_MIN,
  GOALIE_ATTRIBUTE_KEYS,
  SKATER_ATTRIBUTE_KEYS,
  type GoalieAttributes,
  type SkaterAttributes,
} from '../domain/attributes.js'
import type { Club } from '../domain/club.js'
import type { CompetitionId, CompetitionStructure } from '../domain/competition.js'
import type { ClubId, Goalie, Handedness, PlayerId, Skater, SkaterPosition } from '../domain/player.js'
import {
  DEFAULT_CONFIDENCE,
  type AttributeProvenance,
  type AttributeSource,
} from '../domain/provenance.js'
import { ROSTER_SHAPE, type CompetitionRosters, type RosterProvider } from '../domain/roster.js'

/**
 * The roster file (ADR-020, `06-roster-file.md`): the Rosters of one Competition
 * as JSON, so a Manager can import real names and anyone can rate a Roster
 * outside the application (ADR-003).
 *
 * An attribute keeps the provenance the file gives it, and one with none arrives
 * as `rated`. Export writes every provenance, so a file exported and imported
 * again is unchanged.
 */

export const ROSTER_FILE_FORMAT = 'ahm-roster'
export const ROSTER_FILE_VERSION = 1

export interface RosterFile {
  format: typeof ROSTER_FILE_FORMAT
  formatVersion: typeof ROSTER_FILE_VERSION
  competitionId: CompetitionId
  clubs: readonly RosterFileClub[]
}

export interface RosterFileClub {
  id: ClubId
  code: string
  name: string
  skaters: readonly RosterFileSkater[]
  goalies: readonly RosterFileGoalie[]
}

interface RosterFilePlayer {
  id: PlayerId
  firstName: string
  lastName: string
  age: number
  potential: number
  handedness: Handedness
}

export interface RosterFileSkater extends RosterFilePlayer {
  /** The natural position first. */
  positions: readonly SkaterPosition[]
  attributes: SkaterAttributes
  provenance?: Partial<Record<keyof SkaterAttributes, AttributeProvenance>>
}

export interface RosterFileGoalie extends RosterFilePlayer {
  attributes: GoalieAttributes
  provenance?: Partial<Record<keyof GoalieAttributes, AttributeProvenance>>
}

/** A file that cannot be imported, with every problem found and where. */
export class RosterFileError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Roster file has ${problems.length} problem(s):\n${problems.join('\n')}`)
    this.name = 'RosterFileError'
  }
}

const AGE_MIN = 16
const AGE_MAX = 45
const POSITIONS: readonly SkaterPosition[] = ['LW', 'C', 'RW', 'LD', 'RD']
const FORWARD_POSITIONS: readonly SkaterPosition[] = ['LW', 'C', 'RW']
const HANDEDNESS: readonly Handedness[] = ['left', 'right']
const SOURCES: readonly AttributeSource[] = ['measured', 'derived', 'rated', 'generated']

const FILE_FIELDS = ['format', 'formatVersion', 'competitionId', 'clubs'] as const
const CLUB_FIELDS = ['id', 'code', 'name', 'skaters', 'goalies'] as const
const PLAYER_FIELDS = [
  'id',
  'firstName',
  'lastName',
  'age',
  'potential',
  'handedness',
  'attributes',
  'provenance',
] as const
const SKATER_FIELDS = [...PLAYER_FIELDS, 'positions'] as const
const PROVENANCE_FIELDS = ['source', 'confidence', 'note'] as const

// --- Export ---

function provenanceEntry(entry: AttributeProvenance): AttributeProvenance {
  return {
    source: entry.source,
    confidence: entry.confidence,
    ...(entry.note !== undefined ? { note: entry.note } : {}),
  }
}

/** Every attribute's provenance. A Player with none is uniformly generated (ADR-008). */
function fullProvenance<K extends string>(
  keys: readonly K[],
  provenance: Readonly<Record<K, AttributeProvenance>> | undefined,
): Record<K, AttributeProvenance> {
  const generated = { source: 'generated', confidence: DEFAULT_CONFIDENCE.generated } as const
  return Object.fromEntries(
    keys.map((key) => [key, provenanceEntry(provenance?.[key] ?? generated)]),
  ) as Record<K, AttributeProvenance>
}

function filePlayer(player: Skater | Goalie): RosterFilePlayer {
  return {
    id: player.id,
    firstName: player.firstName,
    lastName: player.lastName,
    age: player.age,
    potential: player.potential,
    handedness: player.handedness,
  }
}

/** The file for a Competition's Rosters. */
export function rosterFileOf(rosters: CompetitionRosters): RosterFile {
  return {
    format: ROSTER_FILE_FORMAT,
    formatVersion: ROSTER_FILE_VERSION,
    competitionId: rosters.structure.id,
    clubs: rosters.clubs.map((club) => ({
      id: club.id,
      code: club.code,
      name: club.name,
      skaters: club.skaters.map((skater) => ({
        ...filePlayer(skater),
        positions: [...skater.preferredPositions],
        attributes: { ...skater.attributes },
        provenance: fullProvenance(SKATER_ATTRIBUTE_KEYS, skater.provenance),
      })),
      goalies: club.goalies.map((goalie) => ({
        ...filePlayer(goalie),
        attributes: { ...goalie.attributes },
        provenance: fullProvenance(GOALIE_ATTRIBUTE_KEYS, goalie.provenance),
      })),
    })),
  }
}

export function writeRosterFile(rosters: CompetitionRosters): string {
  return `${JSON.stringify(rosterFileOf(rosters), null, 2)}\n`
}

// --- Validation ---

type Fields = Record<string, unknown>

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Collects every problem with its path, so one import reports them all. */
class Checker {
  readonly problems: string[] = []

  add(path: string, message: string): void {
    this.problems.push(`${path}: ${message}`)
  }

  /** An object with only the fields allowed, or undefined. */
  object(value: unknown, path: string, allowed: readonly string[]): Fields | undefined {
    if (!isFields(value)) {
      this.add(path, 'must be an object')
      return undefined
    }
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) this.add(`${path}.${key}`, 'is not a field of the format')
    }
    return value
  }

  array(fields: Fields, key: string, path: string): readonly unknown[] | undefined {
    const value = fields[key]
    if (Array.isArray(value)) return value as readonly unknown[]
    this.add(`${path}.${key}`, value === undefined ? 'is missing' : 'must be an array')
    return undefined
  }

  text(fields: Fields, key: string, path: string): void {
    const value = fields[key]
    if (typeof value === 'string' && value.trim() !== '') return
    this.add(`${path}.${key}`, value === undefined ? 'is missing' : 'must be non-empty text')
  }

  wholeNumber(fields: Fields, key: string, path: string, min: number, max: number): void {
    const value = fields[key]
    if (value === undefined) {
      this.add(`${path}.${key}`, 'is missing')
    } else if (typeof value !== 'number' || !Number.isInteger(value)) {
      this.add(`${path}.${key}`, `must be a whole number, got ${JSON.stringify(value)}`)
    } else if (value < min || value > max) {
      this.add(`${path}.${key}`, `${value} is outside ${min}-${max}`)
    }
  }

  oneOf(fields: Fields, key: string, path: string, values: readonly string[]): void {
    const value = fields[key]
    if (typeof value === 'string' && values.includes(value)) return
    this.add(
      `${path}.${key}`,
      value === undefined ? 'is missing' : `must be one of ${values.join(', ')}`,
    )
  }
}

function checkAttributes(
  check: Checker,
  fields: Fields,
  path: string,
  keys: readonly string[],
): void {
  const attributes = check.object(fields.attributes, `${path}.attributes`, keys)
  if (!attributes) return
  for (const key of keys) {
    check.wholeNumber(attributes, key, `${path}.attributes`, ATTRIBUTE_MIN, ATTRIBUTE_MAX)
  }
}

function checkProvenance(
  check: Checker,
  fields: Fields,
  path: string,
  keys: readonly string[],
): void {
  if (fields.provenance === undefined) return
  const provenance = check.object(fields.provenance, `${path}.provenance`, keys)
  if (!provenance) return
  for (const [key, value] of Object.entries(provenance)) {
    const at = `${path}.provenance.${key}`
    const entry = check.object(value, at, PROVENANCE_FIELDS)
    if (!entry) continue
    check.oneOf(entry, 'source', at, SOURCES)
    const { confidence, note } = entry
    if (typeof confidence !== 'number' || !(confidence >= 0 && confidence <= 1)) {
      check.add(`${at}.confidence`, confidence === undefined ? 'is missing' : 'must be from 0 to 1')
    }
    if (note !== undefined && typeof note !== 'string') check.add(`${at}.note`, 'must be text')
  }
}

function checkPlayer(check: Checker, fields: Fields, path: string, ids: Set<string>): void {
  check.text(fields, 'id', path)
  check.text(fields, 'firstName', path)
  check.text(fields, 'lastName', path)
  check.wholeNumber(fields, 'age', path, AGE_MIN, AGE_MAX)
  check.wholeNumber(fields, 'potential', path, ATTRIBUTE_MIN, ATTRIBUTE_MAX)
  check.oneOf(fields, 'handedness', path, HANDEDNESS)

  const { id } = fields
  if (typeof id !== 'string') return
  if (ids.has(id)) check.add(`${path}.id`, `"${id}" is used by another Player`)
  ids.add(id)
}

/** The natural position, when the positions are valid. */
function checkPositions(check: Checker, fields: Fields, path: string): SkaterPosition | undefined {
  const positions = check.array(fields, 'positions', path)
  if (!positions) return undefined
  const at = `${path}.positions`
  if (positions.length === 0) check.add(at, 'must name at least the natural position')
  if (positions.some((position) => !POSITIONS.includes(position as SkaterPosition))) {
    check.add(at, `may hold only ${POSITIONS.join(', ')}`)
    return undefined
  }
  if (new Set(positions).size !== positions.length) check.add(at, 'must not repeat a position')
  return positions[0] as SkaterPosition | undefined
}

function checkClub(check: Checker, value: unknown, path: string, ids: Set<string>): void {
  const club = check.object(value, path, CLUB_FIELDS)
  if (!club) return
  check.text(club, 'id', path)
  check.text(club, 'code', path)
  check.text(club, 'name', path)

  const skaters = check.array(club, 'skaters', path) ?? []
  let forwards = 0
  let defence = 0
  skaters.forEach((entry, i) => {
    const at = `${path}.skaters[${i}]`
    const skater = check.object(entry, at, SKATER_FIELDS)
    if (!skater) return
    checkPlayer(check, skater, at, ids)
    const natural = checkPositions(check, skater, at)
    if (natural) {
      if (FORWARD_POSITIONS.includes(natural)) forwards++
      else defence++
    }
    checkAttributes(check, skater, at, SKATER_ATTRIBUTE_KEYS)
    checkProvenance(check, skater, at, SKATER_ATTRIBUTE_KEYS)
  })

  const goalies = check.array(club, 'goalies', path) ?? []
  goalies.forEach((entry, i) => {
    const at = `${path}.goalies[${i}]`
    const goalie = check.object(entry, at, PLAYER_FIELDS)
    if (!goalie) return
    checkPlayer(check, goalie, at, ids)
    checkAttributes(check, goalie, at, GOALIE_ATTRIBUTE_KEYS)
    checkProvenance(check, goalie, at, GOALIE_ATTRIBUTE_KEYS)
  })

  // The Roster shape the injury rate is calibrated on (ADR-012, ADR-020).
  if (forwards !== ROSTER_SHAPE.forwards || defence !== ROSTER_SHAPE.defence) {
    check.add(
      `${path}.skaters`,
      `must hold ${ROSTER_SHAPE.forwards} forwards and ${ROSTER_SHAPE.defence} defencemen by natural position, has ${forwards} and ${defence}`,
    )
  }
  if (goalies.length !== ROSTER_SHAPE.goalies) {
    check.add(`${path}.goalies`, `must hold ${ROSTER_SHAPE.goalies}, has ${goalies.length}`)
  }
}

/** Every problem with a would-be roster file for this structure. Empty when it can be imported. */
export function rosterFileProblems(value: unknown, structure: CompetitionStructure): string[] {
  const check = new Checker()
  const file = check.object(value, 'file', FILE_FIELDS)
  if (!file) return check.problems

  if (file.format !== ROSTER_FILE_FORMAT) {
    check.add('format', `must be "${ROSTER_FILE_FORMAT}"`)
    return check.problems
  }
  const version = file.formatVersion
  if (version !== ROSTER_FILE_VERSION) {
    check.add(
      'formatVersion',
      typeof version === 'number' && version > ROSTER_FILE_VERSION
        ? `${version} is newer than this version of the game reads (${ROSTER_FILE_VERSION})`
        : `must be ${ROSTER_FILE_VERSION}`,
    )
    return check.problems
  }
  if (file.competitionId !== structure.id) {
    check.add('competitionId', `must be "${structure.id}", got ${JSON.stringify(file.competitionId)}`)
  }

  const clubs = check.array(file, 'clubs', 'file') ?? []
  const ids = new Set<string>()
  clubs.forEach((club, i) => checkClub(check, club, `clubs[${i}]`, ids))

  const expected = structure.divisions.flatMap((division) => division.clubIds)
  const given = clubs.map((club) => (isFields(club) ? club.id : undefined))
  for (const clubId of expected) {
    const count = given.filter((id) => id === clubId).length
    if (count === 0) check.add('clubs', `has no Club "${clubId}"`)
    if (count > 1) check.add('clubs', `has Club "${clubId}" ${count} times`)
  }
  for (const id of given) {
    if (typeof id === 'string' && !expected.includes(id)) {
      check.add('clubs', `Club "${id}" is not in Competition "${structure.id}"`)
    }
  }
  return check.problems
}

// --- Import ---

/** What the file gives, and `rated` for every attribute it leaves out (ADR-020). */
function importedProvenance<K extends string>(
  keys: readonly K[],
  given: Partial<Record<K, AttributeProvenance>> | undefined,
): Record<K, AttributeProvenance> {
  const rated = { source: 'rated', confidence: DEFAULT_CONFIDENCE.rated } as const
  return Object.fromEntries(
    keys.map((key) => {
      const entry = given?.[key]
      return [key, entry ? provenanceEntry(entry) : { ...rated }]
    }),
  ) as Record<K, AttributeProvenance>
}

function importedClub(club: RosterFileClub): Club {
  const player = (entry: RosterFilePlayer) => ({
    id: entry.id,
    clubId: club.id,
    firstName: entry.firstName,
    lastName: entry.lastName,
    age: entry.age,
    potential: entry.potential,
    handedness: entry.handedness,
    // A Roster holds no Season: everyone starts rested and at even form.
    form: 50,
    fatigue: 0,
  })

  return {
    id: club.id,
    code: club.code,
    name: club.name,
    skaters: club.skaters.map(
      (skater): Skater => ({
        kind: 'skater',
        ...player(skater),
        preferredPositions: [...skater.positions],
        attributes: { ...skater.attributes },
        provenance: importedProvenance(SKATER_ATTRIBUTE_KEYS, skater.provenance),
      }),
    ),
    goalies: club.goalies.map(
      (goalie): Goalie => ({
        kind: 'goalie',
        ...player(goalie),
        attributes: { ...goalie.attributes },
        provenance: importedProvenance(GOALIE_ATTRIBUTE_KEYS, goalie.provenance),
      }),
    ),
  }
}

/**
 * The Rosters in a parsed file, Clubs in the order of the structure. Throws
 * `RosterFileError` naming every problem.
 */
export function rostersFromFile(value: unknown, structure: CompetitionStructure): CompetitionRosters {
  const problems = rosterFileProblems(value, structure)
  if (problems.length > 0) throw new RosterFileError(problems)

  const file = value as RosterFile
  const byId = new Map(file.clubs.map((club) => [club.id, club]))
  const clubs = structure.divisions
    .flatMap((division) => division.clubIds)
    .map((clubId) => importedClub(byId.get(clubId)!))
  return { structure, clubs }
}

/** The Rosters in a roster file's text. */
export function readRosterFile(text: string, structure: CompetitionStructure): CompetitionRosters {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    throw new RosterFileError([`file: is not JSON (${error instanceof Error ? error.message : 'unreadable'})`])
  }
  return rostersFromFile(value, structure)
}

/** Rosters from a file, behind the interface every Roster source shares (D-05). */
export function createFileRosterProvider(
  text: string,
  structure: CompetitionStructure,
): RosterProvider {
  // Read now, so a bad file fails where it is given rather than when a Season starts.
  const rosters = readRosterFile(text, structure)
  return {
    id: 'file',
    loadCompetition(competitionId: CompetitionId): Promise<CompetitionRosters> {
      if (competitionId !== structure.id) {
        return Promise.reject(
          new Error(`Roster file holds "${structure.id}", asked for "${competitionId}"`),
        )
      }
      return Promise.resolve(rosters)
    },
  }
}
