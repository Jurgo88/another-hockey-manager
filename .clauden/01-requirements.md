# 01 - Requirements

Identifier scheme follows the convention established on HermanTool:

| Prefix | Meaning |
| --- | --- |
| `FR-xx` | Functional requirement |
| `NFR-xx` | Non-functional requirement |
| `D-xx` | Decision (an invariant that code must uphold) |
| `R-xx` | Risk |
| `OQ #x` | Open question |

## Functional requirements - Phase 0

| ID | Requirement |
| --- | --- |
| FR-01 | The engine simulates one Fixture from a `FixtureInput` and a numeric seed, returning an ordered array of `MatchEvent`. |
| FR-02 | The same `(FixtureInput, seed)` pair always produces a byte-identical event stream. |
| FR-03 | Match time advances by Shift, not by second. Each Shift places one unit per Club on the ice and consumes stamina. |
| FR-04 | Within a Shift, possession is resolved as a sequence of discrete possessions, each ending in a shot, a turnover, a penalty, or a stoppage. |
| FR-05 | Shot outcomes resolve against the defending Goalie's attributes, producing `goal`, `save`, `miss` or `block`. |
| FR-06 | A save may leave the puck live, producing a rebound chance within the same possession sequence. |
| FR-07 | Penalties create a man advantage that persists for the penalty duration or until a power-play goal. |
| FR-08 | Special-teams units declared in the Lineup are used while a man advantage is active. |
| FR-09 | Tied Fixtures that disallow a tie proceed to overtime and then a shootout. |
| FR-10 | Tactics affect outcomes: `aggression`, `shotVolume`, `shiftLength` and `matchup` each have a measurable effect on the resulting statistics. |
| FR-11 | All Match, Club, and Player statistics are computed from the event stream. No statistic is produced by the engine alongside the stream. |
| FR-12 | A Season schedules a double round robin over N Clubs and produces standings from played Matches. |
| FR-13 | A CLI command simulates a full Season and prints standings plus scoring leaders. |
| FR-14 | Fatigue accumulates within a Match and carries across a congested schedule, recovering between Fixtures. |

## Non-functional requirements

| ID | Requirement |
| --- | --- |
| NFR-01 | `@ahm/sim` has zero runtime dependencies. |
| NFR-02 | `@ahm/sim` has no knowledge of any database, HTTP layer, or interface framework. It imports nothing from the application. |
| NFR-03 | A single Fixture simulates in under 10 ms on the development machine, so that a 10,000-fixture realism suite completes in about a minute. |
| NFR-04 | TypeScript `strict` plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. No `any` in `src`. |
| NFR-05 | Specification documents and all code identifiers are in English. Conversational exchanges are in Slovak. |
| NFR-06 | The realism suite is the definition of done for Phase 0 and runs in CI. |

## Decisions (invariants)

| ID | Decision |
| --- | --- |
| D-01 | The engine is a pure function. No I/O, no clock reads, no ambient state. |
| D-02 | `Math.random()` must never appear in `@ahm/sim`. All randomness draws from an injected `Rng`. |
| D-03 | The event stream is the single source of truth for everything derived. |
| D-04 | A Manager is one entity with an `isAi` flag. There is no separate AI code path and no `if (human)` branch in the engine. |
| D-05 | The Roster source sits behind an interface. Real and generated Rosters are interchangeable implementations. See ADR-003. |
| D-06 | A Player attribute may only exist if some code path in `src/engine` reads it. |
| D-07 | Domain vocabulary is enforced. `Team`, `Game`, `User`, `Squad` are banned identifiers. |
| D-08 | Each Fixture draws from its own forked `Rng` stream, so adding or removing a Fixture does not change the results of the others. |
| D-09 | Statistical realism targets live in `04-validation-targets.md` and are expressed as executable tests, not prose. |

## Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| R-01 | The engine produces realistic aggregate scoring but distributes points evenly across a Roster, so Manager decisions feel weightless. | Point-distribution assertions are a first-class gate, not a nice-to-have. See `04-validation-targets.md`. |
| R-02 | Licensing: NHL club marks and the exclusive simulation licence held by EA make a monetised product using real club identity untenable. | D-05 / ADR-003. Real data stays local; a public build uses generated Rosters. No club logos at any point. |
| R-03 | Calibrating the engine turns into indefinite parameter fiddling with no completion criterion. | The realism suite defines done. Phase 0 ends when it is green, not when the engine feels right. |
| R-04 | Scope creep into interface work before the engine is validated, which is the standard failure mode for this genre. | Phase 0 has no web application in the workspace at all. |
| R-05 | Solo project stalls after a break because decisions were held in the author's head. | ADRs for every non-obvious decision; specification precedes implementation. |
| R-06 | Slovak Extraliga has no public API, so real non-NHL data needs scraping or manual seeding. | Out of Phase 0 entirely. Revisit when a Roster source beyond the generator is actually needed. |

## Open questions

| ID | Question | Blocks |
| --- | --- | --- |
| OQ #1 | Should shootouts award a distinct standings point scheme (3-2-1-0) or the NHL 2-1-0? | FR-09, FR-12 |
| OQ #2 | Confirm shots-per-game, league save percentage and power-play percentage against a current season before locking tolerance bands. | `04-validation-targets.md` |
| OQ #3 | How many Clubs in the Phase 0 reference Competition - 14, 16, or a real 32-Club structure? | FR-12 |
