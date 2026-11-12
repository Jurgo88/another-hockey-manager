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
