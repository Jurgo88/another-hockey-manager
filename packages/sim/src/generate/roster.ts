import { SKATER_ATTRIBUTE_KEYS, GOALIE_ATTRIBUTE_KEYS } from '../domain/attributes.js'
import type { Club } from '../domain/club.js'
import type { CompetitionId, CompetitionStructure } from '../domain/competition.js'
import {
  goalieLevel,
  skaterLevel,
  type Goalie,
  type Handedness,
  type Skater,
  type SkaterPosition,
} from '../domain/player.js'
import { uniformProvenance } from '../domain/provenance.js'
import { ROSTER_SHAPE, type CompetitionRosters, type RosterProvider } from '../domain/roster.js'
import { createRng, type Rng } from '../rng/index.js'
import { generateDistinctNames } from './names.js'
import {
  DEFENCE_SLOT_ABILITY,
  FORWARD_SLOT_ABILITY,
  GOALIE_ABILITY_NOISE,
  GOALIE_SLOT_ABILITY,
  clubStrengths,
  drawAbility,
  generateAgeAndHeadroom,
  generateGoalieAttributes,
  generateSkaterAttributes,
  potentialOf,
  type Ability,
} from './talent.js'

/**
 * Procedural Rosters. The default provider, and the only one a public build
 * uses (ADR-003).
 *
 * Deterministic: everything derives from one seed, and each Club draws from
 * its own forked stream, so adding or reordering Clubs does not change the
 * Players on the others - the same reasoning as D-08 for Fixtures.
 */

const FORWARD_SLOT_POSITIONS: readonly SkaterPosition[] = ['LW', 'C', 'RW']
const DEFENCE_SLOT_POSITIONS: readonly SkaterPosition[] = ['LD', 'RD']

function handedness(rng: Rng, position: SkaterPosition): Handedness {
  // Left-handed shots are the majority in hockey, more so among forwards.
  const leftChance = position === 'RD' || position === 'RW' ? 0.42 : 0.68
  return rng.chance(leftChance) ? 'left' : 'right'
}

function preferredPositions(
  rng: Rng,
  natural: SkaterPosition,
): readonly SkaterPosition[] {
  const winger: readonly SkaterPosition[] = ['LW', 'RW']
  const defence: readonly SkaterPosition[] = ['LD', 'RD']

  if (natural === 'C') {
    // Most centres can play a wing; some are centres only.
    return rng.chance(0.7) ? [natural, rng.pick(winger)] : [natural]
  }

  if (natural === 'LW' || natural === 'RW') {
    const other = natural === 'LW' ? 'RW' : 'LW'
    return rng.chance(0.55) ? [natural, other] : [natural]
  }

  const other = natural === 'LD' ? 'RD' : 'LD'
  return rng.chance(0.35) ? [natural, other] : [natural, ...defence.filter((p) => p !== natural && p !== other)]
}

const SKATER_PROVENANCE = uniformProvenance(SKATER_ATTRIBUTE_KEYS, 'generated')
const GOALIE_PROVENANCE = uniformProvenance(GOALIE_ATTRIBUTE_KEYS, 'generated')

/** Who a generated Player is, and the ability and age he is generated at. */
export interface GeneratedPlayerSpec {
  id: string
  clubId: string
  person: { firstName: string; lastName: string }
  ability: Ability
  age: number
  headroom: Ability
}

/**
 * One generated Skater at a given ability and age: a Roster slot, a gap in a
 * real Club, or a draft prospect. Draws handedness, positions and attributes,
 * in that order, which the random numbers of every Player after depend on.
 */
export function generateSkater(
  rng: Rng,
  spec: GeneratedPlayerSpec & { natural: SkaterPosition },
): Skater {
  const hand = handedness(rng, spec.natural)
  const positions = preferredPositions(rng, spec.natural)
  const attributes = generateSkaterAttributes(rng, spec.ability, spec.natural)

  return {
    kind: 'skater',
    id: spec.id,
    clubId: spec.clubId,
    firstName: spec.person.firstName,
    lastName: spec.person.lastName,
    age: spec.age,
    potential: potentialOf(skaterLevel(attributes), spec.ability, spec.headroom),
    handedness: hand,
    form: 50,
    fatigue: 0,
    preferredPositions: positions,
    attributes,
    provenance: SKATER_PROVENANCE,
  }
}

