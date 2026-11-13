# ADR-036 - Every Club has a farm, and Players move between them through waivers as in the NHL

- **Status:** Accepted
- **Date:** 2026-11-13
- **Amends:** ADR-012 and ADR-020 (the Roster's shape), ADR-031 (what the cap counts; the daily charge and long-term injury relief move here from trades), ADR-022 (development off the NHL Roster)
- **Relates to:** FR-20, D-01, D-03, D-04, D-06, D-08, D-10, ADR-014, ADR-024, ADR-028, ADR-030, ADR-032, ADR-033, ADR-034, issue #130

## Context

Calibrating free agency (#130) against the Phase 2 gate found a conflict it
could not resolve. A declining veteran under contract has nowhere to go but the
Roster, so he blocks a place until his contract runs out, and the league ages. A
prospect has nowhere to grow but the Roster, so he either comes up too early or
not at all, and the draft's targets miss. Pulling one way moved the other: the
age of the league against the Seasons to a debut.

The NHL resolves both with its farm. Every Club has a minor-league affiliate in
the AHL. A Player is sent down to make room and called up when needed, and a
Player without an exemption must first pass through waivers, where any other
Club may claim him.

The author chose on 2026-11-13 to have a farm that works as the NHL's does:
waivers on the way down, call-ups during the Season for injuries and poor form,
and farm games played, though not in every test run.

How the NHL's farm works, from secondary sources summarising Section 13 of the
CBA and the 2025 memorandum. The exact figures are checked against the CBA text
in the item that builds it:

- **Rosters.** An active Roster of at most 23 Players, and at most 50 contracts
  for a Club.
- **Waivers.** A Player sent to the minors needs waivers unless he is exempt.
  Whether he is exempt depends on his age when he signed his first NHL contract,
  the seasons since, and his NHL games, whichever limit comes first. Whether
  his contract is one-way or two-way does not matter: that decides only what
  he is paid in the minors. For Skaters:

  | Age at first contract | Seasons | NHL games |
  | --- | --- | --- |
  | 18 | 5 | 160 |
  | 19 | 4 | 160 |
  | 20 | 3 | 160 |
  | 21 | 3 | 80 |
  | 22 | 3 | 70 |
  | 23 | 3 | 60 |
  | 24 | 2 | 60 |
  | 25 and older | 1 | - |

  An 18- or 19-year-old who plays 11 or more NHL games in his first season has
  his exemption shortened. Goalies have a table of their own.
- **The claim.** Waivers last 24 hours. Any Club may claim the Player; the one
  lowest in the standings wins, by the previous season's table until
  1 November. The claiming Club takes on his contract, and he goes to its active
  Roster. While on waivers he counts against his own Club's cap.
- **Once cleared,** a Player needs waivers again only after 30 days on an NHL
  Roster or 10 NHL games since.
- **The cap.** A contract in the minors counts only by how much it exceeds the
  league minimum plus $375,000: $1,225,000 in 2026-27.
- **Call-ups** are free through the season. After the trade deadline a Club has
  four, besides those for injury and emergency. A Club that cannot dress a
  Lineup because the cap stops a call-up may make an emergency call-up that does
  not count against the cap.
- Waivers run from 12 days before the regular season to the day after a Club's
  season ends.

## Decision

**A Club holds an active Roster and a farm, as data (D-10).** The active Roster
is the NHL's: at most 23, dressing 18 Skaters and 2 Goalies (FR-20). The farm
holds the rest of the Club's contracts, up to the league's limit of 50. The
16-10-3 shape of ADR-020, whose last three places stood in for call-ups, gives
way to real call-ups. A Competition declares its farm rules beside its cap rules:
the Roster and contract limits, the waiver exemption tables for Skaters and
Goalies, the claim period, the window of last season's standings, the
re-waiver thresholds, the buried allowance, and the call-ups allowed after the
deadline. A league without a farm is a value, not a branch.

**Sending a Player down** takes him off the active Roster. If he is exempt, he
goes to the farm at once. If not, he goes on waivers for the claim period: one
day of the Season, or to the close of the window between Seasons. Each Club may
claim him, its own decision or the assistant's. The Club that claims him lowest
in the table, by last season's until the window the rules set, takes him and
his contract onto its active Roster; otherwise he goes to his farm. While on
waivers he counts on his own Club's cap, and once he clears he goes down without
waivers again until he has spent the rules' days or games back up. The career
counts that exemption reads (age at first contract, Seasons since, NHL games)
are folded from the event stream and the records (D-03).

**Calling a Player up** moves him from the farm to the active Roster, any day of
the Season and between Seasons, while the Roster has room and the cap allows. A
Club does it for an injury, for poor form, or for a Player whose form on the farm
earns it, for every Club the same way (D-04). After the deadline it has the
rules' number of call-ups, besides those for injury and emergency.

**The cap counts the active Roster, the farm above the buried allowance, and
dead money (ADR-031).** Since the Roster now changes during the Season, the
daily charge and long-term injury relief come with the farm instead of with
trades.

**The farm plays (ADR-014).** Each Club's affiliate plays a schedule of its own,
as data, with the same engine (D-01), every Fixture on its own stream (D-08),
its statistics folded from its events (D-03). An affiliate fills what its NHL
Club's contracts leave with Players on minor-league contracts, who hold no NHL
contract and count against neither the cap nor the limit of 50.

**Whether farm games are played is a choice of the run, not a rule of the
league.** A run that does not play them develops a farm Player by his role on
the farm, his rank by level among its Players, standing in for ice time
(ADR-022); a call-up for form reads level and form instead of farm statistics.
The realism and long-run tiers run without farm games, as the author asked, so
the tests stay as fast as now. A tier of its own plays a block with farm games,
one Season first, and checks it against the same bands; it runs on request and
on a schedule in CI, not on every push.

**Every decision is the same call for every Manager (D-04):** send down, call
up, claim, for a human Manager declared, for an AI one the assistant's.

**Left out, until a reader needs them:** two-way contracts and minor-league
salaries come with Club budgets (ADR-034), which is the first place money beyond
the cap is read (D-06). Conditioning loans, the junior-age rule for Players drafted
from the CHL, and contract slides are left out.

**The roadmap** gains two items after free agency: the farm and waivers, with
call-ups and the daily cap; and the farm's games. Until the farm item, #130
reports, not asserts, the Phase 2 targets that a prospect taking a gap before
he is ready moves: the share of Players aged 23 or younger, the leaving rate of those aged 23
or younger, and the median Seasons to a debut of rounds 2 to 4, on the
generated leagues and the roster file; on the roster file alone, the leaving
rates of the top and middle thirds of ice time and the share of round 4 who
play 200 Fixtures, each a hair outside; and in the tenth Season the penalties
per Club (3.04 against 3.03) and the Skaters with 40 goals or more (8.4 against
9). The farm item asserts them again and takes
`SWAP.gap` back to 0.

## Options considered

**No farm,** with the free-agency rules tuned around it. Twenty trials in #130
moved the age of the league and the draft's debut against each other; tolerating
weaker prospects in gaps fixed the draft and made the league too young.

**A farm that never plays.** Simpler and fast, with development standing in for
ice time. Faithful enough for the economy, but a call-up for form would never
read how a Player plays, and the author wants the games.

**Keep the 29-man Roster and add a farm beside it.** No recalibration of injury
depth (ADR-012), but two layers of call-ups, the Roster's last three and the
farm, and a Roster no NHL Club has.

**Waivers by contract type,** one-way contracts through waivers, two-way not. A
common belief, not the rule: exemption reads age, seasons and games only.

## Consequences

- `Club` gains a farm; ROSTER_SHAPE becomes the active Roster's limits and a
  dressable minimum; injury depth and Tier 1 are checked again against ADR-012.
- The Season state carries waivers in progress, each Club's call-ups after the
  deadline, the daily cap charge and long-term injury status.
- Career counts for waiver exemption join the records Players keep.
- The farm's schedule and affiliates are data beside the Competition's.
- A test tier plays farm games over a block of Seasons; the existing tiers stay
  at their present speed.
- Waiver claims and call-ups become notices.
