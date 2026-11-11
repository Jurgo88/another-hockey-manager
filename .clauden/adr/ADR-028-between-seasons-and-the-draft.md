# ADR-028 - Between Seasons Managers decide: the draft, call-ups and releases

- **Status:** Accepted
- **Date:** 2026-11-10
- **Refines:** ADR-024 (the draft), and carries out the release of ADR-023 that
  ADR-027 moved to #89
- **Amends:** ADR-022 (the `potential` of young Players moves), ADR-014 (the
  state between Seasons), ADR-025 (a Season's record holds its draft)
- **Relates to:** D-04, D-08, D-10, D-11, ADR-020, ADR-021, ADR-026, issue #89

## Context

ADR-024 decided what the draft is: a Club holds the rights to a prospect, who
develops off the Roster for up to 4 Seasons and joins when his level reaches
the weakest at his position on the Roster. ADR-023 decided that the weakest at a
position is then released, and that the assistant proposes and a Manager may
overrule. ADR-027 left both to #89, because they need a phase between Seasons in
which Managers decide.

Three questions were left open, and the author settled them on 2026-11-09:

1. How the decisions are made, so that one path serves every Manager (D-04).
2. Where the uncertainty of the draft comes from. `potential` is fixed at
   generation, and development grows a Player towards it. A prospect seen at
   the top of his range would then be a near-certain pick, and round 1 would
   yield regulars at close to 100% against the measured 74.9%.
3. How a draft class is generated and calibrated.

Without the draft, a ten-Season run ages the league to a mean of 29.6 against
the target of 27.0 (ADR-027): the only arrivals are the undrafted fill, at
about 25.

## Decision

### The phase between Seasons is a state of its own, with two windows

The move from one Season to the next becomes a few pure steps on a plain JSON
value, the `Offseason`, as a Season's days are (ADR-014):

1. **`endSeason`**: once a Season has its champion. Development (ADR-022) for
   every Player, prospects included, then leaving (ADR-027), then the draft
   order by the lottery, and the new class generated. Every Player who stays is
   a year older. Rights older than 4 Seasons expire.
2. **The draft window.** Each Club may declare a list of prospects in the order
   it wants them (`setDraftList`). `runDraft` then makes every pick in order:
   the first prospect on the Club's list still available, or, with no list or
   none left on it, the assistant's choice.
3. **The Roster window.** The assistant proposes each Club's call-ups and
   releases (`proposedMoves`). A Club may declare its own (`setRosterMoves`),
   which replace the proposal for that Club.
4. **`startNextSeason`**: the moves, the assistant's where a Club declared
   none, then the fill, and the new schedule.

The simulation does not know who is human. Where a Club declared nothing, the
assistant decides, as it does for a Lineup. When to close a window, whom to
wait for and for how long, is the caller's policy (Phase 4), not the engine's.
`nextSeason` remains as all four steps with nothing declared, which is what an
AI Manager's Club gets anyway.

A pick made one at a time, with a draft room in the web (item 10), is a list of
one, so it can be built on this without a second path.

### The draft format is data (D-10)

A `DraftFormat` sits beside the playoff format:

- **Rounds**, 4.
- **The class size** as a multiple of the picks, 1.5, so the last pick still has
  a choice.
- **The order**: the Clubs that missed the playoffs, worst first, through the
  lottery; then the playoff Clubs by points, except that those who reached the
  last rounds go last, by how far they went. In the NHL that is the last two
  rounds: the conference finalists, the finalist and the champion.
- **The lottery**, the NHL's since 2022: 16 Clubs with odds of 18.5, 13.5, 11.5,
  9.5, 8.5, 7.5, 6.5, 6, 5, 3.5, 3, 2.5, 2, 1.5, 0.5 and 0.5 per cent, two draws,
  and no Club moving up more than 10 places. A winner who would move further
  moves up 10 places, and the pick drawn goes to the worst Club not yet placed.
  The rule that a Club may not win twice in five years is left out.

Every round follows the order of the first. The lottery draws from its own
stream per Season (D-08).

### A class is generated on a fixed ladder

A class is generated with the generator's one-Player functions (ADR-024): about
58% forwards, 32% defencemen and 10% Goalies, 80% aged 18 and the rest 19.

Its ability is laid out on a fixed ladder, so that every class has the same
shape, as the league's Club strengths do, and the seed decides only who is
where and the noise about it. A class of nothing but busts is not possible.
The ladder is set in the units in which development moves a Player: each
prospect's level sits some multiple of his position group's attribute spread
above or below the level of an undrafted fill at that group. One ladder thus
serves Skaters and Goalies alike, whose levels grow at different rates.

There are two ladders, by place in the class: the level, and the room to grow
above it. Each is a few points joined by straight lines. A power curve could not
fit the measured classes, which fall steeply after round 1 and then run flat:
rounds 2 to 4 take three Seasons to debut alike, and differ mostly in how many
become regulars, which is the room.

### Prospects are seen as ranges, and the assistant picks the top of the range

Prospects are generated values at confidence 0.25 (D-11), so a Manager sees
wide bands. The assistant picks the prospect whose `potential` is highest, then
the one whose level is highest. Need at a position is not part of the choice.

### The `potential` of a young Player moves

The uncertainty of the draft is real, not hidden: until a Player is 22, his
`potential` moves each Season by the same draw that makes his attributes boom
or stall that Season (ADR-022), and for a Player that young the draw is
larger. A booming prospect grows faster and raises his ceiling, a stalling one
grows slower and lowers it, and from 23 it is settled. It never falls below his
level.

The ceiling alone does not do it. A late pick starts so far below a regular that
the curves cannot carry him there in time, however high his ceiling: he becomes
one only if he grows faster than the curves. Noise that a Manager can see at the
draft, in the level or the room, does not do it either. It changes who is picked
where, not what each round yields. Only what happens after the draft spreads the
outcome of a round.

It applies to every young Player, on a Roster or off it, generated or imported,
because there is one development. A wide band on a prospect is then honest: his
future is not decided yet. Scouting in Phase 3 narrows how well it is seen, not
how open it is.

A prospect develops off the Roster as everyone does, without the ice-time
bonus (ADR-024).

### Call-ups and releases

A prospect is **ready** when his level reaches the weakest Player at his natural
position on his Club's Roster, as ADR-024 put it, or of his position group when
nobody plays it. Taken by group, centres replaced wings until a Club could not
dress four Lines. The assistant:

1. fills each gap left by a departure, at the natural position of whoever left
   it, with the best ready prospect at that position;
2. then, position by position, while the best prospect left is ready, calls him
   up and releases the weakest at his position.

A Club so keeps its shape and its balance of centres, wings and sides, as the
undrafted fill does (ADR-027).

A Manager's own moves may call up a prospect who is not ready, keep a ready one
down, or release someone else. They are valid when every call-up holds the
Club's rights, every release is on its Roster, no group ends above its shape
(16-10-3), and the Club, once its gaps are filled, can dress a Lineup.

A released Player leaves the league (ADR-023) until free agency in Phase 3.

### Rights that expire, and the fill

A prospect whose Club has not called him up within 4 Seasons of his draft
becomes undrafted (ADR-024). The fill then takes, Club by Club in draft order,
the best such Player at the natural position of each gap whose level is at
least that of a generated fill, and generates the rest as ADR-027 does. An expired prospect whom
no Club takes leaves the league.

### Departures and the record

A departure records one of four reasons: `retired`, `unsigned`, `released` or
`rights-expired`. The draft held before a Season is kept in its state beside its
departures, and goes into that Season's record (ADR-025), so a class can be
followed through a run.

The draft before Season `y` has year `y`. Seasons to debut are the first Season
a prospect plays in, less that year, as measured (`07-league-over-time.md`): a
prospect who plays the Season after his draft took 0.

### Calibration

The two ladders, the larger draw of the young and how far `potential` moves are
fitted to the draft table of the Phase 2 gate. A fast harness of classes
developed without Fixtures was planned. It was not needed: a ten-Season run takes
about a minute, so three generated leagues in parallel were the fit itself, and
they measure the real table rather than proxies of it.
`test/longrun/draft.test.ts` holds it.

Fitted on 2026-11-10, of the first four classes read in Season 10:

| Round | 200 or more Fixtures | Target | Played one or more | Measured | Median Seasons to debut | Target |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 70.8% | 74.9% ±12 | 96.6% | 98.2% | 0 | 1 ±1 |
| 2 | 34.6% | 38.5% ±12 | 81.0% | 72.7% | 2 | 3 ±1 |
| 3 | 19.3% | 19.9% ±10 | 60.2% | 55.0% | 3 | 3 ±1 |
| 4 | 14.1% | 16.5% ±10 | 50.5% | 43.8% | 3-4 | 3 ±1 |

On the 2025-26 roster file, one run: 69.5%, 35.9%, 24.2% and 15.6%, with
medians of 0, 3, 3 and 4.

The draft brings the mean age of the tenth Season, by Fixtures, from 29.6 to
27.0-27.3 on the generated leagues and 27.2 on the roster file, against 27.0
±0.7. The shape is not yet right: 27-31% of Players are 31 or older against 18%
±5, and 33-35% are 23 or younger against 30% ±5. The league is young and old,
and short of Players in their mid-twenties. Releases take the weakest, who are
often young call-ups, and veterans stay. The long-run calibration (Phase 2,
item 8) sets the age profile with the leaving rates, and may move these values
again.

## Options considered

**One step with everything declared in advance.** A Manager would decide
call-ups and releases before knowing whom he drafted and who matured.

**Picks one at a time, the draft waiting on a Manager.** The liveliest, but it
needs a flag for whom to wait for, and a draft stalls on an absent Manager. It
can be built on the lists later.

**A hidden true `potential` beside a scouted one.** Realistic, but it is
scouting, which belongs to Phase 3, and it gives a Player two ceilings.

**Only a moving ceiling, the draw kept as it was.** Tried first: round 4 stayed
at 4-9% regulars against 16.5%, because a late pick cannot grow fast enough to
reach a regular's level, however high his ceiling.

**Only more development noise, the ceiling fixed.** A booming prospect would run
into a ceiling set at 18, so noise would slow growth more than decide a career.

**A class drawn from a distribution.** Classes would vary from strong to weak,
which is real, but four measured classes cannot calibrate that variance. A draw
of a class's strength can be added to the ladder later.

**Expired prospects simply leave.** Simpler, and they are seldom better than a
generated fill, but ADR-024 made them free to fill any Club's gap.

## Consequences

- The Season state carries prospects and the draft before it. Lineups and the
  engine do not see prospects.
- Development changes for Players under 23, so the gate measures it again.
- About 105 Players leave a Season. At the measured rates of reaching the NHL,
  four rounds bring about 86 a Season, and the undrafted fill the rest, about
  18%, against the measured 15%. Arrivals move from about 25 years old to 19-21.
- Releases add turnover the leaving rates of ADR-027 do not include, so item 8
  refits them together.
- The web shows both windows and their notices in item 10.

## Amendment, 2026-11-11: the assistant releases by the Season ahead (#90)

The assistant no longer releases the weakest at a position as he stands. It
releases the Player it expects to be weakest next Season: his level moved by
what development (ADR-022, ADR-026) brings at his age, without its noise. A
prospect is ready, likewise, when his expected level reaches that of the
weakest. A declining veteran so makes room before a young Player still growing,
as a Club looking a Season ahead would choose. Over ten Seasons, releasing by
the present kept veterans and let young Players go: 31-33 became the strongest
ages and 27-29% of the league was 31 or older, against 18%.

A Manager still releases whom he chooses (D-04).

## Amendment, 2026-11-11: a league opens with prospects, and the class is refitted (#90)

The author decided on 2026-11-11 that a league opens with the prospects of its
last four drafts, generated or read from a roster file alike. Without them the
first four Seasons had no prospects to call up, gaps were filled by undrafted
Players, and the league aged until the draft caught up. Each opening class is
generated and drafted as a Season's class is, in an order shuffled from its own
stream (D-08), then developed off the Roster for each Season since its draft.
Rights still last four Seasons, so the oldest opening class expires after the
first.

A class now competes with the four held before it. Refitted over ten Seasons on
eight generated leagues and the roster file:

- **The ladders.** A pick arrives half a spread better, with half a spread less
  room, so the same ceiling: level 1.8, 0.2, -0.4 and -0.9 at places 0, 1/6,
  2/3 and 1, room 1.5, 0.95, 0.5 and 0.3.
- **Goalies sit 0.2 spreads lower** on both ladders. The generated league's
  Goalies sit closer to a fill than its Skaters do, and at the Skaters' ladder
  drafted Goalies pushed them out.
- **A swap needs a margin.** The assistant releases a Player for a prospect only
  when it expects the prospect to be at least one level better next Season.
  Without it, Clubs swapped for differences development noise erases. A gap is
  still filled by any ready prospect.
- **Club strength in the generator** weighs 0.04, from 0.02. A run converges,
  and at 0.02 the correlation of the table from one Season to the next fell
  below its band. The first Season stays inside the Tier 2 bands.

The age, leaving, draft and table targets of the Phase 2 gate hold. What does
not, and why, is in `04-validation-targets.md`.
