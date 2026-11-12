# ADR-027 - Players leave by age, or unsigned for want of a role

- **Status:** Accepted; its unsigned draw replaced by contracts and free agency in ADR-032, its retirement unchanged
- **Date:** 2026-11-09
- **Supersedes:** the retirement rule of ADR-023, and moves its release to #89
- **Relates to:** D-04, D-08, ADR-012, ADR-020, ADR-023, ADR-024, issue #88, issue #89

## Context

ADR-023 retires a Player with a chance that rises with age and falls with his
level among his position group across the league, fitted to two measured
tables together: the rate of leaving by age, and by ice-time third in the
group (1.3%, 5.3% and 20.1%).

Fitted on played Seasons of three generated leagues (#88), the age table is met
and the ice-time table is not: level gives 3.6%, 8% and 12%. A Player's level
says little about his ice time, because ice time depends on his Club. A
third-liner at a strong Club is better than a second-liner at a weak one. Rank
by ice time per Fixture meets both tables, on the three leagues and on the
2025-26 roster file.

The author pointed out on 2026-11-09 why: a real Player with a small role
seldom retires. His contract runs out, nobody signs him, and he goes to the
minors or to Europe. Contracts and free agency come in Phase 3.

## Decision

**Two ways out, drawn in turn** from one stream per Player and Season (D-08).

- **Retired**: the Player's decision, by age alone. The log-odds rise linearly,
  so the chance is about 1% at 30, 9% at 35 and even at 40. A Manager cannot
  overrule it, as in ADR-023.
- **Unsigned**: nobody gives him a new contract. The chance falls steeply with
  his **role**, his rank by ice time per Fixture at his position across the
  league, and rises slightly with age. Goalies are ranked by Fixtures, as
  measured. It is about 37% for the smallest role and below 1% for a regular
  in the top half.
  - A Player who did not play has the smallest role.
  - A Player who was injured when the Season ended takes his rank by level
    instead, so that an injury does not end a career by itself.

**Unsigned stands in for contracts.** In Phase 3 it is replaced by a
contract that runs out, a Manager's decision not to re-sign, and free agency.
Retirement stays as it is.

**Release moves to the draft (#89).** Until prospects arrive, no Club ever
holds more than its shape, so release would have nothing to do. It needs a
phase between Seasons in which Managers decide, and the draft picks need the
same phase.

**Departures are recorded** in the Season state, each with its reason, for a
Manager's notices.

Everything else in ADR-023 stands. A Club keeps its shape: each gap is filled
by an undrafted Player at the ability of the generated league's last call-up,
at the natural position of whoever left it. The order between Seasons is
development, leaving, then the fill, with the draft and release joining in #89.

The parameters are fitted in `src/leave/`. They are refitted with the long-run
calibration in item 8.

## Options considered

**Level among the position group, as in ADR-023.** Meets the age table and not
the ice-time table, unless the band is widened. The validation targets forbid
widening a band.

**Level within his Club.** It is closer to a role, but it is still a proxy for
ice time, which is what was measured.

**One chance on age and role, all called retirement.** It fits as well, but it
would name a 25-year-old fourth-liner retired, and Phase 3 could not take its
part out.

## Consequences

- A Player's ice time now decides his future, so who a Manager plays matters
  between Seasons too.
- On a ten-Season run without the draft, about 105 Players leave a Season and
  the league ages: a mean age of 29.6 in the tenth Season against the target of
  27.0. Arrivals are only the undrafted fill, at about 25. The draft (#89) brings
  18- and 19-year-olds, and the long-run calibration (item 8) sets the age
  profile. That calibration may also need more turnover among Players of fewer
  than 20 Fixtures, whom no target constrains.
