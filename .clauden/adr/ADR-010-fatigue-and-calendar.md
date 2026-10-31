# ADR-010 - Fatigue is one rising number, carried through the event stream on a day-based calendar

- **Status:** Accepted
- **Date:** 2026-10-31
- **Relates to:** FR-14, FR-24, D-01, D-03, D-08, D-10, issue #32

## Context

FR-14 asks for fatigue that accumulates within a Match and carries across a
congested schedule. Three things stood in the way.

**Fatigue did nothing.** A Skater gained about 2 points in a 45-second Shift
and recovered about 0.14 points per second on the bench, so every Skater was
back at zero within seconds. Nothing in possession resolution read it either.
`stamina` and `shiftLength` barely touched a result.

**A congested schedule could not be expressed.** A `Fixture` had a `round` but
no day, and every Club plays every round. There was no such thing as a
back-to-back.

**The end of a Match was discarded.** The engine's only output is the stream
(D-03), and the stream did not say where a Match left anybody. Deriving it from
`shift_change` events would have meant repeating the engine's formula outside
it, and `src/stats` may not import the engine.

The NHL 2025-26 regular season, pulled from
`api-web.nhle.com/v1/club-schedule-season/`, gives the targets:

| Gap to the previous Fixture | Share of gaps | Win rate | Goals for | Goals against |
| --- | --- | --- | --- | --- |
| 1 day (back-to-back) | 16.6% | 45.8% | 2.97 | 3.17 |
| 2 days | 61.5% | 50.5% | 3.17 | 3.12 |
| 3 days | 16.7% | 51.3% | 3.10 | 3.12 |
| 4 days or more | 5.3% | 55.1% | 3.29 | 3.12 |

A Club played 13.4 back-to-backs on average, between 9 and 16. Two things stand
out. Only the back-to-back costs anything: two days and three are the same. And
the cost falls on the attack: 0.20 goals for against 0.05 goals against.

## Decision

**A `Fixture` carries a `day`.** Each round spans two days, and a Fixture falls
on the later one with probability 0.21. Two independent draws then give a gap
of 1, 2 or 3 days with probabilities 16.6%, 66.8% and 16.6%, which is the
measured shape without the long gaps, and 13.8 back-to-backs per Club. Three
Fixtures in three days cannot occur, because a back-to-back takes the last day
of one round and the first of the next. The two numbers are data on the
`CompetitionStructure` (D-10).

**Fatigue is one number that only rises during a Match and only falls between
Fixtures.** One Shift adds in proportion to its length, at a rate that itself
grows with the length, so the same ice time in shorter Shifts costs less, and
scales with `stamina`. One day between Fixtures leaves a share of it, again
scaled by `stamina`.

**Fatigue reaches play through the unit composites.** It lowers `offence` four
times as hard as `defending`, following the measured split, and it shortens a
unit's Shift as before. It no longer steers which unit is selected, which keeps
deployment on the measured ice-time targets.

**The stream reports it.** Every stream ends with a `match_end` event carrying
the fatigue of every Skater on both Rosters, to two decimals. Goalies are not
included: they have no `stamina` to read (D-06), and whether they tire is a
question for #33. The Season runner plays Fixtures in calendar order and builds
each `FixtureInput` from the last `match_end` less the rest since. `Skater.fatigue`
was already part of the input, so `simulateFixture` does not change shape and
stays pure (D-01).

**D-08 is restated.** A Fixture's stream of random numbers stays independent of
every other Fixture. Its result no longer is: removing a Fixture changes how
tired some Skaters are for the next one, which is the point of FR-14. Replaying
a Fixture needs its input as well as its seed.

## Options considered

**Two numbers, a fast one cleared on the bench and a slow load carried between
Fixtures.** Closer to hockey, and it would capture a double Shift. Rejected for
now: it adds a state and more constants to calibrate, and the fast half was
close to doing nothing before.

**A full daily schedule with breaks and travel.** It would add the 5.3% of long
gaps and open the door to travel, but it stops the schedule composing from
rounds, which is what makes the 84-game key provable. Three and four days cost
the same as two in the measurement, so the long gaps carry little information.

**Fixed recovery per day instead of a share.** Tried first. It either let
first-Line fatigue saturate at 100 over a Season or cleared everyone below the
top Line by the next day, so a back-to-back cost almost nothing at Club level.

**Recomputing fatigue outside the engine from `shift_change` events.** Rejected:
the formula would exist twice, and the stats boundary would need a shared home
for it.

## Consequences

- The Tier 2 targets gain the back-to-back rows in `04-validation-targets.md`.
  The win-rate cost waits for #33: it was measured with backups in net on many
  back-to-backs.
- Fatigue takes about 9% off league goals, so `ATTEMPT_BASE` rises from 0.328
  to 0.35 to stay on the Tier 1 goal rate.
- Fatigue constants are measured where the table allows and provisional beyond
  that. Playoff overtime now does accumulate fatigue across Periods (FR-09a).
- The simulated Season must run in order. Simulating Fixtures in parallel is no
  longer possible across a Club's own Fixtures.
- The tier point ratio moves further from its target, from 5.9 to about 6.3 on
  a four-Season sample, because weak Lines have less `stamina` and tire more.
  That row is already red, and #15 owns it.
