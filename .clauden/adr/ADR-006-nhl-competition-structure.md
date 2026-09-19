# ADR-006 - Real NHL 2026-27 competition structure and 84-game schedule key

- **Status:** Accepted
- **Date:** 2026-09-18
- **Relates to:** FR-12, FR-15, D-05, OQ #1, OQ #3
- **Supersedes:** the balanced-double-round-robin sketch in FR-12 as originally written

## Context

Phase 0 needs a reference Competition to simulate. The original specification
left the size open (OQ #3) and sketched a balanced double round robin, which
would have produced 62 Fixtures per Club over 32 Clubs.

That created a problem: every statistical target in
`04-validation-targets.md` is derived from published NHL figures. A league
whose shape does not match the NHL requires every Season-length target to be
rescaled by hand, and each rescaling is a place to introduce an error that
then looks like an engine defect.

Separately, the NHL regular season expands from 82 to 84 games in 2026-27,
the first 84-game season since 1993-94. The two extra games are divisional.

## Decision

The reference Competition is the real NHL 2026-27 alignment: 32 Clubs, two
conferences, four divisions of eight.

The schedule key:

| Opponent group | Count | Games each | Venues | Subtotal |
| --- | --- | --- | --- | --- |
| Same division | 7 | 4 | 2 home / 2 away | 28 |
| Same conference, other division | 8 | 3 | 4 opponents 2H/1A, 4 opponents 1H/2A | 24 |
| Other conference | 16 | 2 | 1 home / 1 away | 32 |
| | | | | **84** |

Exactly 42 home and 42 away, over 84 rounds of 16 Fixtures.

Standings use the NHL points scheme: 2 for a win, 1 for an overtime or
shootout loss, 0 for a regulation loss (OQ #1 resolved).

## Rationale

**Comparability.** Using the real structure means published league figures
are the targets, unmodified. That removes a whole class of rescaling error
from the one artefact that defines when Phase 0 is finished.

**The key is fully specified.** The home and away split is not approximate:
the published matrix gives 7 opponents at 2 home / 2 away, 4 at 2 home / 1
away, 4 at 1 home / 2 away, and 16 at 1 home / 1 away. That makes the
scheduler testable against an exact expected result rather than a plausible
one, which is what the tests in `test/schedule.test.ts` assert per Club.

**Cost is negligible.** A Season is 1,344 Fixtures. Within the NFR-03 budget
that is about 13 seconds per simulated Season.

**Divisions and conferences are needed anyway.** Playoff seeding, rivalry
weighting and travel fatigue all key off them. Modelling them now costs
almost nothing; adding them to a flat league later touches the scheduler,
standings and playoff code together.

## Scope limit on real data (ADR-003 still holds)

This decision covers competition *structure*: how many Clubs, how they are
grouped, and how often each pair meets. That is factual format, not club
identity.

Real Club names live in `packages/sim/src/data/nhl-2026-27.ts` as a local
development and reference dataset. A public build takes its Clubs from the
generator, which mirrors this same structure with generated names. Club marks
and logos are not used in any build. ADR-003 is unchanged.

## Implementation note

A schedule meeting this key cannot be produced by generating Fixtures and
then packing them into rounds - that is an edge-colouring problem where greedy
assignment deadlocks. Instead the schedule is built as four layers, each a
clean round-robin decomposition whose rounds concatenate:

| Layer | Content | Rounds |
| --- | --- | --- |
| A | Single round robin over all 32 Clubs (circle method) | 31 |
| B | Layer A with venues reversed | 31 |
| C | Per conference, the 8x8 cross-division set as 8 perfect matchings | 8 |
| D | Per division, a double round robin | 14 |
| | | **84** |

A and B give every pair one home and one away. D adds the two extra
divisional games at one venue each, reaching 4 games at 2-2. C adds the single
extra cross-division game, with the first division home for the first four
matchings and away for the last four - which is what makes each Club
home-heavy against exactly four of those eight opponents. Non-conference
pairs receive nothing further.

Because every layer is a decomposition into perfect matchings, each Club plays
exactly once per round by construction, so matchday order can be shuffled by
the seed without breaking anything.

## Consequences

- The Tier 2 targets in `04-validation-targets.md` are scaled to 84 Fixtures.
- Playoff format becomes a real question, tracked as OQ #4. It is not needed
  until the regular season simulates end to end.
- Travel and time-zone fatigue are now expressible, since divisions carry
  geography. Not modelled in Phase 0.
- The alignment needs review each season. It is data in one module, not logic.
