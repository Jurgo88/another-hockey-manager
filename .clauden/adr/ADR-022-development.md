# ADR-022 - Players age along measured curves, by attribute group

- **Status:** Accepted; its group table and cap rule superseded by ADR-026, amended by ADR-028
- **Date:** 2026-11-03
- **Relates to:** D-01, D-06, D-08, D-11, ADR-008, ADR-020, ADR-021, issue #83, issue #87

## Context

Phase 2 plays Season after Season, so Players have to grow, peak and decline.
The author chose on 2026-11-02: age curves by attribute group, capped by
`potential`, with a small bonus for ice time played, acting on attributes
directly so that imported Rosters develop like generated ones.

What the real league does is measured in `07-league-over-time.md`, NHL 2015-16
to 2025-26, by the delta method against each season's league mean:

| Measure | Rises until | Holds until | Then |
| --- | --- | --- | --- |
| Forwards' 5v5 production | 22 | about 27 | about 3% of the mean a season, steeper after 32 |
| Defencemen's 5v5 production | 22 | about 28 | slower than forwards at first, then alike |
| Ice time per Fixture, the coaches' view of a Skater overall | 25 | 27 | accelerating: -0.3 minutes a season at 29, -1 at 35 |
| Top skating speed (one pair of seasons) | about 28 | - | about -0.1 to -0.2 mph a season |
| Goalies' even-strength save percentage | flat to 26 | - | about -1.5 thousandths a season, with a small sample |

The four measures are in different units, and none of them is an attribute.

## Decision

**Between Seasons, every Player's attributes move by his age, group by group.**
The author chose one curve per group:

| Group | Attributes | Curve |
| --- | --- | --- |
| Offensive | `shooting`, `passing`, `puckControl`, `offPositioning` | 5v5 production, forwards and defencemen apart |
| Physical | `speed`, `stamina` | Top skating speed, smoothed, since it rests on one pair of seasons |
| Defensive and role | `checking`, `defPositioning`, `shotBlocking`, `faceoffs` | Ice time per Fixture |
| Temperament | `discipline` | None. It does not age. |
| Goalie | all five | Goalies' save percentage |

**The shape comes from the measurement and the size from the league.** A
curve's change at an age is taken relative to how widely that measure is spread
across the league in a season, and applied as the same share of the attribute's
spread. The size is calibrated in item 8 against a measured target: the level of
a generated league, by age, has to keep the shape of the measured curves Season
after Season.

**`potential` caps growth, not attributes.** An attribute grows only while the
Player's level (ADR-020) is below his `potential`. Single attributes may still sit
above it. Decline is not capped. `potential` itself does not change.

**Ice time adds a little growth before the peak.** A Player under 27 who dressed
in most of his Club's Fixtures grows a little faster. The bonus is small: the
measured curves already contain the ice time real young Players got. Its size is
calibrated in item 8.

**Each Player's development draws from its own stream**, forked from the
Season's seed by Season and Player id, as Fixtures do under D-08. The noise around
the curve is sized from the spread of the measured season-to-season changes, so
some young Players boom and some stall.

**A changed value is trusted less (D-11).** Each Season of modelled development
lowers an attribute's confidence by 0.1, to the generated floor of 0.25. The
source stays and the note says how many Seasons of ageing followed it. A speed
measured at 24 is not a measurement at 30.

## Options considered

**One curve for everything,** the ice-time curve. Simpler and better measured,
but a fast youngster and a veteran playmaker would age alike.

**A curve per attribute.** The data does not reach that far: eleven curves from
four measures would be eleven guesses.

**Development in latent ability,** with attributes generated again. The generator
could reuse it, but it throws away what the estimator measured for a real Player.

## Consequences

- Development runs in the move from one Season to the next (item 3), before
  leaving (ADR-023) and the draft (ADR-024).
- Generated and imported Players develop by the same rule. The estimator's
  `potential` (ADR-021) decides how far a real young Player can grow.
- Measured confidence decays, so the interface shows wider ranges for a real
  league several Seasons on. That is honest, not a defect.
- The calibration target is the age profile of level in a ten-Season run, part
  of the Phase 2 gate in `04-validation-targets.md`.

## Amendment, 2026-11-10: the potential of young Players moves (#89, ADR-028)

Until a Player is 22, his `potential` moves each Season with the draw his
attributes share that Season, scaled up, and never falls below his level. From
23 it is settled. It is what makes the draft uncertain without a hidden second
ceiling (ADR-028).
