# ADR-036 - Every Club has a farm, and Players move between them through waivers as in the NHL

- **Status:** Accepted; built in #133 (amendment below)
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

## Amendment, 2026-11-23: the farm as built, and the CBA checked (#133)

Item 5a of Phase 3. The author chose on 2026-11-13 and 2026-11-20 what this
records.

### The CBA against the sources above

The figures were checked against the text of the CBA of 2013, the memorandum of
2020 and the summary table of the memorandum of 2025 (its attachments were not
read). The table for Skaters, the claim period, the order of claims, the
re-waiver thresholds, the 23 and the 50, and the buried allowance ($1,225,000 in
2026-27) are as above. Where the sources were wrong or silent:

- **After the deadline** a Club has five regular call-ups, at most four of them
  up at once (memorandum of 2025, item 16), not four. Only an emergency call-up,
  below 2 Goalies, 6 defencemen or 12 forwards fit, is not counted (13.12(m));
  a call-up for an injury that leaves the Club above that line is. From the
  deadline nobody goes down but a Player called up since (13.12(j)), and the
  active Roster has no limit (16.4(a)).
- **Goalies' exemption:** 6, 5, 4, 4, 4, 3, 2 Seasons from age 18 to 24 and 1
  from 25, with 80 NHL games to 20 and 60 after. NHL games count the playoffs.
  A Player signed at 18 or 19 has his Seasons cut to 3, a Goalie to 4, from any
  Season in which he plays 11 NHL games, not only his first.
- **Injured Reserve:** a Player out at least 7 days does not count against the 23
  (16.11).
- **The roster emergency over the cap** (50.10(e)) allows a replacement paid at
  most the minimum plus $100,000 under the CBA of 2013; the memorandum of 2025
  revises the threshold in an attachment not read.
- **The buried allowance** applies to one-way contracts; a two-way contract counts
  only minor-league pay above it, about nothing. Entry-level contracts are two-way,
  and their cap hits sit under the allowance anyway.
- **Juniors:** a Player under 20 drafted from the junior leagues may not be sent
  to the minors (9.1(d)(iv)); an 18- or 19-year-old returned to juniors with
  fewer than 11 NHL games does not count against the 50 (Article 10); an
  entry-level contract signed at 18 or 19 slides a Season in which its Player
  plays fewer than 10 NHL games, two Seasons at 18 and one at 19 (9.1(d)).

### What was built

- **The rules are data** (D-10): `FarmRules` in the Season format (the active
  limit, 50 contracts, Injured Reserve from 7 days, the emergency line, the loan
  age of 20, waivers with both exemption tables, a claim period of a day, last
  Season's table for 25 days, re-waiver after 30 days or 10 games, the deadline
  40 days before the end with five call-ups and four up), and in `CapRules` the
  buried allowance, long-term injury relief (24 days and 10 Fixtures), the roster
  emergency and the slide.
- **A Club** holds its active Roster and a farm (`Club.farm`). The assistant keeps
  14 forwards, 7 defencemen and 2 Goalies active, the NHL's 23, and a farm of at
  least 6, 3 and 2: 20-10-4 under contract. Between Seasons a Club's contracts are
  held as one, as before, and the assistant picks the active Roster by level as
  each Season starts. The generator still makes its 16-10-3 Roster, and a Season
  completes the farm from a stream of each Club's own, so a generated league's
  draws are unchanged.
- **During a Season** each Club calls up from its farm for the injuries its spares
  cannot cover, and sends the weakest down when one back from Injured Reserve
  takes it above 23, first whoever goes down without waivers. A call-up must fit
  under the cap as it is charged by the day; in a roster emergency a cheap one
  comes off it. A Player sent down is out of a declared Lineup as an injured one
  is.
- **Waivers:** a Player neither exempt nor cleared goes on them for a day and is
  claimed by the first Club in the order of claims that wants him, can afford
  him and has a contract to spare, or clears to his farm. At camp, as the next
  Season starts, everyone the assistant puts on a farm who needs waivers goes
  through them by the table just ended; a league opens as its source gives it.
  The assistant claims a Player one level better than its weakest at his group,
  or one it is short of, while it holds at most two contracts above its shape
  (`CLAIM`, estimates: no rate of claims is measured). An NHL Season of a
  generated league puts about 100 Players on waivers, about 37 of them claimed.
  A Manager may declare his Club's claims (`setClaims`); a standing declaration
  that he runs his farm himself comes with the web (item 11).
- **Service** for waivers (age at the first contract, Seasons, NHL games) is kept
  on the Player and folded from the records each Season (D-03), estimated from age
  as a league opens.
- **The cap** is charged each day of the regular Season at the counted payroll:
  the active Roster but those on long-term injury relief or called up in an
  emergency, the farm above the buried allowance, those on waivers, dead money.
