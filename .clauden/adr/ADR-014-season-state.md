# ADR-014 - A Season is plain JSON state advanced one day at a time

- **Status:** Accepted
- **Date:** 2026-11-01
- **Relates to:** FR-28, D-01, D-03, D-04, D-08, ADR-002, ADR-004, issue #46

## Context

`simulateSeason` played a whole Season inside one function, holding fatigue,
Goalie history and absences in local variables. A web application has to stop
after any day, keep the Season through a restart, and let a Manager change a
Lineup before the next Fixture.

The function lived in `cli/`, the one module allowed to import the generator,
the engine and the folds together, and the application must not depend on a CLI.

## Decision

**A new module, `season/`, may import domain, rng, generate, engine and stats.**
`cli/` and the application both use it. `stats/` still imports domain only.

**`SeasonState` is plain JSON, and every step is pure.** `startSeason` makes the
state, `setLineup` declares a Lineup, and `advanceDay` plays the next day that
has Fixtures and returns a new state with what was played. A caller may store the
state after any step.

**The random numbers are not stored.** Each Fixture forks its stream from the
Season seed (D-08), so the seed is enough.

**Event streams are not part of the state.** `advanceDay` hands them to the
caller, with the input and seed of each Fixture. What to keep is a storage
question for #49.

**`setLineup` is the only way to declare a Lineup, for every Manager (D-04).** AI
Clubs open through it. It rejects a Lineup that fails validation with
`InvalidLineupError`, which names the rules broken. The state holds no Manager:
nothing in a Season may read `isAi`, so that row belongs to the application.

## Options considered

**The module in `engine/`.** No new module, but `engine/` would import `generate/`
and `stats/`, against the boundaries.

**The logic in `apps/web`.** The CLI and the realism suite could not use it, so
the path that AI Clubs take would go untested.

**A class holding the state.** Tidier calls, but it has to be serialised by hand,
and a field left out of that would only show up as a changed result.

## Consequences

- Storing and reloading the state between every two days changes no event.
- `simulateSeason` gives the same results as before the change, checked by a hash
  over two Seasons, and now runs through the path the application will use.
- The state holds whole Rosters and all Fixtures, so it is larger than a row
  should be. #49 decides how to split it.
- A Lineup that lists an injured Player is valid, and is answered by moving up
  (ADR-012).

## Amendment, 2026-11-04: one Season after another (#85)

Phase 2 plays Seasons in a row. The state stays one plain JSON value, and the
move between Seasons is one more pure step, `nextSeason`, allowed once a Season
has its champion.

- **What carries over.** The Rosters, a year older, rested and at neutral form;
  each Club's declared Lineup while it is still valid, and otherwise the
  assistant's Lineup with the same Tactics, the same rule for every Club (D-04);
  absences, by the calendar. `year` counts the Seasons of the run. What is kept
  of a finished Season lives beside the state, not in it (ADR-025, #86).
- **What starts again.** The schedule, the table, the counts, the playoffs,
  fatigue, rest and Goalie rotation.
- **Random numbers.** Each Season draws its schedule from a stream of its own,
  `schedule:y<year>`, and its Fixtures carry the Season in their ids,
  `s<seed>-y<year>-…`, so their streams are new as well (D-08). The first Season
  keeps the stream `schedule` and the ids `s<seed>-…` it had before, so stored
  Seasons and every earlier result stay as they were.
- **The calendar.** A Competition's calendar declares the days from one Season's
  first day to the next, 365 for the NHL (D-10). A return day moves back by that
  much, and a Player still out on the new first day misses the start of the
  Season (ADR-012).
- Development, leaving the league and the draft (ADR-022 to ADR-024) are steps
  of this move, added in that order by their own items.
- Stopping and reloading between Seasons, or on any day within one, changes no
  result over three Seasons from one seed.

## Amendment, 2026-11-10: the phase between Seasons (#89, ADR-028)

The move between Seasons is no longer one step. `endSeason` turns a Season with
a champion into an `Offseason`, a plain JSON value of its own, in which
Managers decide: a draft window (`setDraftList`, `runDraft`) and a Roster window
(`proposedMoves`, `setRosterMoves`). `startNextSeason` makes the next Season
from it. Each is a pure step, and stopping between any two changes nothing.
`nextSeason` stays as all of them with nothing declared. Prospects and the draft
held before a Season are part of its state.

## Amendment, 2026-11-10: a Season of any Competition (#106)

`startSeason` takes the Competition it starts as data: its structure, playoff
format and draft format (D-10). Left out, it is the NHL 2026-27, as before, and
so is every result. A provider that is not given is the generator for that
structure. Nothing in a Season's steps reads the NHL directly: they read the
formats the state carries.

The tests use this for a small Competition of 8 Clubs, two Conferences of two
Divisions, with a short schedule, a two-round bracket and a one-round draft.
Tests that need a Season only as an input play it, and tests of the NHL's own
shape keep the NHL.
