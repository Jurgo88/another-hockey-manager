# ADR-032 - Contracts expire, Clubs re-sign or let go, and free agents take one sealed offer

- **Status:** Accepted
- **Date:** 2026-11-12
- **Replaces:** the unsigned draw of ADR-027, which stood in for contracts
- **Amends:** ADR-023 and ADR-028 (a release moves a Player to free agency), ADR-028 (the windows between Seasons)
- **Relates to:** D-04, D-08, ADR-027, ADR-028, ADR-030, ADR-031, ADR-033, ADR-034, ADR-035, issue #121

## Context

ADR-027 sends a Player away as unsigned with a chance that falls steeply with
his role, fitted to the measured rates of leaving by ice-time third (1.3%, 5.3%
and 20.1%). The author pointed out why the real rates look so: a Player with a
small role seldom retires; his contract runs out and nobody signs him. That draw
was a stand-in until contracts exist.

The roadmap warns that an open bidding market inflates without fail. Escalating
bids push every price towards the most any Club can pay, and Clubs that can pay
most are the ones with room, which changes every Season.

The author chose on 2026-11-12:

- restricted free agency under 27, with a qualifying offer and no offer sheets;
- one sealed offer per Club within a band about the Player's ask, the Player
  choosing by money, role and Club;
- a free agent nobody signs leaves the league;
- a release becomes a buyout and a move to free agency.

## Decision

### The phase between Seasons gains two windows

The `Offseason` of ADR-028 becomes, in order:

1. **`endSeason`**: development, retirement (ADR-027, by age alone, unchanged),
   the draft order and the class. Every contract loses a year; those with none
   left expire.
2. **The draft window**, as ADR-028.
3. **The re-signing window.** Each Club declares, for each of its expiring
   Players, an offer or none. Where it declares nothing, the assistant decides.
4. **The Roster window**, as ADR-028, with releases now buyouts (ADR-031).
5. **The market window.** Each Club declares sealed offers to free agents, or the
   assistant makes them. The market resolves in rounds.
6. **`startNextSeason`**: the generated fill for any gap still open, the floor
   (ADR-031), and the new schedule.

Trades may be declared in any window (ADR-033). The simulation does not know who
is human, and when to close a window is the caller's policy (ADR-028).

### Re-signing

- **A restricted Player**, under 27 when his contract expires, stays if his Club
  makes him a qualifying offer at his ask (ADR-030), for a term his Club chooses
  within the rules. Without one he becomes unrestricted. Offer sheets from other
  Clubs are left out.
