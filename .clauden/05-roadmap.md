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

**Gate:** all four tiers in `04-validation-targets.md` are green.

Tier 2 is the one that will take the time. Expect to iterate on unit strength
composition and ice-time distribution rather than on the shot model.

## Phase 1 - One Club, one Season, playable

Adds `apps/web` (Nuxt) and Supabase. Schema is designed after Phase 0, when
the shape of the data the engine actually produces is known rather than
guessed.

- Authentication, Manager account, Club selection
- Roster and Player views
- Lineup editor: Lines, Pairings, special teams, Tactics
- Fixture list, play-by-play reader, box score
- Standings, scoring leaders
- Season advance
- AI Managers setting Lineups through the same API a human uses (D-04)

Architecture constraint carried from HermanTool: no client-to-database access.
All domain logic lives in Nitro server routes.

**Gate:** the author voluntarily plays 20 consecutive Fixtures because the
outcome is interesting - not while testing. If not, the problem is in the
engine or in the visibility of consequence, and it is fixed there. Adding
features is not the remedy.

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
