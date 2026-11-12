# Another Hockey Manager

A text-first online hockey management simulation. Pick the Lineup, set the
Tactics, develop the Roster across Seasons. Matches are simulated
deterministically and read back as a play-by-play and a box score.

Design reference: the original Eastside Hockey Manager, circa 2000-2002 -
tables, depth, and consequence.

**Status:** Phase 0, building and validating the simulation engine. Not
playable yet.

## Why the engine comes first

Most of the perceived quality of a manager game is whether the match engine
feels real, and whether the player can answer *why did I lose?* from what the
game shows them. So the engine is built and statistically validated against
real league rates before any interface exists.

Phase 0 is done when the realism suite is green - see
[`.clauden/04-validation-targets.md`](.clauden/04-validation-targets.md).

## Layout

```
packages/sim/          simulation engine, zero runtime dependencies
  src/domain/          entities, attributes, event schema
  src/rng/             deterministic randomness
  src/engine/          shift loop, possession resolution
  src/stats/           folds over the event stream
  src/cli/             simulate a Season, print tables
packages/estimate/     real NHL Rosters from public data, as a roster file
apps/web/              the application, on Nuxt
supabase/              local Supabase and migrations
.clauden/              specification and architecture decision records
```


## Getting started

```bash
pnpm install
pnpm test
pnpm sim:season
```

Requires Node 20.11+ and pnpm 9.

To run the application, with Docker running:

```bash
pnpm db:start
cp apps/web/.env.example apps/web/.env    # fill in the keys from `supabase status`
# optional: NUXT_ROSTER_FILE in apps/web/.env offers the real 2025-26 Rosters
# (packages/estimate/data/nhl-20252026.json) beside generated ones, locally (ADR-003)
pnpm web:dev
```

## Design principles

The engine is a pure function: `simulateFixture(input, seed) => MatchEvent[]`.
No I/O, no `Math.random()`, no ambient state. Any Fixture can be replayed
exactly from its seed.

The event stream is the only output. Box scores, standings and player
statistics are all folded from it, so the play-by-play and the statistics
tables cannot disagree.

Full reasoning in [`.clauden/`](.clauden/).

## A note on data

Club marks and logos are not used. Roster data comes from a generator by
default; a real-data import path exists for local development only. See
[`ADR-003`](.clauden/adr/ADR-003-roster-source-abstraction.md).
