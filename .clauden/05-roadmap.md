# 05 - Roadmap

Each phase has a gate. A gate is an objective condition, not a feeling.
Nothing from a later phase is built while an earlier gate is red (R-04).

## Phase 0 - Engine

No web application, no database, no authentication. `packages/sim` only.

1. Domain model and event schema
2. Deterministic RNG with per-Fixture forking
3. Shift loop and unit selection, including matchup policies
4. Possession resolution and shot outcomes
5. Penalties and special teams
6. Overtime and shootout
7. Statistics folds over the event stream
8. Season scheduling and standings
9. CLI: simulate a Season, print standings and scoring leaders
10. Realism suite
11. Calendar and fatigue carried between Fixtures (ADR-010)
12. Goalie rotation across a Season
13. Injuries and Roster replacement
14. Calibration

**Gate:** all four tiers in `04-validation-targets.md` are green.

Items 11-13 change how often Players appear and how good they are on the day,
so they land before calibration, which would otherwise have to run twice.

Tier 2 is the one that will take the time. Expect to iterate on unit strength
composition and ice-time distribution rather than on the shot model.

## Phase 1 - One Club, one Season, playable

Plays on generated Rosters. Adds `apps/web` (Nuxt) and Supabase. Schema is designed after Phase 0, when
the shape of the data the engine actually produces is known rather than
guessed.

- Authentication, Manager account, Club selection
- Roster and Player views
- Lineup editor: Lines, Pairings, special teams, Tactics
- Fixture list, play-by-play reader, box score
- Standings, scoring leaders
- Season advance
- Decide OQ #12: Lineup changes at intermissions
- AI Managers setting Lineups through the same API a human uses (D-04)

Architecture constraint carried from HermanTool: no client-to-database access.
All domain logic lives in Nitro server routes.

**Gate:** the author voluntarily plays 20 consecutive Fixtures because the
outcome is interesting - not while testing. If not, the problem is in the
engine or in the visibility of consequence, and it is fixed there. Adding
features is not the remedy.

## Phase 0.5 - Real roster import

A separate phase because it is a separate modelling project, not a ticket.
Runs after Phase 1. It was planned before Phase 1, and the author moved it on
2026-10-31: the game plays on generated Rosters, and D-05 means real ones can be
added later without touching the engine, so it should not delay the first
playable version.

- Roster file format, with import and export (ADR-003 amendment)
- Attribute estimator from public data (ADR-008): NHL EDGE tracking for
  `speed`, `shooting`, `stamina`; published rates for `faceoffs` and
  `discipline`; deployment-adjusted performance statistics for the inferable
  group; generated values, honestly marked, for the rest
- Provenance and confidence populated per attribute, per Player
- Generated Players for everyone outside the tracked population - prospects,
  minor leagues, juniors, Europe

**Why it comes after Phase 0, and not before.** The engine is calibrated
against distributions, and a generator gives exact control over the
distribution it is fed. Feed real estimated attributes into an unvalidated
engine and a wrong result has two possible causes - a bad engine or bad
ratings - with no way to tell them apart. Two unknowns, one equation.

**The payoff.** Once the engine is trusted,
importing real Rosters becomes the test for the estimator: import the real
NHL, simulate the Season, and check whether the standings and the scoring race
resemble what actually happened. That validation loop only exists in this
order. It is not caution about sequencing - it is the only sequence in which
either piece can be verified at all.

**Gate:** a simulated Season from imported real Rosters produces standings and
a scoring leaderboard recognisably close to the real Season, and every
attribute carries a source and a confidence rather than an unmarked guess.

## Phase 2 - Multiple Seasons

This is where it becomes a manager rather than a season simulator.

- Ageing and development against `potential`
- Retirement
- Entry draft
- Season history and Player career records
- Form across a Season

**Gate:** a ten-Season run produces a plausible league history - no runaway
dynasty, no collapse into uniformity, career arcs that read like careers.

## Phase 3 - Roster movement

Deferred this far deliberately: a transfer economy is the hardest thing in the
genre to balance, and an open bidding market inflates without fail.

- Contracts, wages, a salary cap
- Transfers and free agency
- Club budget
- Scouting, which is where `potential` finally becomes visible and uncertain

**Gate:** ten simulated Seasons of AI-only transfer activity leave wage
inflation and talent distribution inside defined bounds.

## Phase 4 - Other Managers

- Seasonal cohort leagues, six to eight weeks, not a persistent world
- Inactive Manager handling
- Fixture scheduling in real time

Given D-04, this is substantially a configuration change plus lobby and
scheduling work.

**Gate:** a cohort completes a full Season with at least eight human Managers
and no manual intervention.

## What is deliberately absent

Rink visualisation, real-time coaching, mobile applications, club finances
beyond wages, stadium management, merchandising, board confidence, press
conferences. Each is a legitimate feature of the genre and none of them makes
a bad engine good.
