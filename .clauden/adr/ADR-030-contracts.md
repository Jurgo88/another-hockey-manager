# ADR-030 - A contract's price follows the Player's public role, as a share of the cap

- **Status:** Accepted
- **Date:** 2026-11-12
- **Relates to:** D-04, D-06, D-08, D-10, ADR-020, ADR-024, ADR-027, ADR-028, ADR-031, ADR-032, issue #121, issue #122

## Context

Phase 3 brings contracts, wages and a salary cap (`05-roadmap.md`). Every
Player on a Roster needs a contract, and every contract needs a price and a
length. The roadmap warns that an open bidding market inflates without fail, so
how a price is set decides whether a ten-Season run stays inside the bounds of
the Phase 3 gate.

The real league, as the 2026-27 rules stand (the 2025 memorandum of the CBA):

| Rule | 2026-27 |
| --- | --- |
| Upper limit | $104.0 million |
| Lower limit | $76.9 million |
| Most a Player may earn | 20% of the upper limit |
| League minimum | $850,000, rising to $1 million by 2029-30 |
| Longest term | 7 years re-signing with his Club, 6 years elsewhere |
| Entry-level contract | at most the minimum + $175,000 from the 2027 draft |

The author chose on 2026-11-12 among three ways to set a price: from last
Season's production, from the Player's public role and age, or by auction.

## Decision

**Money is held as a share of the cap.** A contract's cap hit is a fraction of
the league's upper limit. The interface shows it in the league's currency, the
share times the upper limit the Competition declares (D-10): $104,000,000 for
the NHL of 2026-27. A share has the same meaning in every Season, so a rise of
prices is visible as a rise of shares, and the real cap's growth with revenue,
like the league's scoring trend in `07-league-over-time.md`, is not read as
inflation.

**A contract is its cap hit, its years left and its kind.** One average figure a
year, no schedule of base salary and bonuses, no clauses. The cap counts the
average, so a schedule would change nothing the simulation reads (D-06). The
kinds:

- **Entry-level**: signed when a prospect is called up (ADR-028) or a Player
  joins the league young. Its price is fixed, the minimum plus the entry-level
  margin, and its length follows the CBA by age at signing: three years to 21,
  two at 22 and 23, one from 24.
- **Standard**: everything else.

At expiry a Player under 27 is a **restricted** free agent and an older one
**unrestricted** (ADR-032). The CBA also frees a Player after seven accrued
seasons; age alone is close enough, and a run does not keep accrued seasons.

**A Player's asking price follows his public role.** His role is his rank by ice
time per Fixture at his position group across the league last Season, as
ADR-027 ranks it, Goalies by Fixtures. A Player who did not play, or was injured
when the Season ended, takes his rank by level instead, as ADR-027 does. The
ask is:

