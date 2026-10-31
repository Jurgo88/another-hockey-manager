# 04 - Validation Targets

Phase 0 ends when the suite in `packages/sim/test/realism/` is green. Not when
the engine feels right (R-03). This document is the definition of done.

## Method

The reference Competition is the real NHL 2026-27 alignment - 32 Clubs, 4
divisions of 8, and the 84-game schedule key (ADR-006) - populated with
Rosters of a controlled talent spread. Using the real structure means the
figures below are directly comparable to published league statistics instead
of needing to be rescaled from a made-up league size.

Simulate 10,000 Fixtures from fixed seeds, fold the event streams into
statistics, assert each figure falls inside its band. One full Season is 1,344
Fixtures, so a multi-Season run is the natural sample for the Season-length
targets in Tier 2.

Determinism (FR-02) means these tests are stable: a failure is a real
regression, never flake.

## Tier 1 - Aggregate rates

Reference point is the NHL 2025-26 season, which ran at about 3.3 goals for
per Club per Fixture.

Figures below are **measured**, not estimated: they are the mean across all 32
Clubs from the NHL 2025-26 regular season, pulled from
`api.nhle.com/stats/rest/en/team/summary`, `.../team/powerplay`,
`.../goalie/summary` and `api-web.nhle.com/v1/standings/`. Two internal checks
confirm the pull: league goals for per game equals goals against per game to
three decimals (3.081 / 3.082), and shots for equals shots against (27.83 /
27.83), which must hold for a whole league and would not if the sample were
partial.

| Metric | Target | Band | Source |
| --- | --- | --- | --- |
| Goals per Fixture, both Clubs | 6.16 | ±0.30 | measured, 2025-26 |
| Shots on goal per Club per Fixture | 27.8 | ±2.0 | measured, 2025-26 |
| Shooting percentage | 11.1% | ±1.0 pp | measured, 2025-26 |
| League save percentage | 0.889 | ±0.008 | measured, 2025-26 |
| Power-play success | 21.1% | ±2.5 pp | measured, 2025-26 |
| Penalty-kill success | 78.9% | ±2.5 pp | measured, 2025-26 |
| Faceoff win rate, league-wide | 50.0% | ±0.5 pp | measured; a pure sanity check |
| Mean Club points, 84 Fixtures | 94 | ±3 | measured (0.562 points percentage), scaled |
| Penalties committed per Club per Fixture | 2.88 | ±0.15 | **derived** - see below |
| Power-play goals per Club per Fixture | 0.61 | ±0.06 | measured, 2025-26 |
| Power-play time per Club per Fixture | 285 s | ±20 s | measured, 2025-26 |
| Mean duration of one power play | 99 s | ±8 s | derived; a 120 s minor cut short by goals |
| Home win rate | 50.5% | ±1.5 pp | measured, 2025-26 |

### Penalties are derived, not estimated

A penalty committed by one Club is a power-play opportunity for the other, so
the league penalty rate is exactly the league power-play opportunity rate.
`api.nhle.com/stats/rest/en/team/powerplay` exposes `ppOpportunities`, which
gives **2.88 per Club per Fixture**.

The derivation closes on itself, which is what makes it trustworthy:

```
penalties against per Fixture  x  conversion  =  power-play goals per Fixture
            2.879              x   0.2111     =        0.608
                                      measured:        0.608
```

This is better than a wide tolerance band would have been. A wide band does
not make a guessed centre correct - it only makes the test unable to detect
that the centre is wrong. Three linked figures that must agree with each other
constrain the engine far harder than one loose figure: an engine can hit 2.88
penalties by accident, but hitting 2.88 penalties *and* 0.61 power-play goals
*and* 285 seconds of power-play time means the penalty rate, the conversion
rate and the early-termination behaviour are all right at once.

Power-play time carries information nothing else does. If penalties were
served in full, 2.88 minors would give 345 seconds. The measured 285 means
power plays end early often enough to lose a full minute per Fixture, which
only happens if goals are scored on them at a realistic rate and at realistic
moments.

### Club-to-club spread is a separate target

The figures above are league means and are tightly determined. How much Clubs
*differ* from each other is a different question and needs its own assertion,
or the engine could hit every league mean while making all 32 Clubs identical.

| Metric | Target | Band |
| --- | --- | --- |
| SD across Clubs of penalties per Fixture | 0.22 | ±0.10 |
| Lowest Club's penalties per Fixture | 2.40 | ±0.15 |
| Highest Club's penalties per Fixture | 3.24 | ±0.15 |
| SD across Clubs of home win rate | 10.6 pp | ±4 pp |

The two penalty extremes began as one range row with no band. An extreme of a
single Season is unstable, and a row with no band could not be asserted, so
each now carries the band of the league mean and is tested on the mean over
the suite's Seasons. A single Season may fall outside it.

An earlier draft of this document used 6.5 goals, 30 shots and a 0.900 save
percentage, taken from a summary page rather than measured. All three were
wrong, and the save percentage band excluded the real value entirely. The
lesson is recorded here rather than quietly corrected: a plausible-looking
reference figure is not a measured one.

## Tier 2 - Distribution (the real gate)

Tier 1 is easy. A naive engine that flips a coin weighted by Club rating
passes most of it. What it fails is Tier 2, and Tier 2 is what separates a
simulation from a random number generator (R-01).

Season-length figures are scaled to the **84-Fixture** 2026-27 season (ADR-006)
by multiplying the measured 82-game figure by 84/82.

