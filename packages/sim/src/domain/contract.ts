import type { PlayerId } from './player.js'

/**
 * A Player's contract with his Club (ADR-030). Money is held as a share of the
 * cap, so a league whose cap rises keeps its wages, and shown in currency only
 * through `CapRules.upperLimit`. A prospect holds no contract, only his rights.
 */
export interface Contract {
  /** The cap hit of every Season it runs, as a share of the cap. */
  capHit: number
  /**
   * Seasons left, this one included: 1 in its last Season. 0 between Seasons
   * means it has run out and the Player waits on the re-signing window.
   */
  years: number
  kind: 'entry-level' | 'standard'
  /** What the Player is when it runs out: restricted under the age `CapRules` sets. */
  onExpiry: 'restricted' | 'unrestricted'
}

/**
 * A Club keeping a Player whose contract ran out, at his ask, for `years`
 * (ADR-032). An expiring Player his Club does not list is let go.
 */
export interface ReSigning {
  playerId: PlayerId
  years: number
}

/** A rule a Club's re-signings break: data, so a Manager reads it in his own language. */
export type ReSigningViolation =
  | { kind: 'notExpiring'; playerId: PlayerId }
  | { kind: 'reSignedTwice'; playerId: PlayerId }
  | { kind: 'termOutOfRange'; playerId: PlayerId; years: number; max: number }

/** An entry-level contract's length by the Player's age when he signs it. */
export interface EntryLevelTerm {
  /** The oldest age at signing this length applies to. */
  upToAge: number
  years: number
}

/**
 * The rules contracts are made to, as data (D-10, ADR-030, ADR-031). This item
 * holds what is read today; the cap's enforcement, injury relief, retention and
 * buyouts join it where they are read (#125).
 */
export interface CapRules {
  /** The cap in currency, which every share is shown against. */
  upperLimit: number
  /** The least a contract may pay, as a share of the cap. */
  minimum: number
  /** The most one contract may pay, as a share of the cap. */
  maximum: number
  entryLevel: {
    /** The cap hit of an entry-level contract, as a share of the cap. */
    capHit: number
    /** By age at signing, youngest first; past the last, the last applies. */
    terms: readonly EntryLevelTerm[]
  }
  /** A contract running out before this age leaves its Player restricted. */
  restrictedUntil: number
  /** The longest contract in Seasons: with the Player's own Club, and with another. */
  maxTerm: { ownClub: number; otherClub: number }
}

/** The length of an entry-level contract signed at `age`. */
export function entryLevelYears(rules: CapRules, age: number): number {
  const { terms } = rules.entryLevel
  return (terms.find((term) => age <= term.upToAge) ?? terms.at(-1)!).years
}

/** What a Player whose contract runs `years` from age `age` is when it runs out. */
export function statusOnExpiry(rules: CapRules, age: number, years: number): Contract['onExpiry'] {
  return age + years - 1 < rules.restrictedUntil ? 'restricted' : 'unrestricted'
}