- the measured cap share of that rank in the real league (#122), by position
  group;
- moved by his age and status, as measured: a restricted Player asks less than
  an unrestricted one of the same rank;
- held between the league minimum and the maximum share.

The ask is public: every Club sees the same figure. Whether a Player is worth it
is each Club's own judgement, made on what its scouting sees (ADR-035). That
split is the point: the price comes from what everyone can see, the value from
what only a Club knows, so a Club that scouts better finds Players who are
cheap for what they are.

**The ask is relative, so it cannot drift.** The fiftieth role in the league
asks the fiftieth share every Season, whatever was paid the Season before. What
a Club offers above it is bounded by ADR-032.

**The term follows the measured distribution by age** at signing (#122), drawn
from the Player's stream for that Season (D-08), and a larger role draws
longer. It is cut to the longest term the Competition allows: 7 years with his
own Club, 6 elsewhere.

**The rules are data (D-10).** The minimum, the maximum share, the entry-level
margin and lengths, the restricted age and the longest terms sit in the
Competition's cap rules (ADR-031), beside its draft format.

**A league opens with contracts.**

- A generated league gives every Player a contract at the ask of his rank by
  level, with years left drawn uniformly over his term, then scales each Club's
  contracts to its wage budget (ADR-034).
- A roster file may carry contracts (ADR-020 amendment, in the item that adds
  contracts). Without them, its Players get contracts as a generated league's
  do, by rank of ice time where the file has it. A Club over the cap when the
  league opens has its contracts scaled down to fit.
- Prospects hold rights, not contracts (ADR-024). An undrafted fill signs at
  the minimum.

## Options considered

**Price from last Season's production,** points and ice time, as real
arbitration does. Realistic, but one hot Season sets a price for years, and
production is partly the Club's doing, so a good Club would make its Players
expensive. Role is the measure ADR-027 already uses and that real departures
follow.

**Price by auction.** The market sets every price. It inflates, as the roadmap
warns, and an inflating economy would have to be held down by a second
mechanism.

**Money in currency, a cap that grows each Season.** Faithful to the real cap,
but every comparison across Seasons would need the cap of each, and a target on
inflation could not tell a rising cap from rising prices.

**A full salary schedule with bonuses and clauses.** No part of the simulation
reads them, against D-06. Movement clauses may return if trades need them.

## Consequences

- Each Club carries contracts; a Player without one is a prospect, a free agent
  or gone.
- A Player's role now decides his price as well as his future (ADR-027): who a
  Manager plays sets what he will cost.
- The curve of cap share by rank, its moves by age and status, and the term by
  age are measured in #122 from one snapshot of contracts. Until then the ADR
  holds the shape and the targets are marked to be measured.
- The Phase 3 gate asserts that the shares paid by rank stay inside their bands
  over ten Seasons (`04-validation-targets.md`).

## Amendment, 2026-11-12: contracts in the domain (#125)

Item 2 of Phase 3 puts contracts on the Rosters. Nothing enforces the cap yet,
and the engine reads no contract, so every result of a Match stays as it was.

- **Where a contract lives.** `contract` is an optional field of a Player,
  as `provenance` is: it moves with him, a prospect holds none, and the engine
  never reads it. Every Player on a Roster holds one once a Season starts.
- **The rules as data.** `CapRules` joins `SeasonFormat` (D-10) with what is
  read today: the cap in currency (104,000,000), the minimum (850,000), the
  maximum (20%), the entry-level cap hit (its maximum, 1,025,000) and length by
  age at signing, restricted until 27, and the longest term (7 with the
  Player's own Club, 6 elsewhere). Injury relief, retention and buyouts join it
  in item 4, where they are read. A contract leaves its Player restricted when
  his age in its last Season is under 27.
- **The curve as data.** `pnpm sim:measure --contracts --module` writes
  `generate/nhl-cap-shares.ts` from the 2025-26 view: regulars per Club in each
  group (14.6 forwards, 7.4 defencemen, 2.1 Goalies), the mean cap share by
  tenth of role in each group, and by third of role the shares on entry-level
  and restricted contracts, the restricted-to-unrestricted ratio and the mean
  term of a new standard contract.
- **How a league opens.** Players are ranked by level in their group across the
  league. As many as real Clubs have regulars are priced on the curve by tenth;
  the rest of a 16-10-3 Roster is paid the minimum for a year. The curve is a
  mean over the real mix of contracts, so the unrestricted price is solved from
  it with the measured entry-level and restricted shares, and a contract that
  leaves its Player restricted pays the measured ratio of that. A Player aged
  21 or younger holds an entry-level contract part way through. A term is drawn
  evenly from 1 to twice the measured mean less one, at most the longest, and a
  running contract has a share of it already gone. Cap hits are whole currency.
  A Club over the cap has every contract above the minimum brought down in
  proportion. Each Player draws from a stream of his own (D-08). A contract a
  roster file gives is kept.
- **Until re-signing (item 3).** Between Seasons every contract loses a Season,
  and one that ran out is renewed at the ask: the curve by the Player's place in
  level, not yet by the public role this ADR prices on. A prospect called up
  signs an entry-level contract; the fill and a former prospect a Club takes
  sign one year at the minimum.
- **Real contracts.** `pnpm sim:estimate` gives each matched Player the
  contract CapWages shows for the season, in shares of that season's cap: 894
  of 928 Players in 2025-26, the rest and the fill getting the opening
  contract. The author decided on 2026-11-12 that the committed roster file
  carries them (R-10). They were added to it without estimating it again, so
  its attributes are as they were.
- **Stored careers.** A Season or phase between Seasons stored before this
  change gets the NHL's rules and the opening contracts when it is read, the
  same each time.

Reported, not asserted: a generated league opens at a mean payroll of 86% of
the cap (SD 10 pp, lowest 70%, highest 100%) against the measured 94-96%; by
Season 4 the highest is near 120% and the lowest near 67%, which the cap and
floor of item 4 and the budgets of item 7 bound. The real 2025-26 contracts open
at 94% (SD 8 pp). `pnpm sim:season --seasons 10` prints payrolls by Season.
