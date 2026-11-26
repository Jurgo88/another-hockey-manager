# ADR-033 - Trades at any time up to the deadline, with draft picks and retained salary

- **Status:** Accepted
- **Date:** 2026-11-12
- **Relates to:** D-04, D-08, D-10, ADR-014, ADR-016, ADR-024, ADR-028, ADR-030, ADR-031, ADR-032, ADR-035, issue #121

## Context

Players move between Clubs by trade as well as by free agency. The author chose
on 2026-11-12: trades during the Season and between Seasons, with the most of
them towards the deadline, and draft picks tradable.

In the NHL the deadline falls on the first Friday of March, about three
quarters into the regular season. Clubs out of the playoff race trade Players
whose contracts end that season to Clubs who want to strengthen for the
playoffs, usually for picks and prospects. Two rules make it work: a cap that
is charged by the day, so a Player acquired late costs what is left of the
season (ADR-031), and retention, a Club keeping up to 50% of a traded Player's
cap hit. Since 2026 the playoff cap counts the dressed Lineup at full cap hits,
so a deadline acquisition has to fit there too.

Trading with an AI is where manager games are most often broken: a human finds
the trades an AI accepts that it should not, and repeats them.

## Decision

**When.** Any day of the regular Season up to the deadline, and in any window
between Seasons (ADR-032). No trades from the deadline until the Season ends.
The deadline is data (D-10): a day of the regular Season, declared as a share of
its days, 0.75 for the NHL.

**What.** Any mix of:

- Players under contract, with up to the Competition's retention share of each
  one's cap hit kept by the Club trading him, on at most its limit of retained
  contracts at once (50% and 3 for the NHL). A contract retained once cannot be
  retained again.
- Prospects, whose rights move with them (ADR-024).
- Draft picks of the next three drafts. A pick keeps its place in the order of
  the Club that held it first (ADR-028); only who uses it changes. The Season
  state holds who owns each pick.

**Valid** when both Clubs stay under the cap as ADR-031 charges it and within
their wage budgets (ADR-034), and each Club's Roster, after the trade, fits its
shape. A Club left with a gap fills it from the free agents, or with a
generated fill at the minimum during a Season. A Club left above its shape names
whom it releases (ADR-031), or the assistant does.

**How, for every Club (D-04).** A trade is a proposal from one Club and an answer
from the other. Either Manager may declare its side: a proposal, or an answer to
one. Where a Club declares nothing, the assistant proposes and answers for it,
through the same functions. During a Season a trade is a move between two days,
as a Lineup change is (ADR-014); between Seasons it is part of a window.

