# ADR-013 - A matchup costs fatigue, and shorter Shifts weaken it

- **Status:** Accepted
- **Date:** 2026-11-01
- **Relates to:** FR-10, D-03, D-04, ADR-010, issues #14, #43

## Context

Tier 3 proves each Tactics dial moves its statistic in the right direction. It
says nothing about whether a dial is a decision. Measured over 8,000 home
Fixtures, in points per 84 Fixtures, `exploit` was worth +4.4 and `shutdown`
+3.3 with no cost anywhere, and the first Line played up to 25 minutes against
20. Every Manager should always have used one.

`shiftLength` was worth between +0.2 and +1.3, inside the noise, so it was not a
free gain. But `02-domain-model.md` says shorter Shifts give a matchup less
traction, and the code did not do that: `exploit` gave the first Line the same
25 minutes at every `shiftLength`.

## Decision

**A Shift a matchup sends a unit out for costs 2.5 times a normal one.** The Line
and Pairing the policy favoured pay it when they are the ones selected, and only
on that Shift. The unit plays outside its rest and against the hardest
opposition. The formula stays in `afterShift`, which gains an `effort` factor
(ADR-010).

**Shorter Shifts weaken the bias.** It scales linearly with the dial: the old
strength at `shiftLength` 50, double at 0, none at 100.

**The strength is set so a matchup is worth about nothing on average,** which
makes it a choice about the opponent and the Lineup, not a default. 2.5 is the
author's call among the measured options.

## Options considered

**The dial's bias alone.** What the specification already said, but at the
default `shiftLength` a matchup stays free, so the problem remains.

**A cap on first-Line minutes.** Stops 25 minutes, but it is a limit rather than
a trade-off, and a Manager gets nothing to weigh.

**A cost of 2 or 3.** At 2 a matchup still pays nearly always. At 3 `shutdown`
is a loss on average and would hardly be used.

## Consequences

| Points per 84 home Fixtures | `exploit` | `shutdown` |
| --- | --- | --- |
| Before | +4.4 | +3.3 |
| After, Roster seed 77 | +0.3 | +0.7 |
| After, Roster seed 11 | +2.1 | +1.4 |
| After, Roster seed 2026 | +2.8 | +1.8 |
| After, Roster seed 555 | -0.8 | +1.6 |

- The noise on one row is about ±1. The means are +1.1 and +1.4, or about +0.6
  points over a Season's 42 home Fixtures.
- These runs start every Fixture rested, so they miss what the extra fatigue
  costs in the next Fixture (ADR-010). The real net figure is lower.
- `shutdown` still takes 3 to 5% off the opposing first Line, on four Rosters.
- `exploit` with long Shifts is the strongest setting, at +3.2 on Roster seed 77.
  It is left open, because it is also the one that tires a Club most.
- Default Tactics use no matchup, so Tier 1 and Tier 2 are unaffected.
- Matchups still act only at home, where the Club has the last change.