/** One generated Goalie at a given ability and age. */
export function generateGoalie(rng: Rng, spec: GeneratedPlayerSpec): Goalie {
  const hand: Handedness = rng.chance(0.75) ? 'left' : 'right'
  const attributes = generateGoalieAttributes(rng, spec.ability)

  return {
    kind: 'goalie',
    id: spec.id,
    clubId: spec.clubId,
    firstName: spec.person.firstName,
    lastName: spec.person.lastName,
    age: spec.age,
    potential: potentialOf(goalieLevel(attributes), spec.ability, spec.headroom),
    handedness: hand,
    form: 50,
    fatigue: 0,
    attributes,
    provenance: GOALIE_PROVENANCE,
  }
}

function generateClub(
  rng: Rng,
  clubId: string,
  code: string,
  name: string,
  clubStrength: number,
): Club {
  const names = generateDistinctNames(
    rng,
    ROSTER_SHAPE.forwards + ROSTER_SHAPE.defence + ROSTER_SHAPE.goalies,
  )
  let nameIndex = 0

  const skaters: Skater[] = []

  const addSkater = (slot: number, slotAbility: number, natural: SkaterPosition) => {
    const { ability } = drawAbility(rng, slotAbility, clubStrength)
    const { age, headroom } = generateAgeAndHeadroom(rng, ability)
    skaters.push(
      generateSkater(rng, {
        id: `${clubId}-s${String(slot).padStart(2, '0')}`,
        clubId,
        person: names[nameIndex++]!,
        natural,
        ability,
        age,
        headroom,
      }),
    )
  }

  FORWARD_SLOT_ABILITY.forEach((slotAbility, index) => {
    addSkater(index, slotAbility, FORWARD_SLOT_POSITIONS[index % 3]!)
  })

  DEFENCE_SLOT_ABILITY.forEach((slotAbility, index) => {
    addSkater(
      ROSTER_SHAPE.forwards + index,
      slotAbility,
      DEFENCE_SLOT_POSITIONS[index % 2]!,
    )
  })

  const goalies: Goalie[] = GOALIE_SLOT_ABILITY.map((slotAbility, index) => {
    const { ability } = drawAbility(rng, slotAbility, clubStrength, GOALIE_ABILITY_NOISE)
    const { age, headroom } = generateAgeAndHeadroom(rng, ability, 'goalie')
    return generateGoalie(rng, {
      id: `${clubId}-g${index}`,
      clubId,
      person: names[nameIndex++]!,
      ability,
      age,
      headroom,
    })
  })

  return { id: clubId, code, name, skaters, goalies }
}

export interface GeneratedRosterOptions {
  structure: CompetitionStructure
  seed: number
  /**
   * Club display names and codes. Supplying real ones is for local
   * development; a public build leaves this out and gets generated identities
   * (ADR-003).
   */
  clubIdentities?: ReadonlyMap<string, { code: string; name: string }>
}

export function createGeneratedRosterProvider(
  options: GeneratedRosterOptions,
): RosterProvider {
  const { structure, seed, clubIdentities } = options

  return {
    id: 'generated',

    loadCompetition(competitionId: CompetitionId): Promise<CompetitionRosters> {
      if (competitionId !== structure.id) {
        return Promise.reject(
          new Error(`Provider holds "${structure.id}", asked for "${competitionId}"`),
        )
      }

      const clubIds = structure.divisions.flatMap((division) => division.clubIds)
      const rng = createRng(seed)
      const strengths = clubStrengths(rng, clubIds.length)

      const clubs = clubIds.map((clubId, index) => {
        const identity = clubIdentities?.get(clubId)
        // Each Club gets its own stream, so the league is stable under
        // reordering - the same reasoning as D-08 for Fixtures.
        return generateClub(
          rng.fork(`club:${clubId}`),
          clubId,
          identity?.code ?? clubId.toUpperCase().slice(0, 3),
          identity?.name ?? `${clubId.toUpperCase()} Club`,
          strengths[index]!,
        )
      })

      return Promise.resolve({ structure, clubs })
    },
  }
}