**What the assistant wants.** It values a Player by what its own scouting sees
(ADR-035): his expected level over the contract, from development without its
noise (as ADR-028's amendment expects it), against his cap hit. A pick is valued
by what that place in the draft yields, from the class ladder. The weight of now
against later follows the Club's place in the race:

- a Club likely to make the playoffs weighs the rest of this Season;
- a Club likely to miss them weighs the Seasons after, so it sells Players whose
  contracts end and buys picks, prospects and young Players.

The chance of making the playoffs is read from the table: the points behind or
ahead of the last playoff place against the Fixtures left. No date is in the
rule. Trades bunch before the deadline because that is when both sides gain:
the race is clear, and a Player costs only the days left.

The assistant accepts a trade when its value gains by at least a margin, and
proposes trades that would gain both Clubs by their own views. It looks for
trades once a week of the Season and in each window between Seasons.

**Against exploitation.** Three things make a repeatable trade against the
assistant hard to find:

- it values by its own scouting, which a Manager does not see;
- it asks a margin;
- it values a Player against his price, so a Player traded and traded back is
  worth the same to it both times.

How often a human can find a trade the assistant should not make is a risk
(R-09), watched in the application rather than asserted.

**Draws.** Where the assistant must choose between equal trades, it draws from
the Club's stream for that day (D-08).

## Options considered

**Trades only between Seasons.** Simpler, but no deadline, which is half of what
makes the race late in a Season matter to a Club out of it.

**A trade window that opens on fixed days.** It would make bunching a rule. Daily
proration and the race make it a consequence instead.

**No picks in trades.** The deadline would have no currency: a Club selling a
Player whose contract ends wants the future, which is what a pick is.

**The assistant valuing by the truth.** Every AI Club would know who is good, a
Manager's scouting would be worth nothing against them, and D-04 would hold only
in form.

## Consequences

- The Season state gains contracts, dead money, the charge so far and who owns
  each pick; it stays plain JSON (ADR-014).
- When a Player in a Club's declared Lineup is traded, the Lineup answers as it
  does for an injury (FR-27), until the Manager changes it.
- The draft order (ADR-028) is unchanged; a traded pick is used by its owner.
- The number of trades a Season, and how many fall in the weeks before the
  deadline, are measured in #122 from the NHL's Club stints and reported in the
  long run.

## Amendment, 2026-11-26: trades before scouting (#138)

Item 6 of Phase 3. The author chose on 2026-11-26 what follows.

- **A Club's view is a seam.** Every valuation the assistant makes reads the
  Club's view of a Player. Until scouting (item 8, ADR-035) the view is the
  truth, the same for every Club; scouting replaces it with each Club's
  estimates without changing the trade rules. No human trades before the web's
  item 11, so the truth cannot be exploited meanwhile (R-09).
- **Budgets come with item 7.** Until then a trade is held to the cap and the 50
  contracts; the budget joins the rules of validity there.
- **One deadline.** The trade deadline is the farm's (ADR-036, CBA 13.12(j)):
  40 days before the last day of the NHL's regular Season, about 0.76 of its
  days. The share of 0.75 above gives way to it.
- **What a Player is worth to a Club** is, for each Season left on his contract,
  the fair price of the role he is expected to play, from his expected level
  (ADR-028 amendment) through the price curve of ADR-030, less his cap hit, less
  what the trading Club retains. A pick is worth the fair price of the level
  expected at that place of the class ladder, a prospect of the level expected of
  him, both in the Seasons after the next. A Club weighs the rest of this Season
  against later Seasons by its chance of the playoffs, a logistic of its points
  above or below the last playoff place against the Fixtures left. The slopes and
  weights are estimates, fitted on the share of moves before the deadline.
- **What the assistant looks for:** a Club out of the race offers Players whose
  contracts end; a Club in it looks for an upgrade at its weakest group. Its
  shapes are a Player for a Player, a Player for a pick and a Player for a
  prospect, with 50% retained when the buyer cannot otherwise fit him. Both Clubs
  must gain by a margin, an estimate. A Manager may declare any mix.
- **Retention** is kept as dead money is, by the Club that retained it, until the
  contract ends: at most 50% of a cap hit and 3 contracts at once, as cap rules
  (D-10), and a contract retained once is not retained again.
- **Between Seasons** the assistant trades twice, as the draft window opens,
  when the picks of that draft can be traded, and after the market closes; a
  Manager may trade in any window.
- **A proposal** to a Club that has declared no answer is answered by its
  assistant at once. Pending proposals between two Managers wait for Phase 4.
- **The movement targets** of the Phase 3 gate (another Club the next Season,
  more than one Club in a Season, moves in the 14 days before the deadline, and
  continuity) are reported in the long run from this item and asserted at the
  gate, with scouting and budgets. Without trades the generated runs give 7.6%
  for another Club the next Season, against 19.9% ±5, and 85.1% continuity,
  against 77.1% ±8.

## Amendment, 2026-11-26: trades as built (#138)

What #138 built, and what its calibration chose, with the author's approval of
2026-11-26.

- **Where it runs.** `trade/` values and searches; `season/` checks validity and
  applies. The assistant trades once a week during a Season, before waivers, up
  to the deadline, and in two rounds between Seasons: as the Season ends, when
  the next draft's picks can be traded, and after the market. A Club whose
  Manager trades himself (`managedTrades`) is never traded by the assistant,
  and answers a proposal only by his declaration.
- **Validity** adds to the decision: a Club must still be able to dress a
  Lineup, two Goalies among them, after a trade; picks are those of the next
  three drafts; and a retained share never takes a cap hit below the league
  minimum.
- **A pick traded** is held in `pickOwners`, keyed by draft, round and original
  Club, and the draft gives the pick to its owner, recording the Club it came
  from.
- **Every move is recorded** as a transfer, trades and waiver claims alike, with
  the day and the Fixtures the Player had played that Season. The movement
  targets are folded from the Season records (D-03).
- **Calibration** chose, each an estimate in `TRADE`:
  - no Goalie is traded during a Season: with them the busiest Goalie's share
    of starts fell to 52.8%, against 59% ±5;
  - the seller takes at least 0.4 of the gain the two Clubs share, as if more
    than one buyer wanted the Player: without it contenders bought stars for
    late picks, and the first Season's weakest Club fell to 42 points;
  - a seller asks more the further the deadline is, so moves gather before it;
  - an upgrade is worth something only to a Club in the race, weighted by its
    chance of the playoffs;
  - a seller has a chance below 0.25, a buyer above 0.65, at most 4 trades a
    week and 6 a window between Seasons;
  - the margin is 0.001 of the cap, small against R-09; it is weighed again
    with scouting, before a human trades in item 11.
- **Reported, not asserted,** until the Phase 3 gate: the movement targets
  (another Club the next Season 13.9%, more than one Club in a Season 3.9%,
  14 days before the deadline 34.1%, continuity 77.4%, on the eight generated
  runs), and the share of rounds 3 and 4 who play 200 Fixtures (0.096 and 0.056
  on the generated runs, 0.055 for round 4 on the roster file), which fall a
  hair below their bands now that late picks change Clubs.
- **The web** does not mark the Manager's Club as trading itself until item 11:
  its assistant trades for it, as it already moves its farm.
