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
| Most goals in a Season | 54 | ±8 | A share alone cannot see goals running high. Measured: 53. |
| Tenth-most goals in a Season | 43 | ±5 | Measured: 42. |
| Skaters with 40+ goals | 15 | ±6 | Measured: 15. |
| Top-10 scorers by points, assists per goal | 1.75 | ±0.35 | The best Players must create as well as finish. Measured: 1.75. |
| Defencemen's share of goals | 15.2% | ±2.5 pp | Measured: 1,226 of 8,086. |
| Defencemen's share of assists | 31.3% | ±3 pp | Measured. |
| Defencemen's share of shots on goal | 27.6% | ±3 pp | Measured. |
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

### Rest

Measured from the NHL 2025-26 schedule and results, 2,592 Club-Fixtures (ADR-010).
Each cost compares a back-to-back with a two-day gap. They are small against
the noise of one Season, about ±0.10 goals, which sets the bands.

| Metric | Target | Band | Notes |
| --- | --- | --- | --- |
| Share of gaps that are back-to-backs | 16.6% | ±2.0 pp | Measured |
| Back-to-backs per Club, 84 Fixtures | 13.7 | ±1.5 | Measured 13.4, scaled |
| Goals for lost on a back-to-back | 0.20 | ±0.15 | Measured: 3.17 against 2.97 |
| Goals against added on a back-to-back | 0.05 | ±0.15 | Measured: 3.12 against 3.17 |
| Win rate lost on a back-to-back | 4.7 pp | ±3 pp | Measured: 50.5% against 45.8% |

### Goalie starts

Measured from the game log of every Goalie, 2,624 starts (ADR-011). The Goalie
rows above count 66 Goalies with 20 or more appearances. By starts it is 61,
which is what the engine counts, since it has no relief appearances yet.

| Metric | Target | Band | Notes |
| --- | --- | --- | --- |
| Goalies with 20+ starts | 61 | ±8 | Measured |
| Most-used Goalie out-saves the rest | 0.0065 | ±0.005 | Measured: 0.8985 against 0.8920 |
| Most-used Goalie, share of starts | 59.0% | ±5 pp | Measured, injuries included |

### Injuries

A proxy, since no injury record is public: Club Fixtures missed by 393 regular
Skaters, 2025-26 (ADR-012). The engine figure uses the Skaters of the regular
Lineups with 15 or more minutes a Fixture.

| Metric | Target | Band | Notes |
| --- | --- | --- | --- |
| Fixtures missed by regular Skaters | 12.8% | ±3 pp | Measured proxy |
| Absences per Club per Fixture | 0.46 | ±0.08 | Measured proxy, for 18 dressed |

### How the tier ratio is defined

The ratio row does **not** compare Lineup assignments. Published statistics
carry no line information, so the metric is defined on league-wide rank tiers
instead:

- Tier 1: forwards ranked 1-96 by points - 32 Clubs times 3 forwards
- Tier 4: forwards ranked 289-384 - the fourth-line band
- The ratio is the mean points of tier 1 over the mean points of tier 4

