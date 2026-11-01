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
| FR-09 | Regular-season overtime is one five-minute sudden-death Period at 3-on-3, then a shootout. The overtime unit is three Skaters, not a Line and a Pairing, and the Lineup supplies an overtime rotation. |
| FR-09a | Playoff overtime is full twenty-minute sudden-death Periods at 5-on-5, with intermissions, repeated until a goal. There is no shootout. Fatigue must keep accumulating across every extra Period. |
| FR-09b | A `PlayoffFormat` implies its overtime regime. The engine is told which regime applies; `allowsTie` alone is insufficient, and the two regimes must not share a code path that assumes five minutes. |
| FR-10 | Tactics affect outcomes: `aggression`, `shotVolume`, `shiftLength` and `matchup` each have a measurable effect on the resulting statistics. |
| FR-11 | All Match, Club, and Player statistics are computed from the event stream. No statistic is produced by the engine alongside the stream. |
| FR-12 | A Season schedules the real NHL 2026-27 competition - 32 Clubs, 2 conferences, 4 divisions of 8 - using the 84-game key: 4 games against each divisional opponent (2 home / 2 away), 3 against each cross-division conference opponent (home-heavy against exactly 4 of the 8), 2 against each non-conference opponent (1 home / 1 away). 84 Fixtures per Club, 42 home and 42 away, over 84 rounds of 16 Fixtures. See ADR-006. |
| FR-15 | Standings use the NHL points scheme: 2 for a win, 1 for an overtime or shootout loss, 0 for a regulation loss. Ties break on points, then regulation wins, then goal differential, then Club id. |
| FR-16 | Playoff formats are declarative data, selectable when a game starts. Phase 0 implements the current NHL format: top three per division plus two wild cards per conference, four best-of-seven rounds, fixed brackets, the better division winner drawing the weaker wild card. See ADR-007. |
| FR-17 | Every attribute value carries a provenance record - `measured`, `derived`, `rated` or `generated` - plus a confidence in 0-1, held parallel to the attributes. A Roster without provenance is treated as uniformly generated. See ADR-008. |
| FR-18 | The interface presents a low-confidence attribute as a range, never as an exact figure. Narrowing that range is what scouting does. |
| FR-19 | Rosters can be imported from and exported to a documented roster file. Imported values arrive as `rated`. See the ADR-003 amendment. |
| FR-20 | A Lineup dresses exactly 18 Skaters and 2 Goalies - four Lines, three Pairings, a starter and a backup. This is already the shape of the `Lineup` type; it is stated here so validation has a rule to cite. |
| FR-21 | A playoff series alternates venues 2-2-1-1-1: the higher seed is at home for games 1, 2, 5 and 7. |
| FR-22 | A trailing Club may replace its Goalie with an extra attacker late in a Fixture, governed by the Manager's rules: per deficit, how early to pull, and optionally only on a power play. This is the only source of `emptyNet` goals. It never applies in playoff overtime. |
| FR-23 | Ice-time deployment must match measured NHL distribution: about 19:34 per Fixture for a first-Line forward and 12:03 for a fourth-Line forward. The point gap between tiers must come mostly from scoring rate, not from extra ice time. See `04-validation-targets.md`. |
| FR-13 | A CLI command simulates a full Season and prints standings plus scoring leaders. |
| FR-14 | Fatigue accumulates within a Match, lowers play, and carries across a congested schedule, recovering between Fixtures. See ADR-010. |
| FR-25 | The backup Goalie starts Fixtures under a rule in Tactics: whoever played yesterday may sit, and whoever has started a set number running may sit the next. The rule is applied before the Fixture, the same for every Manager. See ADR-011. |
| FR-26 | Players get hurt: mostly in a Match, in proportion to ice time, and some off the ice before the opening faceoff. An injury is an event naming the Fixtures the Player will miss, at measured frequency and length. See ADR-012. |
| FR-27 | A Lineup answers an injury by itself: the Skater moves to the bottom of their column, everyone below steps up, and a spare fills the slot between Fixtures. The backup Goalie takes the net and the next healthy Goalie dresses. See ADR-012. |
| FR-24 | A Fixture is scheduled on a calendar day. Gaps between a Club's Fixtures follow the measured NHL shape, about one in six a back-to-back, and no Club plays three days running. See ADR-010. |
| FR-28 | A Season advances one calendar day at a time from plain stored state. Stopping and reloading between any two days changes no result. See ADR-014. |
| FR-29 | After the regular Season, playoff series play through the same daily advance until a champion is known. Goalie rotation does not apply in the playoffs. See ADR-015. |
| FR-30 | A Manager may set up before a Fixture, follow it at a chosen speed, pause, and change the Lineup and Tactics at any point, using only dressed Players. A change counts from the next Shift after the revealed part, and nothing revealed can change. With no natural replacement left, an injury can put a Skater out of position; a change may rearrange around that, but may not leave more Skaters out of position than the Fixture already has. See ADR-016 and ADR-018. |
| FR-31 | A Manager advances a Season one day at a time or up to their next Fixture, stopping before it. The Season state carries regular-Season and playoff Player totals, so leaders need no replay of the Matches. |
| FR-32 | A Manager is told which Players in their Lineup are out, before a Fixture, and can replace them in one click. A Manager who does nothing is covered by FR-27. A declared Lineup may keep a Skater out of position only when injuries leave no natural replacement. |
| FR-33 | A Manager receives notices about their Club in an inbox, folded from the Fixtures played: who was hurt and who is fit again. A new kind of notice is one more member of a type and one more line of wording. |
| FR-34 | A Manager can let an assistant coach propose the best Lineup from the fit Players, using the builder that sets AI Lineups (D-04). Tactics stay, and it counts only once saved. |

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
| D-08 | Each Fixture draws from its own forked `Rng` stream, so adding or removing a Fixture does not change the random numbers of the others. Results can still change through a Fixture's input: Skater fatigue carries from one Fixture to the next (ADR-010). |
| D-09 | Statistical realism targets live in `04-validation-targets.md` and are expressed as executable tests, not prose. |
| D-10 | Competition and playoff formats are declarative data, not code branches. Supporting another league means declaring a value, not editing the engine. |
| D-11 | Player identity and Player ability are separate concerns. Provenance is per attribute, stored parallel to the attributes so engine reads stay plain numbers. Real names with generated ability is a valid configuration. |

## Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| R-01 | The engine produces realistic aggregate scoring but distributes points evenly across a Roster, so Manager decisions feel weightless. | Point-distribution assertions are a first-class gate, not a nice-to-have. See `04-validation-targets.md` Tier 2 - now measured, after an estimated target of 3.0 for the forward tier ratio proved to be 4.4 and would have certified a distribution flatter than real hockey. |
| R-02 | Licensing: NHL club marks and the exclusive simulation licence held by EA make a monetised product using real club identity untenable. | D-05 / ADR-003. Real data stays local; a public build uses generated Rosters. No club logos at any point. |
| R-03 | Calibrating the engine turns into indefinite parameter fiddling with no completion criterion. | The realism suite defines done. Phase 0 ends when it is green, not when the engine feels right. |
| R-04 | Scope creep into interface work before the engine is validated, which is the standard failure mode for this genre. | Phase 0 has no web application in the workspace at all. |
| R-05 | Solo project stalls after a break because decisions were held in the author's head. | ADRs for every non-obvious decision; specification precedes implementation. |
| R-06 | Slovak Extraliga has no public API, so real non-NHL data needs scraping or manual seeding. | Out of Phase 0 entirely. Revisit when a Roster source beyond the generator is actually needed. |
| R-07 | An attribute estimator built on raw counting statistics mis-rates Players in a predictable direction: hit and block totals measure deployment and position on the ice rather than ability, so heavy fourth lines are overrated and elite defenders underrated. | Adjust for ice time, zone starts and teammate quality, or do not derive the attribute at all - mark it generated and say so. `checking`, `defPositioning` and `shotBlocking` are the affected attributes (ADR-008). |
| R-08 | Tracking data covers roughly 900 NHL Skaters. Prospects, minor leagues, juniors and Europe have none, and that is where drafting and call-ups live - so attribute quality falls off a cliff exactly where the genre gets its texture. | Provenance makes the cliff visible instead of hidden, and low confidence on unscouted Players is the intended experience rather than a defect. |

