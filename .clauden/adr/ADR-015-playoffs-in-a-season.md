# ADR-015 - Playoffs are Fixtures added to the Season as they become due

- **Status:** Accepted
- **Date:** 2026-11-01
- **Relates to:** FR-09a, FR-16, FR-21, FR-29, D-08, D-10, ADR-007, ADR-011, ADR-014, issue #47

## Context

`qualify` and `seedPlayoffs` built the first round, but nothing played a series,
and the first round did not say who meets whom next. In the NHL bracket a
division winner meets the winner of its own division's second-against-third
series, and the list held those series apart.

## Decision

**A playoff game is an ordinary Fixture.** Each game day adds the next game of
every running series to `SeasonState.fixtures`, so `advanceDay` plays the
playoffs by the same path as the regular Season, and a game that a series does
not need is never scheduled. Each Fixture forks its stream from its own id (D-08).

**The bracket lives in the order of its series.** Series are listed so that the
winners of neighbours meet next. The NHL first round is rebuilt to that order,
and every later round pairs neighbours with no branch per format (D-10).
Reseeding between rounds is declared in the type and stops with an error, because
no format uses it yet.

**The better regular-Season record has home ice** in every round after the first.

**A round starts when the whole previous round is finished.** Games run every
second day, declared as `daysBetweenFixtures` on the format and unmeasured.

**Goalie rotation is a regular-Season rule, and it stops in the playoffs.** A rule
of two starts running would otherwise rest a starter in the middle of a series.
A Club still goes to its backup for an injury (ADR-012).

**The Season state keeps the regular-Season table,** folded one Match at a time,
because seeding needs it and the state keeps no Matches.

## Consequences

Measured over 32 Seasons, 480 series, against 165 NHL series from 2015 to 2026:

| Figure | Engine | NHL |
| --- | --- | --- |
| Higher seed wins the series | 56.0% ±2.2 | 57.0% |
| Games per series | 5.71 | 5.79 |

- Neither figure is asserted. Eight Seasons alone gave 50.8%, so a row would need
  far more Seasons than the suite runs.
- `simulateSeason` stops at the end of the regular Season, so the realism suite
  measures what it did before, and its results are unchanged.
- `PlayoffFormat` gains a required field, `daysBetweenFixtures`.
- Injuries and fatigue carry into the playoffs like any other Fixture.
