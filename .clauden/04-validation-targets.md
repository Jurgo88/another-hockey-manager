# 04 - Validation Targets

Phase 0 ends when the suite in `packages/sim/test/realism/` is green. Not when
the engine feels right (R-03). This document is the definition of done.

## Method

Generate a reference Competition of Clubs with a controlled talent spread,
simulate 10,000 Fixtures from fixed seeds, fold the event streams into
statistics, assert each figure falls inside its band.

Determinism (FR-02) means these tests are stable: a failure is a real
regression, never flake.

## Tier 1 - Aggregate rates

Reference point is the NHL 2025-26 season, which ran at about 3.3 goals for
per Club per Fixture.

| Metric | Target | Band | Source |
| --- | --- | --- | --- |
| Goals per Fixture, both Clubs | 6.5 | ±0.4 | hockey-reference 2025-26 |
| Shots on goal per Club per Fixture | 30 | ±3 | OQ #2 - verify |
| League save percentage | 0.900 | ±0.010 | OQ #2 - verify |
| Power-play success | 20% | ±3 pp | OQ #2 - verify |
| Penalties per Club per Fixture | 3.0 | ±0.7 | OQ #2 - verify |
| Home win rate | 54% | ±3 pp | - |
| Shooting percentage | 10% | ±1.5 pp | derived from goals / shots |

Three of these are marked for verification: hockey-reference's season summary
confirmed goals, but shots, save percentage and power-play rate live on detail
pages and were not read. Verify before treating the bands as authoritative.

## Tier 2 - Distribution (the real gate)

Tier 1 is easy. A naive engine that flips a coin weighted by Club rating
passes most of it. What it fails is Tier 2, and Tier 2 is what separates a
simulation from a random number generator (R-01).

| Metric | Target | Band | Why it matters |
| --- | --- | --- | --- |
| League scoring leader, points per Season | 105 | ±20 | A star must separate from the field. |
| Median rostered Skater, points per Season | 30 | ±10 | The middle must not be dragged up to the star. |
| Ratio of first-Line to fourth-Line points | 3.0 | ±0.8 | Ice time and quality must compound. |
| Top-10 scorers' share of league goals | 8% | ±3 pp | Guards against both a flat and a hyper-concentrated distribution. |
| Goalie save percentage spread (p90 − p10) | 0.030 | ±0.012 | Goalies must be differentiable, which is how the position earns its separate model. |
| Best Club points, 82 Fixtures | 115 | ±12 | Talent must translate to standings. |
| Worst Club points, 82 Fixtures | 60 | ±12 | And so must its absence. |
| Standings points spread, best − worst | 55 | ±15 | Guards against a league where everyone finishes .500. |

## Tier 3 - Tactics are not placebos

Each dial must have a measurable, directionally correct effect. Method: hold
Rosters and seeds fixed, vary one dial, compare aggregates.

| Assertion |
| --- |
| Raising `aggression` from 25 to 75 increases both shots for and shots against, and increases penalties taken. |
| Raising `shotVolume` from 25 to 75 increases shot count and decreases mean shot `danger`. |
| Raising `shiftLength` from 25 to 75 reduces end-of-Fixture fatigue across the Roster. |
| `matchup: 'exploit'` increases first-Line point production relative to `none`. |
| `matchup: 'shutdown'` reduces opposition first-Line point production relative to `none`. |
| A Club fielding its best Lineup beats the same Club fielding its worst Lineup over 1,000 Fixtures at a rate above 65%. |

## Tier 4 - Internal consistency

Cheap, and they catch the bugs that erode trust (D-03).

| Assertion |
| --- |
| Goals derived from the stream equal the count of `goal` events. |
| Every `goal` event is preceded by a `shot` event with `result: 'goal'` at the same clock. |
| Every `save` event corresponds to a `shot` with `result: 'save'`. |
| Shots on goal equal goals plus saves. Blocks and misses are excluded. |
| Sum of per-Player points equals twice the goal count plus assist count, with no orphan credits. |
| Power-play time derived from `powerplay_start` / `powerplay_end` pairs equals penalty minutes served. |
| No `powerplay_start` without a matching `powerplay_end`. |
| Clock is monotonically non-decreasing across the stream. |
| No Player appears in two units in the same `shift_change`. |
| Replaying any Fixture from its stored seed reproduces the stream exactly. |

## Failure protocol

A red band means calibrate engine parameters, not loosen the band. Bands move
only when a reference figure is shown to be wrong, and a band change is
recorded as a change to this document with a note saying why.