- **An unrestricted Player** accepts his Club's offer when it is at least his ask,
  unless he tests the market, a draw from his stream (D-08) whose rate is fitted
  to the measured share of Players who change Club between seasons (#122). A
  Player who tests the market goes to it with his Club's offer still standing,
  as an offer like any other.

### The market

**Who is in it**: unrestricted Players not re-signed, restricted ones without a
qualifying offer, bought-out Players, prospects whose rights expired (ADR-024),
and a pool of Players from outside the league, generated at the level of the
undrafted fill (ADR-027) and sized by the gaps the league has. The outside pool
replaces most of the fill: a Club now chooses whom it fills a gap with.

**An offer** names the Player, a cap hit between 0.9 and 1.25 times his ask, and
a term within the rules. A Club may make several, and each must fit its cap and
its wage budget (ADR-034) as if all its offers were accepted.

**The market resolves in rounds.** In each round every free agent with offers
takes the best one by his own measure:

- the money, as a share of his ask;
- the role he expects at that Club: his rank at his position among its Roster,
  by the public role of each (ADR-030);
- the Club's strength, its share of points last Season;
- a draw from his stream for the Season (D-08), so equal offers are not decided
  by Club id.

The weights are estimates, fitted in the long-run calibration. A Player's
measure reads his own ability and public facts, never a Club's scouting. Offers
not taken lapse; Clubs may make new ones in the next round, through the same
declare-or-assistant step. The market ends when a round has no offers.

**A free agent no Club signs leaves the league**, recorded as `unsigned`. A
Player with a small role has an ask near the minimum, but Clubs fill a gap with
the best Player they can see for it, so the weakest go unsigned. The rates of
leaving by ice-time third are no longer fitted: they follow from who is offered
a contract. If they miss their bands, the calibration moves how Clubs weigh age
and level against price, not a chance of leaving.

### Why prices stay put

- The ask is relative (ADR-030): it is the share paid to a role, not to what
  was paid last time.
- One sealed offer per Club per round, inside a band: no Club sees another's
  offer, so no offer is raised to beat one. The most any Player can be paid is
  1.25 times his ask.
- The cap and each Club's wage budget bound the total (ADR-031, ADR-034).

The Phase 3 gate asserts the result: the shares paid by rank stay inside their
bands over ten Seasons.

### Releases and departures

A release is a buyout (ADR-031): the Player goes to the market and leaves only
if nobody signs him. The departure reasons become `retired`, `unsigned` (in the
market and not signed) and `rights-expired` (an expired prospect no Club took);
`released` stays a move a Club makes, with its notice, not a way out of the
league.

### Every Club the same way (D-04)

The assistant's re-signing, buyouts and offers read the Club's own view of each
Player (ADR-035), its cap and its budget, and are the same function for every
Club. A Manager declares his own through the same calls.

## Options considered

**Every expiring Player unrestricted.** Simpler, but a Club could not keep the
young Players it drafted, and the draft lottery would help a weak Club for one
contract only. Restricted free agency holds talent where it was drafted, which
is a real source of differences between Clubs.

**Offer sheets for restricted Players,** with draft-pick compensation. Real but
rare, and it brings back bidding for the best young Players.

**Administered prices,** every free agent signing at his ask and choosing only by
role and Club. Inflation is impossible, but the market is flat: a Club cannot
pay more for a Player it values more.

**Open, escalating bids.** Inflates, as the roadmap warns.

**Normalising asks each summer** so the league spends a set share of the cap. Not
needed when the ask is relative, and it would hide a drift rather than prevent
it.

**A chance of leaving kept beside the market,** a Player going to Europe when his
best offer is low. A fallback if the market cannot meet the leaving targets; it
would be a parameter of the Player's measure, not a separate draw.

## Consequences

- ADR-027's unsigned draw and its fitted parameters go; retirement stays.
- The leaving targets of the Phase 2 gate, by age and by ice-time third, stay
  targets of the Phase 3 gate, now as a consequence of contracts.
- The undrafted fill of ADR-027 shrinks to the gaps the market leaves.
- A Manager's notices gain re-signings, qualifying offers, offers taken and
  lost, and buyouts.
- The `Offseason` grows two windows and a market state; ADR-014's plain-JSON
  rule holds.

## Amendment, 2026-11-12: the re-signing window before free agency (#127)

Item 3 of Phase 3 opens the re-signing window; the market of item 5 does not
exist yet. The author chose on 2026-11-12:

- **The window** is the phase `resign` between the draft and the Roster window.
  `endSeason` takes a Season off every contract; one at 0 has run out, and its
  Player stays on the Roster with the place his ask is priced from. A Club
  declares whom it re-signs and for how long (`setReSignings`); whoever it does
  not list is let go. `runReSigning` closes the window, the assistant deciding
  for every Club that declared nothing, by the same function for all (D-04).
  Violations are data: a Player whose contract has not run out, one named
  twice, a term outside 1 to the longest with his own Club.
- **The price is the ask.** A qualifying offer is the ask, and an unrestricted
  Player accepts the ask. An offer above it matters only against other Clubs,
  so it comes with the market, as does the draw by which an unrestricted Player
  tests it.
- **The assistant re-signs every expiring Player** at his ask and the term he
  draws. Whom to let go comes with the market and budgets. (From #129 it
  re-signs the best by level while they fit under the cap, ADR-031.)
- **A Player let go leaves the league as `unsigned`** until the market exists,
  and his place is a gap the Roster window and the fill close.
- **The unsigned draw of ADR-027 stays** until the market replaces it, so the
  leaving bands of the Phase 2 gate hold. Until then it may still take a Player
  whose contract runs on.
- **Notices** `reSigned` (with the term) and `letGo`. The web runs the
  assistant's re-signing after the draft until item 10 gives it a window.

Reported by `pnpm sim:season --seasons 10`, not asserted: in a generated league
the assistant keeps 81-96% of expiring restricted regulars and 80-86% of
unrestricted ones, against the measured 70% and 47% the Phase 3 gate asserts
once the market exists. Payrolls rise from 87% of the cap in Season 1 to 96% by
Season 5 as asks follow role, with the highest Club near 113%; the cap of item 4
bounds that.

## Amendment, 2026-11-13: the market as built (#130)

Item 5 of Phase 3. The market follows the decision above; what it took to make
it work, and the author's choices of 2026-11-13:

- **The windows.** `runRosterMoves` closes the Roster window and opens the
  market (phase `market`); `marketRound` resolves one round and `runMarket`
  all of them (phase `closed`). A Club declares its offers for the round with
  `setOffers`, or the assistant's (`proposedOffers`) stand: the same call for
  every Club (D-04). Violations are data: not a free agent, offered twice,
  outside the band, a term outside the rules (7 Seasons to the Club's own
  Player, 6 to another's), more offers than places in a group, over the cap, or
  a Roster that could no longer dress a Lineup.
- **Who is in it.** Those let go in the re-signing window; unrestricted Players
  testing the market, a draw at `testRate` (an estimate, 0.35), their Club's
  offer standing in the first round ahead of its other offers while its
  Roster has room; released Players after their buyout; prospects whose rights
  expired; and Players from outside the league, 1.5 times the league's open
  places, at their natural positions.
- **The outside pool** is generated at the age of a call-up and an ability up to
  0.4 above it, for Skaters; a Goalie at a call-up's depth is already an NHL
  Goalie and is not lifted. Weaker, it could not push out the bottom of a Roster
  as Players from Europe and the AHL do.
- **An ask falls 15% for every round its Player goes unsigned,** down to the
  minimum. The author chose it on 2026-11-13: without it a Player no Club can
  afford at his ask left the league, the top third of role among them.
- **The assistant** judges a Player a Season ahead (`expectedLevel`), as it
  does prospects. It re-signs the top four fifths of the league's regulars by
  role and Players up to 23, the best first while they fit (the author's choice
  of 2026-11-13; it re-signed every expiring Player before). In the market it
  offers, for each open place, the best free agent it can afford at the natural
  position the Club needs, its shortfalls to dress a Lineup first, at his ask.
- **A free agent rates an offer** by money against his ask, his role there,
  the Club's share of points and a draw (weights estimated, money 4, role 1,
  strength 0.5, draw 0.5). The best by level choose first.
- **Leaving.** A free agent from the league nobody signs leaves as `unsigned`,
  a former prospect as `rights-expired`; a Player from outside goes back. A
  release is a move with its notice, no longer a departure. The unsigned draw of
  ADR-027 is gone; the realism test of its chances goes with it, and leaving is
  asserted on the ten-Season runs of the Phase 2 gate.
- **Gaps the market leaves** take a generated fill at the natural positions the
  Club needs, its shortfalls to dress a Lineup first.

Fitted on eight generated leagues and the roster file: every leaving band by
age and by third of role is inside on the generated leagues. Until the farm
(ADR-036) a prospect takes a gap before he is ready (ADR-028 amendment), and the
targets that follows from are reported, not asserted: the share of Players aged 23 or younger, the leaving rate of those aged 23
or younger, and the median Seasons to a debut of rounds 2 to 4, on the
generated leagues and the roster file; on the roster file alone, the leaving
rates of the top and middle thirds of ice time and the share of round 4 who
play 200 Fixtures, each a hair outside; and in the tenth Season the penalties
per Club (3.04 against 3.03) and the Skaters with 40 goals or more (8.4 against
9).
