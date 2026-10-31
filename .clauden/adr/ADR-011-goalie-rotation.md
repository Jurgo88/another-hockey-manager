# ADR-011 - Goalie rotation is a Tactics rule applied before the Fixture

- **Status:** Accepted
- **Date:** 2026-10-31
- **Relates to:** FR-20, FR-25, D-04, D-06, ADR-010, issue #33

## Context

The engine always read `lineup.starter`, and one Lineup served a whole Season,
so the backup never played. A Season used 32 Goalies, while the Tier 2 Goalie
rows were measured over many more, and a back-to-back cost nothing in net.

The game logs of all 98 Goalies who appeared in the NHL 2025-26 regular season
give 2,624 starts, every start of the season:

| Figure | Measured |
| --- | --- |
| Starts by each Club's most-used Goalie | 59.0%, between 35% and 77% |
| Starts by its second Goalie | 33.2% |
| Starts by anyone else | 7.8% |
| Same Goalie at both ends of a back-to-back | 8.1% |
| Most-used Goalie starts the second game of a back-to-back | 37.0% |
| Most-used Goalie starts any other game | 63.1% |
| Save percentage, most-used against the rest | 0.8985 against 0.8920 |
| Win rate, most-used against the rest | 52.1% against 45.4% |
| Goalies with 20 or more starts | 61 |

The back-to-back row is the useful one. 37.0% is almost exactly 100 minus 63.1,
so the pattern is not "the backup plays the second game". It is "whoever played
yesterday sits", whichever Goalie that was.

## Decision

**Rotation is a rule in `Tactics`.** `goalieRotation` holds `restOnBackToBack`,
that whoever played yesterday sits, and `maxConsecutiveStarts`, that whoever
has started that many Fixtures running sits the next. A Club with neither rides
its starter, which is how the 8.1% happens.

**The rule runs before the Fixture.** `lineupForFixture` turns the declared
Lineup into the one for that day, swapping `starter` and `backup` if the rule
says so. The engine still reads only `starter`, has no notion of rotation, and
a Manager can set the Goalie directly. Every Manager takes the same path (D-04).

**The `starter` returns as soon as the rule is satisfied.** Rotation has no
memory beyond who played last and how many running.

**Goalies do not tire.** They have no `stamina` to read (D-06), and the rule is
what the measurement supports. A Goalie's cost of a back-to-back is sitting out.

**The third Goalie stays out of the Lineup** until an injury brings them in
(#34). FR-20 dresses two.

**Generated Goalies move closer together.** Slot ability goes from 0.85 and
0.66 to 0.84 and 0.82, and Goalies draw with noise 0.02 instead of the Skaters'
0.04. At 0.66 a backup saved 0.836. The noise matters as much as the slots: the
better of two becomes the starter, so noise alone opens a gap between them.

## Options considered

**A share of starts, drawn per Fixture.** One number, but it cannot express the
strongest measured pattern, the back-to-back.

**Manual selection only.** Direct for a human, but an AI Manager would need its
own logic, against D-04.

## Consequences

- The naive Manager uses `maxConsecutiveStarts: 3`, giving the starter 72% of
  starts. The measured 59.0% includes injuries, so the row is asserted from #34.
- Goalies with 20 or more starts go from 32 to 64, against 61 measured, so the
  Tier 2 Goalie rows now mean what they say.
- The win-rate cost of a back-to-back is now asserted: 5.3 pp against 4.7 pp.
- The goals-for cost falls from 0.21 to about 0.16, because a Club behind against
  its own backup presses harder. It stays in its band.
- The gap in save percentage is 0.010 against 0.0065 measured. Selection keeps
  it above the measurement, and #15 may close it.
- `PENALTY_DISCIPLINE` goes from 0.5 to 0.42. These changes pushed the highest
  Club's penalties just over their band, and `discipline` is what separates
  Clubs there.
