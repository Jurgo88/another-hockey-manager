# 00 - Overview

**Project:** Another Hockey Manager (AHM)
**Status:** Phase 1 - one Club, one Season, playable
**Owner:** Juraj Paluš
**Last updated:** 2026-09-18

## What this is

A text-first online hockey management simulation. The Manager picks the
Lineup, sets Tactics, and develops a Roster across Seasons. Matches are
simulated on the server and read back as a play-by-play and a box score.

The design reference is the original Eastside Hockey Manager (circa
2000-2002): tables, depth, and consequence - no rink animation, no arcade
layer.

## Why it exists

Primary goal is a portfolio piece that demonstrates domain modelling,
deterministic simulation, and test-driven validation of a non-trivial system.
Secondary and unconfirmed goal is a product. The architecture must not have to
be rewritten if the second goal activates, which is what drives ADR-003
(roster source abstraction) and ADR-004 (Manager is a row with a flag).

## Design thesis

**The simulation is the product.** Roughly all of the perceived quality of a
hockey manager comes from whether the match engine feels real, and whether the
Manager can answer the question *why did I lose?* from what the game shows
them. A manager game with a deep interface and a coin-flip engine is boring
within three matches.

Every scope decision in this specification follows from that: the engine is
built and statistically validated before any interface exists, and features
that do not change the outcome of a Match wait.

## Scope of Phase 0

In:

- Domain model for Player, Club, Lineup, Tactics, Fixture, Match
- Deterministic match simulation producing an event stream
- Statistics derived from the event stream
- Season scheduling on the real NHL 2026-27 structure (32 Clubs, 4 divisions,
  84 games) and standings - see ADR-006
- A CLI that simulates a Season and prints tables
- A realism test suite that gates the phase

Out (deferred, with the phase that owns them in `05-roadmap.md`):

- Any web interface, database, or authentication
- Real Roster import and the attribute estimator (Phase 0.5)
- Transfers, contracts, finances
- Scouting, youth development, drafting
- Multiplayer

## Non-goals, permanently

- A real-time server. Rejected: high complexity (websockets, disconnection
  handling, clock authority) for worse retention than an asynchronous model. A
  Manager can still coach during a Fixture, because it is revealed in steps
  (ADR-018).
- Rink visualisation. The event stream makes it cheap to add later if ever
  wanted, but it is not a goal.
- Licensed NHL club identity. Names and statistics are factual data; club
  marks and logos are not used. See ADR-003.

## Document map

| Document | Contents |
| --- | --- |
| `01-requirements.md` | FR / NFR / D / R identifiers |
| `02-domain-model.md` | Vocabulary, entities, attributes |
| `03-sim-engine.md` | Engine architecture and event schema |
| `04-validation-targets.md` | Statistical targets, as tests |
| `05-roadmap.md` | Phases 0-4 and their gates |
| `adr/` | Architecture decision records |

## Accepted decisions

| ADR | Decision |
| --- | --- |
| 001 | Monorepo with the simulation as a separate package |
| 002 | The simulation is a pure function emitting an event stream |
| 003 | Roster source behind an interface |
| 004 | A Manager is one entity with an `isAi` flag |
| 005 | i18n from the start, English hockey terminology |
| 006 | Real NHL 2026-27 competition structure and 84-game schedule key |
| 007 | Playoff formats are declarative data |
| 008 | Attributes carry provenance and confidence |
| 009 | Special-teams Units are ordered Skater lists; power-play events bracket a numerical advantage |
| 010 | Fatigue is one rising number, carried through the event stream on a day-based calendar |
| 011 | Goalie rotation is a Tactics rule applied before the Fixture |
| 012 | Injuries are events in the stream, and a Lineup answers them by moving up |
| 013 | A matchup costs fatigue, and shorter Shifts weaken it |
| 014 | A Season is plain JSON state advanced one day at a time |
| 015 | Playoffs are Fixtures added to the Season as they become due |
| 016 | A change at an intermission is part of the Fixture input |
| 017 | Nuxt on Supabase, with the browser kept away from Supabase |
| 018 | A Fixture is revealed in steps, and a change can come at any of them |
| 019 | Skaters ease at the regulation intermissions |