Ranks cover every forward who appeared, spares included, because the measured
ranks cover all 615 forwards of the league. The test first ranked only the 384
forwards of the regular Lineups, which put tier 4 at the very bottom of the
sample and overstated the ratio by about 0.2 (#15). No band moved.

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

### Calibration result

Issue #15, over 16 Seasons (seeds 1 to 16). The suite asserts seeds 1 to 8.

| Metric | Target | Band | Engine |
| --- | --- | --- | --- |
| League scoring leader, points | 141 | ±25 | 117.8 |
| Fifth-highest scorer, points | 106 | ±20 | 103.3 |
| Median Skater with 40+ Fixtures, points | 30 | ±6 | 27.1 |
| Forward tier-1 to tier-4 points ratio | 4.4 | ±0.8 | 4.86 |
| Forward tier-1 to tier-4 points-per-minute ratio | 2.71 | ±0.50 | 3.16 |
| Top-10 goalscorers' share of league goals | 5.7% | ±1.5 pp | 6.74% |
| Most-used Goalie out-saves the rest | 0.0065 | ±0.005 | 0.0103 |

What moved: the third and fourth Lines rose 0.05 and 0.10 in ability, assists
lean on the best passers on the ice, the backup Goalie slot rose from 0.82 to
0.83, and `ATTEMPT_BASE` fell from 0.36 to 0.355 to hold the goal rate.

**The leader and the points-per-minute ratio pull against each other, and the
room between them is narrow.** Stronger assist concentration lifts the leader
and widens the ratio. Seeds 9 to 16 alone put the leader below its band at about
115 with an assist exponent of 1.75, the suite's seeds above it, and the mean of
all 16 at 116.3, so 2 was chosen to centre both rows. Passing on seeds 1 to 8 is
not a margin.

**The top of the league is still too even.** The leader over the fifth-highest
scorer is 1.12 against a measured 1.34. No row asserts this. More generational
Players, a larger bonus or a larger first power-play share did not move it, and
a stronger shooter draw lifts all first-Line forwards together and breaks the
top-10 share. A single outlying star needs its own mechanism.

### Second calibration: who scores

Issue #74, after a play test found goal totals too high at the top. Scoring was
right for the league and wrong by Player. Over 16 Seasons (seeds 1 to 16), against
NHL 2025-26 scaled to 84 Fixtures:

| Figure | NHL | Before | Engine |
| --- | --- | --- | --- |
| Most goals | 54 | 63 | 53 |
| Tenth-most goals | 43 | 51 | 42 |
| Skaters with 50+ goals | 2 | 11.5 | 2 |
| Skaters with 40+ goals | 15 | 38 | 16 |
| Skaters with 30+ goals | 45 | 80 | 57 |
| Top-10 by points, goals | 41 | 53 | 42 |
| Top-10 by points, assists | 72 | 53 | 69 |
| Scoring leader, points | 141 | 119 | 124 |
| Defencemen's share of shots on goal | 27.6% | 17.8% | 27.3% |
| Defencemen's share of goals | 15.2% | 8.8% | 14.3% |
| Defencemen's share of assists | 31.3% | about 40% | 31.0% |
| Defencemen's share of points | 25.3% | 29.1% | 24.8% |
| Top-10 goalscorers' share | 5.7% | 6.72% | 5.51% |
| Forward tier-1 to tier-4 points ratio | 4.4 | 4.86 | 4.79 |
| Points-per-minute ratio | 2.71 | 3.16 | 3.11 |

The top scorers' shooting percentage was already right, at 17.8% against 17.3%.
They had too many shots because defencemen took too few, so forwards took them
instead. The top-10 share stayed inside its band throughout, which is why seven
rows were added.

What moved: the defenceman shooter weight rose from 0.5 to 0.9, the shooter draw
became the square root of the attributes divided by `passing` to the power 0.75,
the assist exponent rose from 2 to 4 with defencemen at half weight, and
`DANGER_BASE` rose from `logit(0.1255)` to `logit(0.145)` to hold the goal rate.
Seeds 9 to 16 agree with seeds 1 to 8.

**Assists are now too flat through the middle.** The 50th Skater by assists has 53
against a measured 44, and the best 84 against 92. A higher exponent lifts the top
and the middle together, and widens the tier ratio. No row asserts this.

**Too many Skaters still reach 30 goals,** 57 against 45. No row asserts this:
it needs the talent below the top Lines looked at, not a band.

## Phase 0.5 gate - the real season, simulated

The tiers above test the engine on generated Rosters. This gate tests the
attribute estimator (ADR-021): ten Seasons on the estimated NHL 2025-26 Rosters
(`packages/estimate/data/`) against what really happened that season.
`pnpm sim:validate` prints the full comparison;
`packages/estimate/test/validation.test.ts` holds the gate.

| Assertion | Gate | Measured |
| --- | --- | --- |
| Rank correlation of Club points, simulated mean against real | ≥ 0.6 | 0.72 |
| Of the real top 20 point scorers, in the simulated top 30 | ≥ 10 | 15 |
| Rank correlation of save percentage, Goalies with 40 or more real Fixtures | ≥ 0.4 | 0.85 |

**Why these thresholds.** One real season is one sample: luck over 82 Fixtures
alone keeps the correlation between true strength and points near 0.8, so a
perfect estimator would not reach 1. The thresholds ask for the right Clubs
roughly in the right places and the right Players near the top, not for the real
champion. The attributes are estimated from the same season they are compared
with, which flatters the result; the question is whether the estimator can
reproduce the season it read, not whether it predicts the next one.

**Calibration.** The first estimate measured 0.17, 5 and 0.27. What moved it is in
the ADR-021 amendment: the anchor of a Player's level, production in
`offPositioning`, the power play in `passing` and `offPositioning`, Goalie
attributes by percentile, and less shot speed in `shooting`. That reached 0.67,
13 and 0.88 with the engine unchanged. The naive Lineup then learned to use second
positions and to rank by level (#81), which put Kaprizov on Minnesota's first Line
beside Boldy and moved the gate to the figures above. A red row here means
calibrating the estimator, as for the tiers above.

**Still visible in the comparison.** Simulated scoring is flatter than real:
McDavid leads with 100 points against a real 138, the engine's known flat top
(Tier 2). Kaprizov still scores 65 against 89. A few forwards score far more than
they did, Hagel (89 against 74) and Holloway (77 against 51) among them.

## Phase 2 gate - ten Seasons in a row

A ten-Season run must produce a plausible league history: no runaway dynasty, no
collapse into uniformity, careers that read like careers. These are the
measured targets, from `07-league-over-time.md` (NHL 2015-16 to 2025-26), each
with a band as for Tier 1 and Tier 2. They run on a generated league and on the
NHL 2025-26 roster file, and Tier 1 and Tier 2 must hold in the tenth Season as
well as the first. A red row means calibrating development, departures or the
draft (ADR-022 to ADR-024), not widening the band.

### The age of the league, in the tenth Season

| Assertion | Measured | Band | Note |
| --- | --- | --- | --- |
| Mean age, weighted by Fixtures | 27.0 | ±0.7 | Ranged 26.4-27.6 over the decade |
| Players aged 31 or more | 18% | ±5 pp | Ranged 15.4-24.2% |
| Players aged 23 or younger | 30% | ±5 pp | Ranged 25.7-34.6% |
| Oldest Player | 39-45 | at least 38 | |

The same targets hold for a newly generated league (#84,
`test/realism/age-profile.test.ts`). The generator draws a Player's age from the
measured ages of NHL Players at his depth: the three ice-time thirds of
Players with 20 or more Fixtures for the slots that dress, and Players with
fewer for the spares and call-ups (`generate/nhl-age-profile.ts`, written by
`pnpm sim:measure --ages`). Over three seeds it measures a mean of 26.4-26.8,
16-19% aged 31 or more, 28-34% aged 23 or younger, and an oldest of 40-42. The
mean sits low in its band: development has to carry it, not fall from it.

### Leaving the league, per Season, Players with 20 or more Fixtures

| Age | Measured | Band |
| --- | --- | --- |
| 23 or younger | 4.4% | ±3 pp |
| 24-27 | 7.3% | ±3 pp |
| 28-30 | 7.4% | ±3 pp |
| 31-33 | 13.0% | ±4 pp |
| 34-36 | 23.0% | ±6 pp |
| 37 or older | 43% | ±12 pp |

| Ice time in his group | Measured | Band |
| --- | --- | --- |
| Top third | 1.3% | ±2 pp |
| Middle third | 5.3% | ±3 pp |
| Bottom third | 20.1% | ±6 pp |

### The draft, its first four classes, read in Season 10

| Round | 200 or more Fixtures, measured | Band | Median Seasons to debut, measured | Band |
| --- | --- | --- | --- | --- |
| 1 | 74.9% | ±12 pp | 1 | ±1 |
| 2 | 38.5% | ±12 pp | 3 | ±1 |
| 3 | 19.9% | ±10 pp | 3 | ±1 |
| 4 | 16.5% | ±10 pp | 3 | ±1 |

The first draft is held before Season 2, so the first four classes are those of
Seasons 2 to 5 (ADR-028). Seasons to debut are the first Season a prospect
plays in less the year of his draft, as measured: 0 is the Season right after
it. The class of Season 5 has six Seasons to reach 200 Fixtures; the measured
classes had eight to sixteen. The run may come in slightly low on round 1 for
that reason, and the band allows it.

### The table, across the ten Seasons

| Assertion | Measured | Band | What it guards |
| --- | --- | --- | --- |
| Correlation of Club point shares, consecutive Seasons | 0.51 | ±0.12 | Neither frozen nor random |
| Top 8 still top 8 the next Season | 46% | ±12 pp | |
| Bottom 8 still bottom 8 the next Season | 51% | ±12 pp | |
| Longest run of any Club in the top 8 | 7 in 11 seasons | at most 9 of 10 | No runaway dynasty |
| Clubs that finished first | 9 in 11 seasons | at least 5 of 10 | No runaway dynasty |
| Standard deviation of points over 84 Fixtures, tenth Season | 16.1 | ±3 | No collapse into uniformity |

### The shape of careers

Development is calibrated so that, Season after Season, the level of a generated
league by age keeps the shape the author chose in ADR-026, built on the measured
curves in `07-league-over-time.md`: physical attributes growing to 29, skill to
29 and reading the game to 32, a Skater's level holding from about 28 to 30, and
decline accelerating after 31. This departs from the measured league, whose level
peaks at 26-27, on purpose (ADR-026). The exact
assertion is written with the calibration in item 8, because the curves are in
different units and become one by that calibration.

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
| `exploit` and `shutdown` raise end-of-Fixture fatigue relative to `none` (ADR-013). |
| Raising `shiftLength` from 25 to 75 under `exploit` reduces the first Line's ice time (ADR-013). |
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
