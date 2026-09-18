# ADR-002 - The simulation is a pure function emitting an event stream

- **Status:** Accepted
- **Date:** 2026-09-18
- **Relates to:** D-01, D-02, D-03, D-08, FR-01, FR-02, FR-11

## Context

Two shapes were possible for the engine's output. The simple one returns a
result - a score, and perhaps a statistics object. The other returns an
ordered stream of events from which everything else is derived.

The simple one is less code today. It also cannot be extended: a play-by-play,
a box score, per-Player statistics, or any later visualisation cannot be
recovered from a score. Retrofitting the stream means rewriting the engine's
core, because the information was never produced in the first place.

## Decision

`simulateFixture(input: FixtureInput, seed: number): MatchEvent[]`

Pure: no I/O, no clock reads, no ambient state, no `Math.random()`. All
randomness comes from an injected `Rng` seeded per Fixture via `fork`. The
event stream is the only output, and everything derived is folded from it by
`src/stats`.

## Rationale

**Extensibility.** Every reader - standings, box score, commentary, and a
rink animation if it is ever wanted - is a fold over the same stream.

**Single source of truth.** If the engine computed a score alongside the
stream, the two could disagree. That bug is invisible until a Manager reads
the play-by-play carefully, and at that point they stop trusting the game
entirely. One derivation path makes the class of bug impossible.

**Debuggability.** A seeded pure function means any Fixture is replayable
exactly. Without it, a wrong result cannot be investigated, only observed.

**Testability.** Determinism is what makes the realism suite a gate rather
than a source of flakes. Per-Fixture forking (D-08) additionally means adding
a Fixture does not shift the results of the others, so a Season is stable
under schedule changes.

## Consequences

- Statistics code is a separate module that may not import from `engine/`.
- Event schema changes are breaking changes to every consumer, so the schema
  deserves care up front.
- Storage: streams are larger than scores. At Phase 1 a Match stores its seed
  and can regenerate its stream, so only current-Season streams need to be
  persisted - if that even proves necessary.
- Slightly more work per event emitted, well inside the NFR-03 budget.