## Open questions

| ID | Question | Status | Blocks |
| --- | --- | --- | --- |
| OQ #1 | Standings point scheme - NHL 2-1-0 or 3-2-1-0? | **Resolved:** NHL 2-1-0 (FR-15). The Tier 2 standings targets are NHL-derived and only comparable under this scheme. | - |
| OQ #2 | Confirm the Tier 1 reference figures against a current season. | **Mostly resolved.** Goals, shots, shooting percentage, save percentage, power play, penalty kill, faceoffs and points percentage are now measured from the NHL 2025-26 season via `api.nhle.com`. Two remain estimates: penalties per Fixture (opportunities not exposed) and home win rate (no home-away split in the endpoint used). | `04-validation-targets.md` Tier 1 |
| OQ #3 | How many Clubs in the reference Competition? | **Resolved:** the real NHL 2026-27 structure - 32 Clubs, 4 divisions of 8, 84 games (FR-12, ADR-006). | - |
| OQ #4 | Playoff format. | **Resolved:** formats are declarative data and selectable at game start; the current NHL format is the only one implemented in Phase 0 (FR-16, ADR-007). | - |
| OQ #5 | Tier 2 carried four estimated rows. | **Resolved:** all Tier 2 rows are measured from NHL 2025-26. The forward tier ratio turned out to be 4.4, not the estimated 3.0 - outside the old band, and in the direction that would have hidden an R-01 failure. | - |
| OQ #6 | Penalties per Fixture and home win rate were estimates. | **Resolved.** Penalties derived from `ppOpportunities` at 2.88 per Club per Fixture, with a three-way identity that closes exactly. Home win rate measured at 50.5% from the final standings - the previous estimate of 54% ±3 excluded the real value. | - |
| OQ #7 | Ice-time distribution across Lines. | **Resolved and measured:** 19:34 for a tier-1 forward, 12:03 for tier-4, ratio 1.62 (FR-23). The important result is the decomposition - the 4.40 point ratio is 1.62 ice time times 2.71 points per minute, so two thirds of the gap must come from the shot model, not deployment. The earlier guess of 9-11 minutes for a fourth Line was also low. | - |
| OQ #8 | Playoff overtime differs from regular-season overtime. | **Resolved:** FR-09, FR-09a, FR-09b. Regular season is 5 minutes of 3-on-3 then a shootout; playoffs are repeated full 20-minute 5-on-5 periods with no shootout. | - |
| OQ #9 | Dressed Roster size, playoff series venue pattern, and when a Goalie is pulled. | **Resolved:** FR-20, FR-21, FR-22. Active Roster limits stay out until contracts exist in Phase 3. | - |
| OQ #10 | The rules for pulling the Goalie - deficit, time, power play - are a Tactics decision with no measured target yet - empty-net goals per Fixture would give one. | **Open.** Minor; affects late-Fixture scoring only. | FR-22 |
| OQ #12 | Can a Manager change a Lineup during a Match, at the intermissions? | **Resolved:** yes, after each regulation Period (FR-30). `simulateFixture` did not have to run in parts: the changes are part of its input (ADR-016). | - |
| OQ #11 | What share of regular-season overtimes end before the shootout, and how often a shootout attempt scores. The 3-on-3 and shootout constants have no measured target. | **Open.** Provisional constants, marked unmeasured in the engine. Measurable from NHL game results by decision type. | FR-09 |
