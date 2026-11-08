# ADR-026 - Players grow into their thirties, reading the game longest

- **Status:** Accepted
- **Date:** 2026-11-07
- **Supersedes:** the group table and the cap rule of ADR-022
- **Relates to:** D-06, D-08, D-11, ADR-020, ADR-021, ADR-022, ADR-023, issue #87

## Context

ADR-022 ages each attribute group along a measured NHL curve. Implemented as
written (#87), it peaks a Skater at 25-27 and stops a Goalie growing at about
22, since Goalies' save percentage is flat to 26 and then falls.

The author found that too early on 2026-11-06. A Goalie can reach the league at
24 and would never improve. A Player past 27 can still get better at the
tactical side of the game - positioning, reading play, defending - while speed
stops growing after 30. And quality veterans are part of the game: some real
Players are still good at 40.

The measured curves are honest about the league, but they are not a free
measurement of each skill. They pair only Players who stayed, Goalies' rest on
11 to 40 pairs an age, and none of them is an attribute (ADR-022). How the
growth of a Player's overall level splits between his skills is a design
choice.

## Decision

**Each group follows a curve whose growth ends at an age the author chose.**

| Group | Attributes | Curve | Growth until | Declines from |
| --- | --- | --- | --- | --- |
| Physical | `speed`, `stamina` | Top skating speed, growth drawn out a year | 29 | 29 |
| Skill | `shooting`, `puckControl`, `checking`; a Goalie's `reflexes`, `recovery` | Ice time, growth drawn out | 29 | about 31 |
| Reading the game | `passing`, `offPositioning`, `defPositioning`, `shotBlocking`, `faceoffs`; a Goalie's `positioning`, `reboundControl`, `puckHandling` | Ice time, growth drawn out | 32 | about 34 |
| Temperament | `discipline` | None | - | - |

**Growth is drawn out, not moved.** The measured ice-time curve grows from 18
to 26. A group that grows to 29 or 32 grows by the same amount in all, in
proportionally smaller steps, and its decline follows the measured one as many
years later. Moving the whole curve later was tried first: it more than doubled
a Skater's growth from 19 to 30, from 3.7 to 8.5 points, since every age before
the moved curve began took its steepest step. Speed is drawn out the same way
by a year, so its steep decline starts at 32 rather than 31.

**`potential` decides how far, the curve decides when.** The generator's room by
age now runs to 31 rather than 26 (`GROWTH_UNTIL`), so a Player of 28 still has
some. An 18-year-old has as much room in all as before, spread over more years.
The estimator draws real Players' `potential` the same way (ADR-021).

**The cap limits the level, not each attribute.** ADR-022 says an attribute grows
only while the level is below `potential`. Applied to each attribute, noise
would be cut only upwards at the ceiling, and every Player who reached his
`potential` would lose about 0.2 points an attribute each Season of his prime.
Instead, development may not lift the level above `potential`: when it would,
all rises are scaled down together until it lands there, and falls are not
capped. A Player at his ceiling can still get better at reading the game while
he slows down.

**The ice-time bonus lasts while skill still grows,** to 28 rather than 26.

Everything else in ADR-022 stands: one stream per Player and Season, the size
taken from the spread of each measure across the league and calibrated in item
8, and confidence falling 0.1 a Season to the generated floor.

## Options considered

**Keep ADR-022's measured curves.** Matches the league, and Goalies do not
develop after their early twenties, which a draft (ADR-024) cannot live with.

**Move the measured curves later.** Simple, but inflates growth, as above.

**Split growth from decline,** keeping the measured level by age and moving
only its make-up from physical to tactical. More faithful to the measured
league, but the author prefers veterans who stay good.

## Consequences

- A Skater's level, the mean of his attributes, grows to about 28, holds to 30
  and declines from 31; a Goalie's grows slowly to about 29. Measured on a
  generated league, development alone: +5.4 for a Skater from 19 to 29.
- The level of a real league peaks at 26-27 (ice time), so a ten-Season run will
  carry more good older Players than the NHL does. The Phase 2 gate keeps its
  age targets: leaving the league depends on age (ADR-023), and #88 holds the
  age profile there rather than in development.
- The career-shape target in `04-validation-targets.md` follows this ADR, not
  the measured curves.
- A backtest - real Players estimated for 2021-22, developed four Seasons and
  compared with their estimate for 2025-26 - is built with the calibration in
  item 8. It measures how far this design departs from the league; it is
  direct evidence only for `speed`, `faceoffs` and Goalies, which are measured.
