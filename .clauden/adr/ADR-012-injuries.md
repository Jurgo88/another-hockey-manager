# ADR-012 - Injuries are events in the stream, and a Lineup answers them by moving up

- **Status:** Accepted
- **Date:** 2026-10-31
- **Relates to:** FR-20, FR-26, FR-27, D-03, D-04, ADR-010, ADR-011, issue #34

## Context

Injuries appeared in neither the specification nor the code. Rosters could not
lose anybody, so a scoring leader played every Fixture, no third Goalie ever
started, and depth decided nothing.

Public NHL data has no injury record, so the targets are a proxy: Club Fixtures
missed by 393 regular Skaters of the 2025-26 season, 20 or more appearances at
15 or more minutes for one Club, over 31,743 possible Fixtures. It also catches
suspensions and personal absences, and misses anyone hurt too early to reach
20 appearances.

| Figure | Measured |
| --- | --- |
| Fixtures missed | 12.8% |
| Absences per Skater, 82 Fixtures | 2.08 |
| Mean length, median length | 5.06, 2 |
| Skaters with no absence | 22.6% |

| Length in Fixtures | 1 | 2-3 | 4-7 | 8-15 | 16-30 | 31+ |
| --- | --- | --- | --- | --- | --- | --- |
| Share of absences | 40.9% | 23.1% | 16.0% | 12.3% | 6.1% | 1.5% |
| Share of Fixtures missed | 8.1% | 10.5% | 16.2% | 27.0% | 25.6% | 12.6% |

22 of the 32 Clubs started a Goalie beyond their first two, 7.9% of all starts.

## Decision

**An injury is an `injury` event, and that is its whole existence (D-03).** It
names the Player and the Club Fixtures they will miss. The Season runner folds
absences from it and draws nothing itself.

**Most come in a Match.** Between Shifts, each Skater who was on the ice may be
hurt in proportion to the seconds played, and so may the Goalie in net. Ice time
is exposure.

**15% come off the ice.** Before the opening faceoff the engine may mark any
dressed Player hurt, in training or by illness, and they miss this Fixture too.
The share is the author's call and is unmeasured. Drawing it inside
`simulateFixture` keeps it in the stream, where a draw in the Season runner would
have made a second source of truth.

**A Lineup answers by moving up.** The Player goes to the bottom of their column,
everyone below stepping up a Line or Pairing in the same position. In a Match the
slot left at the bottom fills from the dressed Skaters, as it does for a penalty.
Between Fixtures the best healthy spare for the position takes it, and stands in
on any special-teams Unit or overtime trio. The Goalie behind moves into net and
the next healthy Goalie on the Roster dresses. The same rule serves every Manager
(D-04), and a Manager's own Lineup returns when the Player does.

**Rosters grow to 16 forwards and 10 defencemen.** With two spare forwards the
measured rate runs out of forwards in about one Fixture in five. The last of the
depth stands in for call-ups. If a Roster still runs out, the injured Player
stays in the Lineup.

**Nobody changes a Lineup during a Match.** A Manager can change it between
Fixtures, and sets rules in advance. Real-time coaching remains a permanent
non-goal, but the author wants intermissions looked at: see OQ #12.

## Options considered

**Keeping 22 Skaters, and refusing an injury nobody could replace.** Simple, but
it protects a Club exactly when it is thinnest and undercounts injuries.

**Playing a Skater out of position.** Believable as a last resort, but such a
Lineup fails validation, and enough injuries still run out of Skaters.

**Replacing in the same slot, with no moving up.** Simpler, but a call-up on the
first Line is not what any Manager would do.

**Rebuilding the Lineup from quality.** Closest to a real coach, but it only
works for the naive Lineup and overwrites a human Manager's decisions.

## Consequences

- Skaters on the regular Lineups miss 11.6% of Fixtures against 12.8% measured,
  and Clubs lose 0.47 Players per Fixture against 0.46. The rate is per second
  against the 20 minutes of the measured Skaters, so a fourth Line gets hurt less.
- The most-used Goalie starts 59.5%, against 59.0% measured, with
  `maxConsecutiveStarts` at 2 instead of 3. Third Goalies start 4.6% against 7.9%.
- The third Goalie slot moves from 0.47 to 0.80. At 0.47 the gap in save
  percentage came to 0.022: a measured third-stringer is an NHL Goalie.
- `ATTEMPT_BASE` rises to 0.36 to hold the Tier 1 goal rate.
- Injuries reach neither fatigue nor form, and a Player returns at full strength.
- Goalies' relief appearances now exist, so a Goalie can appear without a start.

## Amendment, 2026-11-03: an absence keeps a return date (#97)

A count of the Club's Fixtures heals only as the Club plays, so a summer with no
Fixtures could heal nobody, and a Player out for 30 Fixtures in April would miss
30 in October. Seasons follow one another from Phase 2 (#85), so the author
decided on 2026-11-03 that an absence is kept as a date.

- The `injury` event carries `days`, the calendar days out from the day of its
  Fixture. The Fixtures missed are still drawn from the measured lengths above,
  and become days through the measured calendar, 2.1 days per Club Fixture: the
  Player is back half a Fixture's days after the last one missed, so the next
  Fixture is missed however the calendar falls. Off the ice this Fixture is the
  first one missed, as before.
- The Season keeps each absent Player's return day. They miss every Fixture
  before it, however many the Club plays meanwhile.
- The first conversion, with no half Fixture, let a one-Fixture injury end on the
  day of the next Fixture, and regular Skaters missed 10.8% of Fixtures. With the
  half Fixture they miss 11.6%, against 11.9% before the change and 12.8% measured,
  and Clubs lose 0.48 Players per Fixture as before.
- The measured lengths stop at 60 Fixtures, so nobody is yet out across a
  summer. Injuries long enough for that are #98.
