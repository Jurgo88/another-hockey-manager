# ADR-020 - A roster file keeps the provenance it carries

- **Status:** Accepted
- **Date:** 2026-11-02
- **Supersedes in part:** ADR-003, on every imported value arriving as `rated`
- **Relates to:** FR-17, FR-18, FR-19, D-05, D-11, ADR-003, ADR-008, ADR-012, issue #16

## Context

The ADR-003 amendment added a roster file, so that real names are something a
Manager imports rather than something the project distributes. It said that
imported values arrive as `rated`, which outranks anything the estimator derived.

That rule was written for a hand-rated community file. It breaks once the file
can also be exported. A generated Player's `checking` of 14 is `generated` at
confidence 0.25 and is shown as 10-18. Exported and imported again, unchanged, it
would come back `rated` at 0.8 and be shown as 13-15. A measured `speed` would drop
from 0.95 to 0.8 and lose its source. Both present a value with more or less
certainty than it has, against D-11.

Three more questions had to be settled before the format could be fixed:

- `potential` was mapped linearly while attributes use a convex curve. Across 8
  seeds, 21% of Players had a `potential` below their own best attribute, and 71%
  of those aged 30 or more sat at least 1.5 above their mean attribute.
- How large a Roster a file may hold.
- Where parsing lives, since `domain/` holds types only.

## Decision

**An attribute keeps the provenance the file gives it.** An attribute with none
in the file arrives as `rated` at the default confidence, as ADR-003 said. A
hand-rated community file therefore behaves as before, and exporting then
importing changes nothing. A file that states a provenance is the statement of
whoever wrote it.

**`potential` is the ceiling of a Player's level.** The level is the mean of a
Skater's attributes without `faceoffs` and `discipline`, which belong to a role or
to temperament rather than to ability, and the mean of all five for a Goalie. Both
sit on the 1-20 attribute scale. Single attributes may sit above `potential`, so
Players stay uneven. The generator puts its headroom on top of the level the
Player was generated with, through the same curve as the attributes, so it never
falls below the rounded level. Phase 2 development moves the level towards it.

**A file holds exactly the Roster shape: 16 forwards, 10 defencemen and 3
Goalies,** by natural position. The injury rate is calibrated on that depth
(ADR-012), and Phase 2 keeps it. Real Clubs short of it are completed with
generated Players at low confidence.

**A new module, `roster/`, may import `domain` only.** It parses, validates and
exports the file and provides a `RosterProvider` from it (D-05). The structure the
file names is passed in by the caller, so the module needs no data.

**The format is JSON with a version.** Validation is hand-written, since
`@ahm/sim` has no dependencies (NFR-01), and reports every problem with its path.
A newer version is refused. The format is described in `06-roster-file.md`.

## Options considered

**Every imported value as `rated`, as ADR-003 had it.** No new decision, but a
round trip through a file raises or lowers confidence and loses the source.

**One source for a whole file.** Simpler than per attribute, but it cannot say what
ADR-008 exists to say: that one Player's `speed` is measured and his `checking` a
guess.

**A ceiling per attribute.** The most precise basis for development, but 16 more
invisible numbers per Player, and nothing the estimator could estimate them from.

**A Roster of any size that can dress a Lineup.** Kinder to a community file, but
a thin Roster runs out of spares under injuries, and the Season and Phase 2 would
have to handle every shape.

**Parsing in `domain/` or `generate/`.** The first holds types only, and the
second is about generating.

## Consequences

- A Season from an exported generated league, imported again, is identical to one
  from the generator.
- Every result stays the same: `potential` is read by nothing in the engine, and
  the generator draws the same random numbers as before.
- `startSeason` takes a `RosterProvider` and falls back to the generator.
- A hand-edited value under an unchanged provenance passes as what the file says.
- Importing a file in the web application is a separate task.
