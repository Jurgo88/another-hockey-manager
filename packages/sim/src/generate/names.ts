import type { Rng } from '../rng/index.js'

/**
 * Invented Player names, composed from syllable pools per hockey nation.
 *
 * ADR-003: a public build takes its Players from the generator, so the names
 * must not be real Players' names. Composing surnames from syllables rather
 * than drawing from a list of real surnames guarantees that, and it gives an
 * unlimited supply with national flavour instead of a fixed roster of names
 * that starts repeating in the second Season.
 *
 * Coincidental collisions with real people are unavoidable with any name
 * generator and are not the concern; shipping the actual NHL is.
 */

export type Nation = 'CAN' | 'USA' | 'SWE' | 'FIN' | 'CZE' | 'SVK' | 'RUS'

interface NationNames {
  /** Relative share of the generated population. */
  weight: number
  firstNames: readonly string[]
  /** Surnames are built as prefix + optional middle + suffix. */
  surnamePrefixes: readonly string[]
  surnameMiddles: readonly string[]
  surnameSuffixes: readonly string[]
  /** Chance a surname takes a middle syllable. */
  middleChance: number
}

const NATIONS: Readonly<Record<Nation, NationNames>> = {
  CAN: {
    weight: 42,
    firstNames: ['Trey', 'Colton', 'Bryce', 'Dawson', 'Keaton', 'Rylan', 'Tanner', 'Cale', 'Reid', 'Brady', 'Griffin', 'Landon', 'Carsen', 'Beckett', 'Quinton'],
    surnamePrefixes: ['Mar', 'Lang', 'Whit', 'Bran', 'Cald', 'Ther', 'Hal', 'Pel', 'Corm', 'Dev', 'Strat', 'Hart', 'Ren', 'Brack'],
    surnameMiddles: ['an', 'en', 'in', 'er', 'ing'],
    surnameSuffixes: ['ford', 'ley', 'don', 'combe', 'well', 'ton', 'shaw', 'wick', 'field', 'more'],
    middleChance: 0.3,
  },
  USA: {
    weight: 17,
    firstNames: ['Cooper', 'Hunter', 'Mason', 'Blake', 'Chase', 'Tucker', 'Parker', 'Grayson', 'Easton', 'Jonah', 'Wyatt', 'Camden', 'Bryson'],
    surnamePrefixes: ['Shel', 'Rad', 'Gil', 'Van', 'Nor', 'Merr', 'Kess', 'Tal', 'Brig', 'Hask', 'Cald'],
    surnameMiddles: ['er', 'in', 'an', 'is'],
    surnameSuffixes: ['baum', 'stad', 'wood', 'ridge', 'hart', 'mont', 'bury', 'stone', 'lake'],
    middleChance: 0.25,
  },
  SWE: {
    weight: 13,
    firstNames: ['Elias', 'Viktor', 'Anton', 'Lucas', 'Emil', 'Gustav', 'Filip', 'Axel', 'Oskar', 'Rasmus', 'Hampus', 'Linus'],
    surnamePrefixes: ['Lund', 'Berg', 'Ny', 'Sand', 'Ek', 'Hall', 'Sjö', 'Ström', 'Ålv', 'Käll', 'Grön'],
    surnameMiddles: ['en', 'ar', 'in'],
    surnameSuffixes: ['gren', 'qvist', 'ström', 'berg', 'lund', 'stad', 'holm', 'mark', 'dahl'],
    middleChance: 0.2,
  },
  FIN: {
    weight: 8,
    firstNames: ['Aatu', 'Veeti', 'Eetu', 'Joona', 'Niilo', 'Aleksi', 'Kasperi', 'Verneri', 'Oskari', 'Miro', 'Lauri'],
    surnamePrefixes: ['Hei', 'Kor', 'Vir', 'Lai', 'Nur', 'Pel', 'Rau', 'Sal', 'Tuo', 'Jär', 'Mäk'],
    surnameMiddles: ['ka', 'ti', 'la', 'no'],
    surnameSuffixes: ['nen', 'maa', 'salo', 'vaara', 'koski', 'lampi', 'ranta', 'harju'],
    middleChance: 0.45,
  },
  CZE: {
    weight: 7,
    firstNames: ['Jakub', 'Ondřej', 'Vojtěch', 'Matyáš', 'Šimon', 'Radek', 'Lukáš', 'Vilém', 'Dominik', 'Kryštof'],
    surnamePrefixes: ['Hor', 'Sva', 'Nov', 'Kub', 'Zel', 'Bař', 'Pro', 'Val', 'Kře', 'Sme'],
    surnameMiddles: ['á', 'o', 'e'],
    surnameSuffixes: ['ček', 'ský', 'nda', 'lík', 'ník', 'rda', 'vec', 'lka'],
    middleChance: 0.5,
  },
  SVK: {
    weight: 5,
    firstNames: ['Matúš', 'Marek', 'Samuel', 'Tobias', 'Richard', 'Adrián', 'Kristián', 'Dávid', 'Filip', 'Oliver'],
    surnamePrefixes: ['Hriv', 'Kmeť', 'Slov', 'Ďur', 'Bab', 'Hla', 'Zrn', 'Repk', 'Mihá', 'Šev'],
    surnameMiddles: ['á', 'o', 'i'],
    surnameSuffixes: ['ík', 'ovič', 'anec', 'árik', 'ko', 'čák', 'inec', 'ák'],
    middleChance: 0.4,
  },
  RUS: {
    weight: 8,
    firstNames: ['Artemi', 'Nikita', 'Kirill', 'Yegor', 'Daniil', 'Matvei', 'Semyon', 'Gleb', 'Timur', 'Rodion'],
    surnamePrefixes: ['Zhar', 'Molch', 'Grib', 'Sokol', 'Vorob', 'Lyap', 'Shesh', 'Kudr', 'Tarn', 'Beres'],
    surnameMiddles: ['a', 'o', 'i', 'e'],
    surnameSuffixes: ['ov', 'in', 'yev', 'sky', 'chuk', 'shin', 'kov', 'nov'],
    middleChance: 0.55,
  },
}