Every row is now measured from the NHL 2025-26 season. Sample sizes: 940
Skaters appeared, 612 played 40 or more Fixtures, 615 were forwards, 66
Goalies appeared in 20 or more.

| Metric | Target | Band | Why it matters |
| --- | --- | --- | --- |
| League scoring leader, points | 141 | ±25 | A star must separate from the field. Measured: 138. |
| Fifth-highest scorer, points | 106 | ±20 | Guards against one freak outlier standing in for a real top tier. Measured: 103. |
| Median Skater with 40+ Fixtures, points | 30 | ±6 | The middle must not be dragged up toward the stars. Measured: 29 (rank 306 of 612). |
| Forward tier-1 to tier-4 points ratio | 4.4 | ±0.8 | Ice time and quality must compound. Measured: 71.8 against 16.3. |
| Top-10 goalscorers' share of league goals | 5.7% | ±1.5 pp | Guards against both a flat and a hyper-concentrated distribution. Measured: 460 of 8,085. |
| Goalie save percentage spread (p90 − p10) | 0.0335 | ±0.010 | Goalies must be differentiable, which is how the position earns its separate model. |
| Median goalie save percentage | 0.895 | ±0.008 | Measured over the same 66-Goalie sample. |
| Best Club points, 84 Fixtures | 124 | ±14 | Talent must translate to standings. Measured: 0.738 points percentage. |
| Worst Club points, 84 Fixtures | 59 | ±14 | And so must its absence. Measured: 0.354. |
| Standings points spread, best − worst | 65 | ±18 | Guards against a league where everyone finishes .500. |

### Ice time, and the decomposition of the point gap

| Metric | Target | Band | Notes |
| --- | --- | --- | --- |
| Forward tier-1 ice time per Fixture | 19:34 | ±1:00 | Measured; tier defined by ice-time rank 1-96 |
| Forward tier-4 ice time per Fixture | 12:03 | ±1:00 | Measured; ice-time rank 289-384 |
| Tier-1 to tier-4 ice-time ratio | 1.62 | ±0.12 | Measured |
| Tier-1 to tier-4 points-per-minute ratio | 2.71 | ±0.50 | Derived: point ratio over ice-time ratio |

These four rows exist to make a Tier 2 failure diagnosable. The 4.40 point
ratio is a product of two independent things, and only one of them is
deployment:

```
4.40 points  =  1.62 ice time  x  2.71 points per minute
```

If the ice-time rows pass and the points-per-minute row fails, unit selection
is correct and the shot model is too flat. If ice time fails, the problem is
in the Shift loop. Without this split, a red Tier 2 implicates every parameter
at once.

**The gap must not be closed with ice time.** Deployment is measured and worth
1.62x, no more. An engine that reaches 4.40 by playing its top Line 26 minutes
has the right number from the wrong mechanism, and a Manager reading a box
score will see it immediately.

### How the tier ratio is defined

The ratio row does **not** compare Lineup assignments. Published statistics
carry no line information, so the metric is defined on league-wide rank tiers
instead:

- Tier 1: forwards ranked 1-96 by points - 32 Clubs times 3 forwards
- Tier 4: forwards ranked 289-384 - the fourth-line band
- The ratio is the mean points of tier 1 over the mean points of tier 4

The test must compute it exactly this way. A league-wide rank tier is not the
same thing as a real first Line: the best 96 forwards cluster on good Clubs, so
tier 1 sits above the average actual first Line and tier 4 below the average
actual fourth Line. That makes the proxy overstate the gap relative to a true
per-Club comparison - which is harmless as long as the engine is measured by
the same definition, and misleading if anyone reads 4.4 as "a first Line
outscores a fourth Line four to one".

The ratio is scale-invariant, so it needs no 82-to-84 adjustment.

### Band widths

The Club-record bands are wider than the measurement precision would suggest,
deliberately: best and worst are the extremes of a single Season, and an
extreme is the least stable statistic there is. Anchoring a tolerance tightly
to one Season's outlier would turn normal variance into a test failure. The
median rows get tighter bands for the opposite reason - a median over hundreds
of players is stable.

### Two more estimates that were wrong

The tier ratio was estimated at 3.0 ±0.8 before measurement. The real figure
is 4.4, outside that band. This one mattered: real hockey concentrates scoring
*more* than the estimate assumed, so calibrating toward 3.0 would have
produced exactly the flat distribution that R-01 warns about - while the test
reported success.

The top-10 share was estimated at 8% ±3 and measured 5.7%, scraping inside the
band by 0.7 pp.

Counting the three Tier 1 errors, five of the estimated reference figures in
the first draft of this document were wrong, and two of them had bands that
excluded the true value. The estimates were not careless - they were
plausible, and that is the problem. Measured or marked, never assumed.

Points use the NHL scheme: 2 for a win, 1 for an overtime or shootout loss, 0
for a regulation loss. The targets above are only comparable to real standings
under that scheme, which is why OQ #1 resolved to it.

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
| Sum of per-Player points equals the goal count plus the assist count, with no orphan credits. |
| Power-play time derived from `powerplay_start` / `powerplay_end` pairs equals the time one Club had more Skaters on the ice than the other, not counting an extra attacker for a pulled Goalie (ADR-009). |
| No `powerplay_start` without a matching `powerplay_end`. |
| Clock is monotonically non-decreasing across the stream. |
| No Player appears in two units in the same `shift_change`. |
| Replaying any Fixture from its stored seed reproduces the stream exactly. |

## Failure protocol

A red band means calibrate engine parameters, not loosen the band. Bands move
only when a reference figure is shown to be wrong, and a band change is
recorded as a change to this document with a note saying why.
