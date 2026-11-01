# ADR-016 - A change at an intermission is part of the Fixture input

- **Status:** Accepted
- **Date:** 2026-11-01
- **Relates to:** OQ #12, FR-02, FR-30, D-01, D-03, D-04, D-08, ADR-002, ADR-012, ADR-014, issue #48

## Context

The author wants a Manager to change a Lineup during a Fixture. Real-time
coaching stays a permanent non-goal, but an intermission is turn-based, so OQ #12
asked whether it could be done. The question assumed `simulateFixture` would
have to run in parts, with its state stored between them.

## Decision

**`simulateFixture` still plays a whole Fixture in one call.** `FixtureInput`
gains `intermissions`: which Lineup a Club takes up after which Period. Taking
one up draws no random numbers, so every event before it stays byte-identical.
To go on, the Fixture is simply played again from its seed with one more change
in the input.

This keeps the function pure (D-01) with nothing suspended to store, and the
stored input and seed replay the Fixture as before (FR-02).

**A change is an event.** `lineup_change` follows the `period_end`, so a reader of
the stream can see that it happened.

**A Manager follows a Fixture through `season/`.** `openFixture` starts on a
Fixture of the next day, `fixtureSoFar` returns the events up to the current
intermission and the Lineups in force, and `continueFixture` takes any choices
and moves on. `advanceDay` then plays it with those choices. All of this is the
same for every Manager (D-04), and a Fixture nobody follows plays as before.

**There is no going back.** A choice is final once the next Period is shown, and
`setLineup` refuses a Club while one of its Fixtures is being followed. Otherwise
a Manager could see a bad Period, undo it and play it again.

**Only dressed Players take part.** A change rearranges the Lines, Pairings,
Units, Tactics and Goalies, and cannot bring anyone in from the Roster. A Player
hurt in this Fixture stays out whatever the new Lineup says (ADR-012). Only the
Goalie on the bench can go in, so a hurt Goalie cannot come back.

**The chance comes after each regulation Period.** After the third it counts only
if overtime follows. Between overtime Periods there is none.

## Options considered

**Running the engine in parts, with its state stored.** The question's own
assumption. Shift loop, penalty box, score and every random stream would all need
serialising, which is a second way of running the engine to keep correct.

**Rules set before the Fixture only.** Cheap, but it does not give the author what
was asked for.

**Keeping the choices out of the input.** Then the stored input would no longer
reproduce the Fixture, which breaks FR-02.

## Consequences

- OQ #12 is resolved.
- `Tactics` are now read during a Fixture rather than once at its start.
- The server must keep the later events from the client: `fixtureSoFar` returns
  only what has been shown, and #49 must not send anything else.
- Each step of following a Fixture plays it again, which costs a few milliseconds.
- An AI Manager does not use intermissions yet, so a Club that follows its Fixture
  has an edge the others lack. Whether that matters is for the Phase 1 gate.
