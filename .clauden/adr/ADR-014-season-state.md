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
