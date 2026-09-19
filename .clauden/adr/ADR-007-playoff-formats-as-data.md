# ADR-007 - Playoff formats are declarative data

- **Status:** Accepted
- **Date:** 2026-09-18
- **Relates to:** FR-12, FR-16, OQ #4, ADR-006

## Context

The NHL playoff format is specific: sixteen Clubs, the top three of each
division plus two wild cards per conference, four best-of-seven rounds, fixed
brackets with no reseeding between them. Implementing it directly as control
flow would be the shortest path.

But other leagues want other formats. The Slovak Extraliga uses a play-in.
Some leagues seed straight off the conference table. A cup competition is
single elimination. And the Manager should be able to choose the format when
starting a game, which means more than one must coexist at runtime.

A format hard-coded as branching logic makes each of those an edit to the same
function, and the fifth league turns it into a tangle of special cases.

## Decision

A `PlayoffFormat` is a data value describing:

- `qualification` - an ordered list of rules (`division-top`,
  `conference-wildcard`, `conference-top`, `league-top`), each applied to the
  Clubs not yet qualified
- `bracket` - the pairing shape (`nhl-divisional`, `conference-seeded`,
  `league-seeded`)
- `winsPerRound` - games needed per round, whose length is the round count
- `reseedEachRound` - whether survivors are reordered by record

`engine/playoff.ts` interprets these. Adding a league means declaring a value.
Adding a genuinely new pairing shape means one new builder function, and
nothing else changes.

Phase 0 implements `nhl-divisional` only, as `NHL_PLAYOFF_FORMAT`. The other
two bracket shapes are declared in the type and have a generic builder, but
are not the focus and are not validated.

## Rationale

Qualification and bracket shape are genuinely independent axes: a league can
seed from divisions but pair by straight conference rank, or qualify
league-wide but bracket by conference. Separating them means N qualification
rules and M bracket shapes give N×M formats without N×M code.

Ordered qualification rules also express the subtle part of the NHL format
correctly. Wild cards are "best remaining in the conference", which only has
meaning after division places are taken. An ordered list with a running set of
already-qualified Clubs says exactly that, in a way that generalises.

The alternative - a format enum with a switch per stage - was rejected because
the switch reappears in qualification, bracket construction, round naming and
reseeding, so every new league touches four places.

## Consequences

- Seeding is testable against synthetic standings without simulating a Season,
  which is why `test/playoff.test.ts` can assert the NHL bracket rules exactly
  (better division winner draws the weaker wild card, second meets third
  inside each division, no cross-conference first-round series).
- `StandingsRow` and a tiebreaking comparator were needed earlier than planned.
  The comparator implements points, then regulation wins, then goal
  differential, then Club id. The real NHL order also uses games played and
  head-to-head; games played is irrelevant when every Club finishes its
  schedule, and head-to-head needs the Fixture list rather than the table. The
  Club id fallback makes the ordering total, which keeps seeding deterministic
  (D-01).
- Only the first round can be built at seeding time, since later pairings
  depend on results. A bracket therefore carries its rounds as they resolve.
- A format the interpreter does not recognise must fail loudly rather than
  silently produce a partial bracket. The builder throws when a conference
  does not yield the seeds its bracket shape requires.