export const NATION_CODES = Object.keys(NATIONS) as readonly Nation[]

const TOTAL_WEIGHT = NATION_CODES.reduce((sum, code) => sum + NATIONS[code].weight, 0)

export function pickNation(rng: Rng): Nation {
  let roll = rng.next() * TOTAL_WEIGHT

  for (const code of NATION_CODES) {
    roll -= NATIONS[code].weight
    if (roll <= 0) return code
  }

  return 'CAN'
}

export interface GeneratedName {
  firstName: string
  lastName: string
  nation: Nation
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function generateName(rng: Rng, nation: Nation = pickNation(rng)): GeneratedName {
  const pool = NATIONS[nation]

  const prefix = rng.pick(pool.surnamePrefixes)
  const middle = rng.chance(pool.middleChance) ? rng.pick(pool.surnameMiddles) : ''
  const suffix = rng.pick(pool.surnameSuffixes)

  return {
    firstName: rng.pick(pool.firstNames),
    lastName: capitalise(`${prefix}${middle}${suffix}`),
    nation,
  }
}

/**
 * Generates `count` names with no duplicate full name in the batch.
 *
 * Duplicates inside one Club read as a bug even though they are legal, and the
 * syllable space is large enough that rejection sampling terminates quickly.
 */
export function generateDistinctNames(rng: Rng, count: number): GeneratedName[] {
  const seen = new Set<string>()
  const names: GeneratedName[] = []
  let guard = 0

  while (names.length < count && guard < count * 200) {
    guard++
    const name = generateName(rng)
    const key = `${name.firstName} ${name.lastName}`
    if (seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }

  if (names.length < count) {
    throw new Error(`generateDistinctNames could not produce ${count} distinct names`)
  }

  return names
}
