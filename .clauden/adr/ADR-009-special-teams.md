# ADR-009 - Special-teams Units are ordered Skater lists; power-play events bracket a numerical advantage

- **Status:** Accepted
- **Date:** 2026-10-28
- **Relates to:** FR-04, FR-07, D-03, D-04, issue #5

## Context

Two things were left underspecified until penalties had to be simulated.

**What a special-teams `Unit` is.** It was declared as a `Line` and a
`Pairing` together - always five Skaters, always three forwards and two
defencemen. Neither half of a man advantage looks like that. A penalty kill
at 5-on-4 dresses four Skaters, usually two forwards and two defencemen, and
three at 5-on-3. A power play dresses five, very often four forwards and one
defenceman. Keeping the old shape would have meant the engine silently
deciding which of the Manager's five killers to leave on the bench, and the
Manager having no way to field a four-forward power play at all.

**What a `powerplay_start` / `powerplay_end` pair means.** The engine spec
said a penalty "emits `powerplay_start`", which reads as one pair per penalty.
That breaks as soon as both Clubs have a player in the box: at 4-on-4 nobody
has an advantage, yet both Clubs would be accruing power-play time. The NHL's
own power-play time counts only time with more Skaters than the opponent, and
the Tier 1 targets (285 s per Club per Fixture, a 99 s mean power play) are
measured on that definition.

## Decision

**A `Unit` is an ordered list of Skater ids.** A power-play Unit lists exactly
five, a penalty-kill Unit exactly four. Order is priority: when the situation
needs fewer Skaters than the Unit lists, or a listed Skater is in the box, the
engine takes the first available Skaters in order. A Manager who wants two
defencemen left on a 5-on-3 kill lists them first.

Whether a Unit member plays as a forward or a defenceman is read from the
Skater's natural position (the first entry of `preferredPositions`), since a
Unit has no slots.

When a Unit cannot supply enough Skaters because too many of them are in the
box, the engine fills from the dressed Skaters not in the box, in Lineup order
(Lines, then Pairings).

**A `powerplay_start` / `powerplay_end` pair brackets one Skater of numerical
advantage.** Every time a Club's advantage grows by one Skater the engine
emits a `powerplay_start` for it; every time it shrinks by one, a
`powerplay_end` with the reason: `expired`, `goal`, `penalty` (the advantaged
Club took a penalty of its own), or `period_end` (the Fixture ended). A 5-on-3
is therefore two nested pairs, and 4-on-4 is none.

## Rationale

The ordered list is the smallest shape that lets the Manager decide everything
that matters on special teams - who, how many of each position, and who stays
out when the count drops - without a second set of slots per strength state.
It goes through the same validation for every Manager (D-04).

Bracketing the advantage rather than the penalty makes the fold in
`src/stats` compute exactly the quantity the Tier 1 targets measure (D-03):
power-play opportunities are the number of starts, and power-play time is the
time with at least one pair open. One pair per penalty would have been simpler
to emit and would have made 4-on-4 count as power-play time for both Clubs.

## Consequences

- `Lineup.powerPlayUnits` and `Lineup.penaltyKillUnits` change shape, and
  `validateLineup` checks the new sizes. Lineups built before this change are
  not valid any more; nothing persisted them.
- `powerplay_end.reason` gains `'penalty'`.
- The Tier 4 identity "power-play time equals penalty minutes served" no
  longer holds at 4-on-4, so it is restated as "power-play time equals the
  time one Club had more Skaters than the other".
- Penalties continue across Period breaks, because the match clock is
  continuous. Pairs still open when the Fixture ends close with
  `period_end`.
- Even-strength play below five a side (4-on-4, 3-on-3) uses the
  even-strength selection with forwards removed first, down to two, then
  defencemen.
