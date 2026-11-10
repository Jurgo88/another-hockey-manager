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

### Prospects are seen as ranges, and the assistant picks the top of the range

Prospects are generated values at confidence 0.25 (D-11), so a Manager sees
wide bands. The assistant picks the prospect whose `potential` is highest, then
the one whose level is highest. Need at a position is not part of the choice.

### The `potential` of a young Player moves

The uncertainty of the draft is real, not hidden: until a Player is 22, his
`potential` moves each Season by the same draw that makes his attributes boom
or stall that Season (ADR-022), scaled up. A booming prospect raises his
ceiling, a stalling one lowers it, and from 23 it is settled. It never falls
below his level.

It applies to every young Player, on a Roster or off it, generated or imported,
because there is one development. A wide band on a prospect is then honest: his
future is not decided yet. Scouting in Phase 3 narrows how well it is seen, not
how open it is.

A prospect develops off the Roster as everyone does, without the ice-time
bonus (ADR-024).

### Call-ups and releases

A prospect is **ready** when his level reaches the weakest Player of his
position group (forwards, defencemen, Goalies) on his Club's Roster. The
assistant, for each group:

1. fills the gaps left by departures with ready prospects, best first;
2. then, while the best prospect left is ready, calls him up and releases the
   weakest of the group, so the Club keeps its shape.

A Manager's own moves may call up a prospect who is not ready, keep a ready one
down, or release someone else. They are valid when every call-up holds the
Club's rights, every release is on its Roster, and no group ends above its shape
(16-10-3). A group below its shape is filled.

A released Player leaves the league (ADR-023) until free agency in Phase 3.

### Rights that expire, and the fill

A prospect whose Club has not called him up within 4 Seasons of his draft
becomes undrafted (ADR-024). The fill then takes, Club by Club in draft order,
the best such Player at the group of each gap whose level is at least that of a
generated fill, and generates the rest as ADR-027 does. An expired prospect whom
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

The ladder, the room above it and how far `potential` moves are fitted to the
draft table of the Phase 2 gate, in two steps:

1. A fast harness develops classes alone, without playing a Fixture, against
   proxies: reaching the level of a Club's weakest for a debut, and of the
   fourth Line for a regular.
2. Full ten-Season runs on three generated leagues measure the real table, the
   share with 200 or more Fixtures and the Seasons to debut by round, and the
   age of the league in the tenth Season.

The age profile is set by the long-run calibration (Phase 2, item 8), which may
move these values again.

## Options considered

**One step with everything declared in advance.** A Manager would decide
call-ups and releases before knowing whom he drafted and who matured.

**Picks one at a time, the draft waiting on a Manager.** The liveliest, but it
needs a flag for whom to wait for, and a draft stalls on an absent Manager. It
can be built on the lists later.

**A hidden true `potential` beside a scouted one.** Realistic, but it is
scouting, which belongs to Phase 3, and it gives a Player two ceilings.

**Only more development noise for prospects.** Under a fixed ceiling, noise
slows growth more than it decides a career, and it would not meet round 1 and
round 4 together.

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
