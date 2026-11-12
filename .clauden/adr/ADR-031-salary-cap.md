# ADR-031 - A hard cap, charged by the day, with injury relief and a cap on the playoff Lineup

- **Status:** Accepted
- **Date:** 2026-11-12
- **Relates to:** FR-20, D-04, D-08, D-10, ADR-012, ADR-014, ADR-015, ADR-030, ADR-033, ADR-034, issue #121

## Context

Contracts are priced as shares of the cap (ADR-030). The cap decides how much
talent one Club can hold, so it is the mechanism that keeps a ten-Season run
from converging or running away: the table targets deferred from the Phase 2
gate wait on it.

How the NHL's cap works, as the 2025 memorandum of the CBA left it:

- **The regular season**: a Club's cap hit accrues day by day. A Club with room
  saved can take on a Player whose full cap hit would not fit, because only the
  days left are charged. A Player acquired with 25% of the season left costs a
  quarter of his cap hit that season. This is why trades bunch before the
  deadline.
- **Long-term injury relief**: a Player out for at least 24 days and 10 games
  may be replaced above the cap. Since 2025, relief is limited to the league's
  average salary if he is expected back that season.
- **The playoffs**: until 2025 no cap applied, and Clubs kept a star on long-term
  injury through the season, spent his room at the deadline, and brought him
  back for the playoffs. From the 2026 playoffs, the 20 Players dressed for each
  game, plus dead money (buyouts, penalties, retained salary), must fit under
  the cap at full cap hits, not prorated, with no injury relief. A Player
  acquired with salary retained counts at the reduced figure.
- **Buyouts** cost two thirds of what is left, one third for a Player under 26,
  spread over twice the remaining term.
- **Retention**: a Club trading a Player may keep up to 50% of his cap hit, on
  at most three contracts at once.

The author chose on 2026-11-12: a hard cap with a floor, a Player on long-term
injury not counting while he is out, the cap charged by the day, and the
playoff cap on the dressed Lineup.

## Decision

**The cap rules are data (D-10).** A Competition declares `CapRules` beside its
draft format: the upper and lower limits as shares (1.0 and 0.739 for the NHL
of 2026-27), the currency value of the upper limit, the minimum and maximum
contract shares and the entry-level terms of ADR-030, the threshold of
long-term injury, the playoff regime, the retention limits and the buyout
fractions. The NHL's rules before 2025 are a value with no playoff cap, not a
branch.

**What counts.** Every contract on the Roster, the 16-10-3 shape of ADR-020, and
the Club's dead money: buyouts, and the share it retained on Players it traded.
Prospects hold rights, not contracts, and count nothing. The Roster's last
Players stand in for call-ups (ADR-012), and they count, at the minimum their
role asks.

**The regular Season is charged by the day.** Each day of the regular Season a
Club is charged its counted cap hits divided by the days of the regular Season.
A move is valid when the charge so far, plus the payroll after the move times
the share of the Season left, stays under the upper limit. Between Seasons the
payroll for the Season ahead must stay under it. The check is the same for
every Club (D-04).

**Long-term injury does not count.** A Player whose return day (ADR-012) is at
least 24 days and 10 of his Club's Fixtures away counts nothing from the day he
is hurt until the day he is back. The relief is whole, not limited to the
league's average salary as the NHL now limits it. When he returns, his Club may
stand over the cap; it then may not make a move that adds cap hit until it is
under again. Nothing is forced, because the playoff cap below closes the
loophole that forced compliance used to guard.

**The playoffs cap the Lineup.** Before each playoff Fixture, the full cap hits
of the 18 Skaters and 2 Goalies the Lineup dresses (FR-20), plus the Club's dead
money, must fit under the upper limit. There is no injury relief. A traded
Player counts at what his new Club pays. A Lineup that breaks it is refused
with the rule named, as any `LineupViolation`, and the assistant's Lineup
(FR-34) is the best Lineup that fits, for every Club (D-04).

**The floor binds when a Season starts.** A Club below the lower limit when the
next Season starts is brought up to it: its lowest contracts are raised
together until the payroll reaches the floor, as the NHL charges a Club the
shortfall. The assistant avoids it by spending; a Manager who does not pays it
anyway.

