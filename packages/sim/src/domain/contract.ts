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
  /** The re-signings add cap hit and leave the Club over the cap, at this payroll (ADR-031). */
  | { kind: 'overCap'; payroll: number }

/**
 * What a Club still pays for a contract it no longer holds (ADR-031): a buyout,
 * charged every Season until `years` run out.
 */
export interface DeadMoney {
  playerId: PlayerId
  /** Charged each Season, as a share of the cap. */
  capHit: number
  /** Seasons left, this one included. */
  years: number
}

/**
 * A Club's offer to a free agent in one round of the market (ADR-032): a cap hit
 * within a band about his ask, and a term.
 */
export interface Offer {
  playerId: PlayerId
  /** As a share of the cap. */
  capHit: number
  years: number
}

/** A rule a Club's offers break: data, so a Manager reads it in his own language. */
export type OfferViolation =
  | { kind: 'notFreeAgent'; playerId: PlayerId }
  | { kind: 'offeredTwice'; playerId: PlayerId }
  | { kind: 'outsideBand'; playerId: PlayerId; capHit: number; low: number; high: number }
  | { kind: 'termOutOfRange'; playerId: PlayerId; years: number; max: number }
  | { kind: 'noRoom'; group: 'forward' | 'defence' | 'goalie'; offers: number; room: number }
  | { kind: 'overCap'; payroll: number }
  /** With every offer taken, the Club could not dress a Lineup. */
  | { kind: 'cannotDress' }

/** How many of his first Seasons may slide, by the Player's age at signing. */
export interface SlideSeasons {
  /** The oldest age at signing this holds; older Players' contracts do not slide. */
  upToAge: number
  seasons: number
}

/** An entry-level contract's length by the Player's age when he signs it. */
export interface EntryLevelTerm {
  /** The oldest age at signing this length applies to. */
  upToAge: number
  years: number
}

/**
 * The rules contracts are made to, as data (D-10, ADR-030, ADR-031). What is
 * read today: the daily charge, injury relief and retention join it where they
 * are read, with moves during a Season (#129).
 */
export interface CapRules {
  /** The cap in currency, which every share is shown against. */
  upperLimit: number
  /** The floor, as a share of the cap: a Club below it is raised to it when a Season starts. */
  lowerLimit: number
  /** What a released contract leaves behind (ADR-031). */
  buyout: {
    /** The share of what is left that is still paid. */
    fraction: number
    /** That share for a Player younger than `youngUnder`. */
    youngFraction: number
    youngUnder: number
    /** What is paid is spread over this many times the Seasons left. */
    spread: number
  }
  /**
   * What the playoff cap counts: the dressed Lineup plus dead money at full cap
   * hits, or nothing, as in the NHL before 2025.
   */
  playoffs: 'dressed' | 'none'
  /** The least a contract may pay, as a share of the cap. */
  minimum: number
  /** The most one contract may pay, as a share of the cap. */
  maximum: number
  entryLevel: {
    /** The cap hit of an entry-level contract, as a share of the cap. */
    capHit: number
    /** By age at signing, youngest first; past the last, the last applies. */
    terms: readonly EntryLevelTerm[]
    /**
     * The slide (CBA 9.1(d)): a Player who signed young and plays fewer than
     * `games` NHL games in one of his first Seasons under the contract has it
     * extended a year, for as many Seasons as his age at signing allows.
     */
    slide: { games: number; seasons: readonly SlideSeasons[] }
  }
  /** A contract running out before this age leaves its Player restricted. */
  restrictedUntil: number
  /** The longest contract in Seasons: with the Player's own Club, and with another. */
  maxTerm: { ownClub: number; otherClub: number }
  /**
   * What a contract on the farm leaves off the cap, as a share of it: it counts
   * only by how much its cap hit exceeds this (ADR-036, CBA 50.5).
   */
  buried: number
  /**
   * A Player out at least `days` calendar days and `fixtures` of his Club's
   * Fixtures counts nothing against the cap while he is out (ADR-031, CBA 50.10).
   */
  longTermInjury: { days: number; fixtures: number }
  /**
   * A Club that cannot dress a Lineup for injuries and cannot afford a call-up
   * may call up a Player paid at most this, who counts nothing while the
   * emergency lasts (CBA 50.10(e)).
   */
  rosterEmergency: { maxCapHit: number }
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