- **Prospects** (the author's choice of 2026-11-20): a prospect signs his
  entry-level contract once the level expected of him reaches that of an
  undrafted fill at his group (`SIGNING`, a bar that does not rise with the
  league), while his Club holds fewer than 40 contracts, an estimate. Under 20
  and off the active Roster he plays on loan, in the junior leagues or in Europe,
  counting against neither the 50 nor the cap, and joins the farm the Season he
  turns 20; under 20 he is called up only when ready for the active Roster.
  Signed, his rights do not run out. A Manager's moves between Seasons are held
  to the 50 contracts, a loan not counted, instead of each group's shape.
- **A farm's regulars**, the best 12 forwards, 6 defencemen and a Goalie of it,
  develop with a bonus of their own (`FARM_DEVELOPMENT`), at the NHL's.
- **Roster file version 3** carries a Club's farm and a Player's service.
- `SWAP.gap` is back to 0. `ASSIST_PULL` is refitted from 4 to 3: with the
  call-ups among the forwards who play, as in the measured league, the forward
  tier-1 to tier-4 points-per-minute ratio rose from 3.16 to 3.24.

### What the long run shows

On eight generated leagues and the roster file, ten Seasons each, the age of the
league, every leaving band, round 1 of the draft and the table hold. A few
targets sit a hair outside, and the author chose on 2026-11-23 to report them
until the Phase 3 gate rather than fit further: a draft has its luck, and a late
pick or an undrafted Player can break out. Reported: the share of Players aged
23 or younger (0.356 on the generated leagues, 0.363 on the roster file, against
0.30 ±0.05) and the share of round 2 who play 200 Fixtures (0.226 and 0.219,
against 0.385 ±0.12); on the roster file alone round 3 (0.086 against 0.199
±0.10) and the bottom eight staying bottom eight (0.361 against 0.51 ±0.12); in
the tenth Season the penalties per Club (3.04 against 3.03), the Skaters with
40 goals or more (7.1 against 15 ±6) and the back-to-back's cost in win rate,
which waits on the engine's fatigue (#109). The signing bar moves the young share
and the draft against each other: half a spread lower brings the draft into its
bands and the young share to 0.38-0.41; half a spread higher drops round 2 to
0.11. Neither ranking the active Roster by the level expected next Season nor a
larger bonus on the farm moved either.

The farm's games, a test tier that plays them, and Players on minor-league
contracts are item 5b.

## Amendment, 2026-11-25: the farm's games (#135)

Item 5b of Phase 3. The author chose on 2026-11-25 what follows.

- **The affiliates' league is data** beside the farm rules (D-10): it mirrors
  its Competition's alignment, each affiliate in its Club's Division, and plays
  its own key, 72 Fixtures, 8 against each divisional opponent and 2 against
  each other Club of the Conference, none across, every second day, ending as
  the NHL's regular Season ends. The schedule generator reads the key, so the
  NHL's 84 and the farm's 72 are two values of it. The affiliates have no
  playoffs yet, a value that can be added later; overtime is the NHL's.
- **Farm Fixtures** are played by the same engine (D-01), each on a stream of
  its own (D-08), on the days they fall, after the day's moves; their
  statistics and table are folded from their events (D-03). Injuries and
  fatigue are one record for the NHL and the farm: a Player hurt on the farm is
  not called up, and one called up brings his fatigue with him. Every
  affiliate's Lineup is the assistant's, the same builder for every Club (D-04);
  a Manager declares his own with the farm's screens (item 11).
- **Players on minor-league contracts** fill an affiliate to 14 forwards,
  8 defencemen and 3 Goalies, its Club's farm counted, as an undrafted fill is
  generated, from a stream of the Club's own. They hold no NHL contract and count
  against neither the cap nor the 50; they age, develop and retire as other
  Players do; those beyond the shape as a Season starts are let go, the weakest
  first. An affiliate short of a Lineup during a Season signs another. NHL Clubs
  do not sign them in this item.
- **Whether farm games are played is a choice of the run,** kept in the Season's
  state and carried from Season to Season, off unless asked for. A run without
  them is the same, result for result, as before this item: the call-up for form
  that the Decision gives such a run ("level and form") is not built, and a farm
  Player develops by his rank as in #133.
- **With farm games:** a farm regular is one who dressed for at least half of
  his affiliate's Fixtures, with the same bonus (`FARM_DEVELOPMENT`). Prospects on
  loan develop as before. A Player's **form** is a fold over his last Fixtures,
  NHL or farm, not an attribute: his points per 60 minutes, or a Goalie's save
  percentage, read as levels against what Players of his level in the same
  league produce this Season. The assistant swaps a farm Player for the
  weakest of his group on the active Roster when level and form together put
  him clearly ahead, both ways and the same for every Club (D-04), only with a
  Player who goes down without waivers, and not after the deadline. A Player
  sent down plays a farm Fixture before he is recalled, but in an emergency
  (the memorandum of 2025, item 30, as the author summarised it; its text was
  not read).
- **`Player.form`,** which no engine code read (D-06), is removed.
- **A test tier, `farm`,** runs the realism suites on Seasons with farm games,
  against the same bands, on request and weekly in CI, not on every push. A
  block of ten Seasons with farm games is a later issue.
- The roster file stays at version 3: Players on minor-league contracts are
  generated as a Season with farm games starts.
