# ADR-019 - Skaters ease at the regulation intermissions

- **Status:** Accepted
- **Date:** 2026-11-01
- **Supersedes in part:** ADR-010, on fatigue only rising during a Match
- **Relates to:** FR-09a, FR-14, FR-35, D-03, ADR-010, issue #72

## Context

After play testing, the author asked for fatigue to ease a little at the
intermissions, and to see a Skater's fatigue straight after a Shift.

ADR-010 had fatigue only rise during a Match. Fatigue is calibrated on the measured
cost of a back-to-back, so less of it at the end of a Fixture means less carried
into the next one, and this change moves results.

## Decision

**Fatigue eases after the first and second Periods.** `afterIntermission` leaves
0.9 of it at the bottom of the stamina scale and about 0.81 at the top. Stamina
works as it does for a day of rest.

**It does not ease in playoff overtime,** where FR-09a says fatigue keeps
accumulating, or before regular-season overtime, which has no real break.

**How much is set by the realism suite.** With every band held:

| Left at the bottom of the scale | Result |
| --- | --- |
| 0.90 | All green |
| 0.88 | Leader 115.6 against 116, starter gap and back-to-back cost just out |
| 0.85 | Back-to-back cost 0.02 goals against a lower limit of 0.05 |
| 0.80 | Back-to-back cost 0.04 goals |
| 0.70 | Back-to-back cost 0.02 goals |

More rest would need fatigue recalibrated, for example more of it carried over a
day. The author asked for a little, so 0.90 stands.

**A `fatigue` event reports it to a reader.** It names Skaters and their fatigue:
those coming off after a Shift, and a whole Roster at an intermission, before
`period_end`, so a Manager at the break sees the rest already taken. `match_end`
still carries fatigue on to the next Fixture, and the formulas stay in `fatigue.ts`.

## Options considered

**Easing at every break, overtime included.** Against FR-09a.

**A flat amount at each intermission.** A flat amount barely helps the Skaters who
are most tired, and it failed for a day of rest in ADR-010.

**More rest with fatigue recalibrated.** Possible, but a larger change than was
asked for.

## Consequences

- Median fatigue at the end of a Fixture falls from about 28 to about 23, at 0.88.
- Eight Seasons run at 6.22 goals per Fixture, inside the band, up from 6.13.
- All results change, so Seasons replayed from a seed differ from before.
- The leader, the starter gap and the back-to-back cost all sit near their limits.
  Passing on the suite's seeds is not a margin, as `04-validation-targets.md`
  says of the leader.
- Streams grow by one short event per Club per Shift.
