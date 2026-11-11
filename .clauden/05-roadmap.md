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
- Season advance, one day at a time from saved state (ADR-014)
- Playoffs, played as series after the regular Season
- Lineup changes at intermissions (ADR-016)
- AI Managers setting Lineups through the same API a human uses (D-04)

Architecture constraint carried from HermanTool: no client-to-database access.
All domain logic lives in Nitro server routes.

**Gate:** the author voluntarily plays 20 consecutive Fixtures because the
outcome is interesting - not while testing. If not, the problem is in the
engine or in the visibility of consequence, and it is fixed there. Adding
features is not the remedy.

**Gate result:** met on 2026-11-02. The author voluntarily played about 70
Fixtures of one Season, well past the 20 required.

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
  group; generated values, honestly marked, for the rest. The method is
  ADR-021: real Players ranked within position onto the generator's
  distribution, ice time as the anchor of a Player's level
- Provenance and confidence populated per attribute, per Player
- Generated Players for everyone outside the tracked population - prospects,
  minor leagues, juniors, Europe. The entry draft in Phase 2 reuses this for its
  draft classes.
- `potential` fixed and defined before the roster file freezes its meaning. The
  generator maps it linearly while attributes use a convex curve, so across 8
  seeds 21% of Players sit below their own best attribute, and 71% of those aged
  30 or more sit at least 1.5 above their mean attribute.
- `potential` estimated for real Players too, since Phase 2 development reads
  it, and age taken from the date of birth

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

**Gate result:** met on 2026-11-03 in #18, as measured thresholds in
`04-validation-targets.md`. Over ten Seasons on the estimated 2025-26 Rosters,
Club points rank at 0.67 against the real table, 13 of the real top 20 scorers
finish in the simulated top 30, and Goalies' save percentage ranks at 0.88;
after the naive Lineup learned second positions (#81), 0.72, 15 and 0.85.
Every attribute carries a source and a confidence.

## Phase 2 - Multiple Seasons

This is where it becomes a manager rather than a season simulator. Runs after
the Phase 0.5 gate, which the author confirmed on 2026-11-02.

The simulation comes first, up to the gate, and the web application after it:

1. Measured targets and ADRs for the choices below
2. A realistic age profile in the generator
3. Moving from one Season to the next
4. Season history and Player career records
5. Ageing and development against `potential`
6. Retirement and leaving the league
7. Entry draft
8. Long-run realism suite and calibration
9. Web: continuing a career across Seasons
10. Web: draft and notices
11. Web: Season history and Player careers

Choices made by the author on 2026-11-02, each to be recorded in an ADR under
item 1:

- **Development** follows age curves by attribute group, capped by `potential`,
  with a small bonus for ice time played. It changes attributes directly, so
  imported Rosters develop the same way as generated ones.
- **Leaving the league** depends on age, level and pressure on the Roster. A
  Club keeps its shape, and the weakest at a position leave when new Players
  arrive. An assistant coach decides by default, and a Manager can overrule it.
- **The draft** gives a Club the rights to a prospect, who develops off the
  Roster and joins when ready. Undrafted Players fill remaining gaps. The number
  of rounds, 4 to begin with, and the lottery are data (D-10). A Manager makes
  their own picks through the call an AI Manager uses (D-04).
- **Form across a Season** waits until after the gate, as its own task. It
  changes play, so it would move Tier 2 during the long-run calibration.

**Gate:** a ten-Season run produces a plausible league history - no runaway
dynasty, no collapse into uniformity, career arcs that read like careers. Item 1
turns this into measured targets, and Tier 1 and Tier 2 must hold in late
Seasons as well as the first. Done in #83: the targets are the Phase 2 gate in
`04-validation-targets.md`, measured in `07-league-over-time.md`, and the choices
are ADR-022 (development), ADR-023 (leaving) and ADR-024 (draft). On 2026-11-03
the author added: a prospect is ready when his level reaches the weakest at his
position on the Club, rights last 4 seasons, and each attribute group follows
its own measured curve.

Item 3 is done in #85: `nextSeason` moves a run from one Season to the next
(ADR-014 amendment), and `pnpm sim:season --seasons <n>` plays several in a row.
Before it, absences became return dates (#97, ADR-012 amendment), so that a
summer heals as a Season's days do.

Item 4 is done in #86: a finished Season is a record kept beside the state
(ADR-025), from which a Club's history and a Player's career are read;
`--club` and `--player` print them.

Item 5 is done in #87: between Seasons `develop` moves every Player's attributes
along the curve of each group, and a developed value loses confidence and counts
its Seasons of ageing (ADR-022). On 2026-11-06 the author moved growth later
(ADR-026): speed grows to 29, skill to 29, reading the game to 32, Goalies
included, and `potential` caps the level rather than each attribute. The spread
of each measure across the league, the noise and the ice-time bonus are
estimates in `src/develop/`, sized by the long-run calibration in item 8, which
also builds a backtest on real Players from 2021-22 to 2025-26.

Item 6 is done in #88: between Seasons a Player retires by age, or goes
unsigned when his role was small, and each Club fills its gaps with undrafted
Players (ADR-027). Unsigned stands in for contracts until Phase 3. Release,
where the weakest leaves when a prospect arrives and a Manager can overrule the
assistant, moved to the draft in #89, together with the phase between Seasons
in which Managers decide.

Item 7 is done in #89: between Seasons there is a phase of its own, the
`Offseason`, with a draft window and a Roster window in which any Manager
declares picks, call-ups and releases, and the assistant decides what is left
undeclared (ADR-028). The draft format and the NHL lottery are data. A class is
laid out on fixed ladders of level and room, and until 23 a Player's development
draw is larger and his `potential` moves with it, which is what makes a round
uncertain. A prospect joins when he reaches the weakest at his natural position,
who is then released. The draft table of the gate holds on three generated
leagues and on the 2025-26 roster file. The mean age of the tenth Season falls
from 29.6 to about 27.2, but with too many Players aged 31 or more and 23 or
younger; item 8 sets the age profile.

## Phase 3 - Roster movement

Deferred this far deliberately: a transfer economy is the hardest thing in the
genre to balance, and an open bidding market inflates without fail.

- Contracts, wages, a salary cap
- Transfers and free agency
- Club budget
- Scouting, which is where `potential` finally becomes visible and uncertain

**Gate:** ten simulated Seasons of AI-only transfer activity leave wage
inflation and talent distribution inside defined bounds, and the table targets
deferred from the Phase 2 gate hold: no Club in the top 8 more than 9 of 10
Seasons, at least 5 Clubs finishing first, and a spread of points of 16.1 ±3 in
the tenth Season. So do the tenth Season's highest Club penalties, scoring leader
and forward tier-1 to tier-4 points-per-minute ratio (`04-validation-targets.md`).

## Phase 4 - Other Managers

- Seasonal cohort leagues, six to eight weeks, not a persistent world
- Inactive Manager handling
- Fixture scheduling in real time

Given D-04, this is substantially a configuration change plus lobby and
scheduling work.

**Gate:** a cohort completes a full Season with at least eight human Managers
and no manual intervention.

## What is deliberately absent

Rink visualisation, a real-time server, mobile applications, club finances
beyond wages, stadium management, merchandising, board confidence, press
conferences. Each is a legitimate feature of the genre and none of them makes
a bad engine good.