**A release is a buyout.** The released Player's remaining cap hit becomes dead
money at the Competition's fractions, spread over twice the years left, and he
becomes a free agent (ADR-032).

## Options considered

**A hard cap checked on full annual cap hits.** Simpler: a Club's payroll may
never exceed the limit. A deadline acquisition would cost as much as one made
in October, so nothing would bunch trades before the deadline.

**Injury relief limited to the league's average salary,** as the NHL now does.
Faithful, but the author chose whole relief, which is simpler and, with a
playoff cap, no longer a loophole.

**Forced compliance when an injured Player returns.** The NHL requires it, and a
Club must trade or waive someone. Without minor leagues a forced release would
be a buyout, a heavy price for an injury. Freezing moves instead, with the
playoff cap binding, keeps the consequence without the forced loss.

**No cap in the playoffs,** the NHL before 2025. It would let any Club with a
long-term injury build a playoff Roster above the cap.

**A soft cap with a luxury tax.** It needs money beyond wages, which the
roadmap leaves out.

**Only the dressed Players count in the regular Season.** The NHL counts its
active roster of up to 23, not the minor leagues. The 16-10-3 Roster already
includes the call-ups, so counting it whole is the nearest equivalent.

## Consequences

- The Season state carries each Club's charge so far and its dead money. Moves
  during a Season (ADR-033) check it.
- The playoff cap reaches the Lineup builder: the assistant's best Lineup is now
  constrained by money in the playoffs.
- `MovesViolation` and `LineupViolation` gain cap violations, so a Manager reads
  the rule in his own language.
- A strong Club cannot keep every good Player: re-signing a star means paying his
  ask, which pushes out others. This is the mechanism expected to hold the table
  targets of the Phase 3 gate.

## Amendment, 2026-11-12: the cap between Seasons, the floor, buyouts and the playoff cap (#129)

Item 4 of Phase 3. The author chose on 2026-11-12:

- **The daily charge and long-term injury relief move to item 6.** Both matter
  only to moves during a Season, which trades bring; without them they would be
  state nothing reads. Until then every Roster change happens between Seasons,
  where the payroll for the Season ahead is what counts.
- **The rules as data** gain the lower limit (0.739, $76.9M), the buyout
  fractions (two thirds, one third under 26, over twice the Seasons left) and
  the playoff regime (`dressed`, or `none` for a league before 2025).
- **Dead money** is a list per Club in the Season and in the phase between
  Seasons, each entry a cap hit and the Seasons left, one fewer each Season.
  A release in the Roster window is a buyout. The released Player leaves as
  `released` until the market of item 5.
- **The payroll for the Season ahead** is a Club's contracts, its dead money and
  each place its 16-10-3 Roster still has open at the minimum, since the fill
  takes them at that. A re-signing or a move may leave it at or under the cap;
  a Club already over may make no change that adds to it (`overCap`, as data).
  Nothing is forced: a Club over the cap from contracts that run on still has
  its gaps filled at the minimum.
- **The assistant** re-signs the best by level first, each at his ask, while he
  fits; the rest are let go. Its Roster moves drop their swaps first, then
  call-ups from the last, until they fit. It reads the truth until scouting
  (item 8) gives every Club its own view.
- **The floor binds as every Season starts, the first too:** the lowest
  contracts are raised together, rounded up, until the payroll with dead money
  reaches it.
- **The playoff cap** counts the 20 dressed and dead money at full cap hits.
  `setLineup` refuses a Lineup above it (`playoff-cap`). The Lineup a Fixture
  is played with, and the assistant's, stand the dearest dressed Player down as
  an injured one would be, the best fit spare at his position taking his place,
  until it fits: the same for every Club (D-04).

Reported by `pnpm sim:season --seasons 10`, not asserted: in a generated league
no Club ends above the cap and none starts below the floor; the mean payroll
rises from 87% to 94-97%, and its spread across Clubs falls from 9 pp to 2.5-5
pp against the measured 7-10 pp, since every Club spends to the cap. The budgets
of item 7 are what spread it. The assistant keeps 83-94% of expiring restricted
regulars and 78-81% of unrestricted ones.
