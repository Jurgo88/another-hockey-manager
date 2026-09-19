#!/usr/bin/env node
/**
 * Creates the Phase 0 and Phase 0.5 issues, idempotently.
 *
 * Existing issues are matched by exact title, so re-running does not create
 * duplicates. Dependencies are written into each body as "Blocked by #N"
 * after all issues exist, in a second pass.
 *
 * Run `setup-labels-milestones.mjs` first - labels and milestones must exist.
 *
 *   node scripts/github/create-phase-0-issues.mjs --dry-run
 *   node scripts/github/create-phase-0-issues.mjs
 */
import 'dotenv/config'
import { pathToFileURL } from 'node:url'
import { resolveGitHub } from './env.mjs'

const DRY_RUN = process.argv.includes('--dry-run')
const REQUEST_DELAY_MS = 500

export const PHASE_0 = 'Phase 0 - Engine'
export const PHASE_05 = 'Phase 0.5 - Real roster import'

/**
 * `key` is a stable local identifier used only for the dependency graph.
 * `blockedBy` lists keys, resolved to issue numbers in the second pass.
 */
export const ISSUES = [
  {
    key: 'roster-generator',
    title: 'feat(domain): generated roster provider',
    milestone: PHASE_0,
    labels: ['area: domain', 'type: feature', 'priority: high'],
    blockedBy: [],
    body: `Implement \`RosterProvider\` and \`GeneratedRosterProvider\` (D-05, ADR-003).

Nothing can be simulated without Players, so this is the first ticket.

## Scope

- \`RosterProvider\` interface: \`loadCompetition(id) => Promise<Club[]>\`
- Procedural generation of Skaters and Goalies with a controlled talent spread
- Name corpus, ages, handedness, preferred positions, potential
- Fills the NHL 2026-27 structure already in \`data/nhl-2026-27.ts\`
- Uniform \`generated\` provenance (ADR-008), via \`uniformProvenance\`

## Notes

Talent spread is not cosmetic. Tier 2 of \`.clauden/04-validation-targets.md\`
demands a league where a scoring leader reaches ~141 points and the median
regular sits near 30. The generator's distribution is the first place that can
fail, and it will be much harder to diagnose once the engine also exists.

Deterministic: generation takes an \`Rng\`, never \`Math.random()\` (D-02).

## Done when

- A full 32-Club Competition generates from a seed, reproducibly
- Attribute distributions across the generated league are asserted in tests
- Every Player carries provenance`,
  },
  {
    key: 'lineup',
    title: 'feat(engine): lineup construction and validation',
    milestone: PHASE_0,
    labels: ['area: engine', 'type: feature', 'priority: high'],
    blockedBy: ['roster-generator'],
    body: `Lineup validity rules plus a naive AI Manager that builds one.

## Scope

- Validation: exactly 18 Skaters and 2 Goalies dressed (FR-20), nobody in two
  units, legal positions, distinct starter and backup
- Special-teams units and the 3-on-3 overtime rotation (FR-09)
- A naive AI Lineup builder: sort by attribute, fill in order

## Notes

The AI must go through the same construction and validation path a human
Manager will use (D-04, ADR-004). There is no AI-specific shortcut and no
\`if (human)\` branch. This is the decision that keeps multiplayer a
configuration change later, and it also means every realism run exercises
Lineup validation thousands of times.

## Done when

- Invalid Lineups are rejected with a reason naming the rule
- The AI builder produces a valid Lineup for every generated Club`,
  },
  {
    key: 'shift-loop',
    title: 'feat(engine): shift loop, unit selection and ice-time budget',
    milestone: PHASE_0,
    labels: ['area: engine', 'type: feature', 'priority: high'],
    blockedBy: ['lineup'],
    body: `The outer simulation loop: match time advances by Shift, not by second.

## Scope

- Shift length from \`tactics.shiftLength\`, shortened by fatigue
- Unit selection per \`MatchupPolicy\`: \`none\`, \`exploit\`, \`shutdown\`
- Home-ice last change: the home Club selects knowing the away unit
- Fatigue accrual on ice and recovery on the bench, driven by \`stamina\`
- Emit \`shift_change\`

## Ice-time targets (FR-23)

Measured NHL 2025-26, forwards with 40+ appearances:

| Tier | Ice time per Fixture |
| --- | --- |
| Tier 1 (ice-time ranks 1-96) | 19:34, range 18:02-22:59 |
| Tier 4 (ranks 289-384) | 12:03, range 10:33-13:18 |
| Ratio | 1.62 |

## Two traps

**Home advantage must stay small.** Measured NHL home win rate is 50.5% - the
whole advantage is worth about one percentage point, and playoff evidence
shows no increase. If last change produces more than that, damp the mechanism
rather than compensating elsewhere.

**Do not close the point gap with ice time.** The 4.40 tier point ratio is
1.62 ice time times 2.71 points per minute. Deployment is measured and worth
only 1.62x. An engine that reaches 4.40 by playing its top Line 26 minutes has
the right statistic from the wrong mechanism.

## Done when

- Ice-time distribution across a simulated Season matches the table above
- Each matchup policy has a measurable, directionally correct effect`,
  },
  {
    key: 'possession',
    title: 'feat(engine): possession resolution and shot outcomes',
    milestone: PHASE_0,
    labels: ['area: engine', 'type: feature', 'priority: high'],
    blockedBy: ['shift-loop'],
    body: `The core of the engine. Possessions inside a Shift, resolved to events.

## Scope

- Faceoffs weighted by \`faceoffs\`, after every stoppage
- Possession from attacking unit strength against defending unit strength
- Outcomes: shot attempt, turnover (\`giveaway\` / \`takeaway\`), stoppage
- \`danger\` in 0-1 from shooter attributes, unit support, defensive pressure
- \`shotBlocking\` producing \`block\`
- Goalie resolution: \`positioning\` reduces effective danger, then \`reflexes\`
  resolves the remainder into \`goal\`, \`save\` or \`miss\`
- \`reboundControl\` deciding whether the puck stays live; a rebound resolves
  against \`recovery\` rather than \`positioning\`
- Assists credited from the unit on the ice, weighted by \`passing\` and
  \`offPositioning\`

## This is where 2.71 has to come from

Two thirds of the tier point gap is scoring rate, not ice time. A first-Line
forward must out-produce a fourth-Liner by 2.71 points per minute on the
strength of attributes and linemates alone. If Tier 2 fails while the
ice-time rows pass, the fault is here.

\`shotVolume\` must raise attempt count and lower mean \`danger\`, or it is the
same dial as aggression.

## Done when

- Goals, shots, shooting percentage and save percentage hit Tier 1 bands
- Shot events and their outcomes are internally consistent (Tier 4)`,
  },
  {
    key: 'penalties',
    title: 'feat(engine): penalties and special teams',
    milestone: PHASE_0,
    labels: ['area: engine', 'type: feature', 'priority: high'],
    blockedBy: ['possession'],
    body: `Penalties, the man advantage, and special-teams units.

## Scope

- Penalty probability from inverse \`discipline\`, raised by \`aggression\`
- A queue of active penalties per Club; skater counts derived from it, so
  5-on-3 falls out rather than being special-cased
- \`powerplay_start\` / \`powerplay_end\` with a reason
- Power-play and penalty-kill units from the Lineup take the ice

## Three linked targets that must hold together

| Metric | Target |
| --- | --- |
| Penalties committed per Club per Fixture | 2.88 |
| Power-play goals per Club per Fixture | 0.61 |
| Power-play time per Club per Fixture | 285 s |

They are not independent: \`2.879 x 0.2111 = 0.608\`, which closes exactly
against the measured value. Hitting one by accident is easy; hitting all three
means the penalty rate, the conversion rate and early termination are all
right at once.

Power-play time is the subtle one. Served in full, 2.88 minors would be 345
seconds. The measured 285 means power plays end on goals often enough to lose
a full minute per Fixture.

## Done when

- All three figures land inside their bands simultaneously
- Power-play time derived from event pairs equals penalty minutes served
- No \`powerplay_start\` without a matching \`powerplay_end\``,
  },
  {
    key: 'overtime',
    title: 'feat(engine): overtime, shootout and pulling the goalie',
    milestone: PHASE_0,
    labels: ['area: engine', 'type: feature', 'priority: medium'],
    blockedBy: ['penalties'],
    body: `Two different overtime regimes, and the empty net.

## Regular season (FR-09)

One five-minute sudden-death Period at **3-on-3**, then a shootout.
Three-on-three is a different game - far more open ice, far higher scoring
rate per minute - so the unit on the ice is the Lineup's overtime trio
rotation, not a Line and a Pairing.

## Playoffs (FR-09a)

Full **twenty-minute** sudden-death Periods at **5-on-5**, with intermissions,
repeated until a goal. **No shootout, ever.** A Fixture can run four or more
extra Periods, so fatigue accumulates far past anything the regular season
produces and must keep accruing the whole way.

The regime comes from the \`PlayoffFormat\` (FR-09b). \`allowsTie\` is not
enough information, and the two regimes must not share a code path that
assumes five minutes.

## Pulling the goalie (FR-22)

A trailing Club replaces its Goalie with an extra attacker, governed by
\`tactics.pullGoalie\` thresholds. This is the only source of \`emptyNet\`
goals. Never applies in playoff overtime, where a goal ends the Fixture.

## Done when

- Regular-season overtime resolves at 3-on-3 and falls through to a shootout
- Playoff overtime runs unbounded extra Periods with no shootout
- Empty-net goals appear at a plausible rate`,
  },
  {
    key: 'stats',
    title: 'feat(stats): folds over the event stream',
    milestone: PHASE_0,
    labels: ['area: stats', 'type: feature', 'priority: high'],
    blockedBy: ['possession'],
    body: `Box score, Player statistics and Club statistics, all derived.

## Scope

- Running score and box score
- Player Match and Season statistics
- Club Season statistics
- Time on ice per Player, from \`shift_change\` events

## Constraint

Everything is folded from the event stream and nothing else (D-03).
\`stats/\` may import from \`domain/\` only - importing from \`engine/\` breaks
the invariant and is the boundary that matters most in this repo.

Two sources of truth drift. If the play-by-play says one thing and the
statistics table says another, the Manager stops trusting the whole game, and
that class of bug stays invisible until somebody reads carefully.

## Done when

- Every Tier 4 consistency assertion passes
- Ice time computed from events matches the FR-23 targets`,
  },
  {
    key: 'consistency',
    title: 'test(sim): tier 4 internal consistency suite',
    milestone: PHASE_0,
    labels: ['area: stats', 'type: test', 'gate: realism'],
    blockedBy: ['stats'],
    body: `The cheap assertions that catch the bugs which erode trust.

From \`.clauden/04-validation-targets.md\` Tier 4:

- Derived goals equal the count of \`goal\` events
- Every \`goal\` follows a \`shot\` with \`result: 'goal'\` at the same clock
- Every \`save\` corresponds to a \`shot\` with \`result: 'save'\`
- Shots on goal equal goals plus saves; blocks and misses excluded
- Per-Player points sum to twice the goals plus assists, no orphan credits
- Power-play time from event pairs equals penalty minutes served
- No \`powerplay_start\` without a matching \`powerplay_end\`
- Clock is monotonically non-decreasing
- No Player in two units in the same \`shift_change\`
- Replaying any Fixture from its seed reproduces the stream exactly

## Why this comes before the realism tiers

These are the assertions that tell you the engine is coherent. Calibrating
aggregate rates on top of an incoherent event stream wastes the effort.`,
  },
  {
    key: 'standings',
    title: 'feat(engine): standings from played matches',
    milestone: PHASE_0,
    labels: ['area: engine', 'type: feature', 'priority: high'],
    blockedBy: ['stats'],
    body: `Fold played Matches into a standings table.

The schedule generator and the tiebreaking comparator already exist
(\`engine/schedule.ts\`, \`domain/standings.ts\`), so this ticket is the part
between them: turning event streams into \`StandingsRow\` values.

## Scope

- Points on the NHL scheme: 2 for a win, 1 for an overtime or shootout loss,
  0 for a regulation loss (FR-15)
- Regulation wins tracked separately, for the first tiebreaker
- Division, conference and league tables
- Playoff qualification fed into \`seedPlayoffs\`

## Done when

- A simulated Season produces a table whose best and worst Clubs land in the
  Tier 2 bands (124 and 59 points over 84 Fixtures)
- Points and games played reconcile against the Fixture list`,
  },
  {
    key: 'playoff-series',
    title: 'feat(engine): playoff series and bracket advancement',
    milestone: PHASE_0,
    labels: ['area: engine', 'type: feature', 'priority: medium'],
    blockedBy: ['standings', 'overtime'],
    body: `Play out a seeded bracket to a champion.

\`seedPlayoffs\` already builds the first round. This ticket advances it.

## Scope

- Series to \`winsPerRound\` wins, venues on the 2-2-1-1-1 pattern (FR-21)
- Round advancement: winners paired per the bracket shape, no reseeding for
  the NHL format
- Playoff overtime regime throughout (FR-09a)
- Round names: First Round, Division Final, Conference Final, Final

## Done when

- A bracket resolves from 16 Clubs to one champion
- Home games in a series follow 2-2-1-1-1 exactly
- No shootout appears anywhere in a playoff Fixture`,
  },
  {
    key: 'cli',
    title: 'feat(cli): simulate a season and print tables',
    milestone: PHASE_0,
    labels: ['area: cli', 'type: feature', 'priority: medium'],
    blockedBy: ['standings'],
    body: `The first way to actually look at the engine's output.

## Scope

- \`pnpm sim:season --seed <n>\`
- Print standings by division and conference, scoring leaders, goalie leaders
- Optional play-by-play for one Fixture
- Optional JSON dump for offline analysis

## Notes

This is the tool that will be used to eyeball results during calibration, so
readable output matters more than features. A table that is hard to scan slows
down every later ticket.`,
  },
  {
    key: 'tier1',
    title: 'test(sim): tier 1 aggregate realism suite',
    milestone: PHASE_0,
    labels: ['area: stats', 'type: test', 'gate: realism'],
    blockedBy: ['consistency', 'standings', 'penalties'],
    body: `Aggregate rates against measured NHL 2025-26 figures.

| Metric | Target | Band |
| --- | --- | --- |
| Goals per Fixture, both Clubs | 6.16 | ±0.30 |
| Shots on goal per Club | 27.8 | ±2.0 |
| Shooting percentage | 11.1% | ±1.0 pp |
| League save percentage | 0.889 | ±0.008 |
| Power-play success | 21.1% | ±2.5 pp |
| Penalty-kill success | 78.9% | ±2.5 pp |
| Faceoff win rate | 50.0% | ±0.5 pp |
| Penalties per Club per Fixture | 2.88 | ±0.15 |
| Power-play goals per Club | 0.61 | ±0.06 |
| Power-play time per Club | 285 s | ±20 s |
| Home win rate | 50.5% | ±1.5 pp |
| Mean Club points, 84 Fixtures | 94 | ±3 |

Also the club-to-club spread targets, which stop the engine from hitting every
league mean while making all 32 Clubs identical.

## Notes

Every figure here is measured, not estimated - and five of the original
estimates in the first draft of the spec turned out to be wrong, two of them
with bands that excluded the true value. A red band means calibrate the
engine, never widen the band.`,
  },
  {
    key: 'tier2',
    title: 'test(sim): tier 2 distribution realism suite',
    milestone: PHASE_0,
    labels: ['area: stats', 'type: test', 'gate: realism', 'priority: high'],
    blockedBy: ['tier1'],
    body: `**The gate that actually decides whether this is a simulation.**

Tier 1 is easy - an engine that flips a coin weighted by Club rating passes
most of it. Tier 2 is what separates a simulation from a random number
generator (R-01).

| Metric | Target | Band |
| --- | --- | --- |
| League scoring leader, points | 141 | ±25 |
| Fifth-highest scorer | 106 | ±20 |
| Median Skater with 40+ Fixtures | 30 | ±6 |
| Forward tier-1 to tier-4 point ratio | 4.4 | ±0.8 |
| Tier-1 ice time per Fixture | 19:34 | ±1:00 |
| Tier-4 ice time per Fixture | 12:03 | ±1:00 |
| Ice-time ratio | 1.62 | ±0.12 |
| Points-per-minute ratio | 2.71 | ±0.50 |
| Top-10 goalscorers' share of league goals | 5.7% | ±1.5 pp |
| Goalie save percentage spread (p90-p10) | 0.0335 | ±0.010 |
| Best / worst Club points over 84 | 124 / 59 | ±14 |

## The decomposition is the point

\`4.40 points = 1.62 ice time x 2.71 points per minute\`

Splitting the ratio makes a failure diagnosable. Ice-time rows passing and
points-per-minute failing means unit selection is right and the shot model is
too flat. Without the split, a red Tier 2 implicates every parameter at once.

The tier ratio is defined on league-wide rank tiers, not Lineup assignments -
see \`04-validation-targets.md\` for the exact definition, which the test must
replicate.`,
  },
  {
    key: 'tier3',
    title: 'test(sim): tier 3 - tactics are not placebos',
    milestone: PHASE_0,
    labels: ['area: engine', 'type: test', 'gate: realism'],
    blockedBy: ['tier2'],
    body: `Every Tactics dial must have a measurable, directionally correct effect.

Method: hold Rosters and seeds fixed, vary one dial, compare aggregates.

- \`aggression\` 25 to 75 raises shots for, shots against and penalties taken
- \`shotVolume\` 25 to 75 raises shot count and lowers mean shot \`danger\`
- \`shiftLength\` 25 to 75 reduces end-of-Fixture fatigue across the Roster
- \`matchup: exploit\` raises first-Line production against \`none\`
- \`matchup: shutdown\` lowers opposition first-Line production against \`none\`
- A Club fielding its best Lineup beats the same Club fielding its worst over
  1,000 Fixtures at above 65%

## Why this matters

A dial that does not move the statistics is a placebo, and a Manager will
work that out faster than expected. The last assertion is the blunt version of
the same question: do Lineup decisions matter at all?`,
  },
  {
    key: 'calibration',
    title: 'Calibrate engine parameters until tiers 1-3 are green',
    milestone: PHASE_0,
    labels: ['area: engine', 'type: calibration', 'priority: high'],
    blockedBy: ['tier3'],
    body: `The work of making the realism suite pass.

Expect this to take longer than any single feature ticket, and expect the time
to go into unit strength composition and the points-per-minute gap rather than
the shot model.

## Rules

- A red band means calibrate the engine, not widen the band
- A band moves only when a reference figure is shown to be wrong, and the
  change is recorded in \`04-validation-targets.md\` with a reason
- Determinism means a failure is always reproducible; there are no flakes to
  dismiss

## Done when

Tiers 1 through 4 are green. **That is the Phase 0 gate** - the phase ends
here, not when the engine subjectively feels right.`,
  },
  {
    key: 'roster-file',
    title: 'feat(domain): roster file format with import and export',
    milestone: PHASE_05,
    labels: ['area: domain', 'type: feature', 'priority: medium'],
    blockedBy: ['calibration'],
    body: `A documented roster file, importable and exportable (FR-19).

This is the mechanism by which real names become an action taken by the
Manager rather than a distribution decision taken by the project - the pattern
Eastside Hockey Manager itself arrived at, where the default database is
fictional and community databases carry the real names.

## Scope

- Versioned schema covering Clubs, Players, attributes and provenance
- Import: values arrive as \`source: 'rated'\`, outranking anything derived
- Export: so a Roster can be edited and shared outside the application
- Validation with useful errors on a malformed or outdated file

## Notes

Export is not optional. Without it there is no way for anyone to produce a
rated database, which is the whole point of the format.`,
  },
  {
    key: 'estimator',
    title: 'feat(domain): attribute estimator from public data',
    milestone: PHASE_05,
    labels: ['area: domain', 'type: feature', 'priority: medium'],
    blockedBy: ['roster-file'],
    body: `Turn public NHL data into attributes, honestly marked (ADR-008).

## What the data supports

| | Attributes | Source |
| --- | --- | --- |
| Measurable | \`speed\`, \`shooting\`, \`faceoffs\`, \`stamina\` | NHL EDGE top skating speed and shot velocity, published faceoff rates, skating distance |
| Inferable with deployment adjustment | \`passing\`, \`offPositioning\`, \`puckControl\`, \`discipline\` | Primary assists, expected goals, takeaway and giveaway rates, penalty minutes per 60 |
| Not reliably obtainable | \`checking\`, \`defPositioning\`, \`shotBlocking\` | Mark generated and say so |

## The trap (R-07)

Hit counts do not measure checking ability, they measure role and position on
the ice. A defender with sound positioning takes the puck and moves it and
never needs the hit, so high hit totals correlate with being *behind* the
play. Blocked shots partly measure how much a Club defends, which is to say
how bad it is. Separating a defenceman from his partner is a known unsolved
problem in hockey analytics.

An estimator built on raw counting statistics will overrate heavy fourth lines
and underrate elite defenders. Adjust for ice time, zone starts and teammate
quality, or do not derive the attribute at all.

## Coverage (R-08)

Tracking data covers roughly 900 NHL Skaters. Prospects, minor leagues,
juniors and Europe have none - and that is where drafting and call-ups live.
Those Players are generated, anchored to their level, with low confidence.
Provenance makes the cliff visible rather than hidden.

## Done when

Every attribute carries a source and a confidence, and no derived value is
presented as a fact.`,
  },
  {
    key: 'real-validation',
    title: 'test(sim): validate the estimator against a real season',
    milestone: PHASE_05,
    labels: ['area: stats', 'type: test', 'priority: high'],
    blockedBy: ['estimator'],
    body: `Import the real NHL, simulate it, compare to what happened.

## Why this only works now

With an unvalidated engine and estimated attributes, a wrong result has two
possible causes and neither can be isolated. Once the engine is trusted
against generated Rosters of known distribution, a bad result from real
Rosters points at the ratings - which makes this the actual test for the
estimator.

## Method

Import real Rosters for a completed Season, simulate it, and compare:

- Standings order and points spread against the real table
- Scoring leaders against the real leaderboard
- Goalie save percentages against the real figures

## Notes

This will not reproduce the real Season, and should not. Hockey has enormous
variance and one Season is one sample. The question is whether the right Clubs
are roughly in the right places and the right Players are near the top - not
whether the simulated champion matches.

## Done when

**Phase 0.5 gate:** simulated standings and scoring leaders are recognisably
close to the real Season, and every attribute carries a source and a
confidence rather than an unmarked guess.`,
  },
  {
    key: 'oq10',
    title: 'docs(spec): measure empty-net goals to set the goalie-pull threshold',
    milestone: PHASE_0,
    labels: ['area: spec', 'type: docs', 'priority: low'],
    blockedBy: [],
    body: `OQ #10. The deficit and time thresholds in \`tactics.pullGoalie\` have no
measured target. Empty-net goals per Fixture would give one.

Minor - affects late-Fixture scoring only, and does not block any engine work.`,
  },
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let env

async function gh(path, init = {}) {
  const response = await fetch(`${env.api}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status}: ${body}`)
  }

  return response.status === 204 ? null : response.json()
}

async function listAll(path) {
  const items = []
  for (let page = 1; ; page++) {
    const batch = await gh(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`)
    items.push(...batch)
    if (batch.length < 100) break
    await sleep(REQUEST_DELAY_MS)
  }
  return items
}

async function main() {
  env = resolveGitHub()
  console.log(
    `${DRY_RUN ? '[dry-run] ' : ''}${env.owner}/${env.repo}  (token from ${env.tokenSource})`,
  )

  const milestones = new Map(
    (await listAll('/milestones?state=all')).map((m) => [m.title, m.number]),
  )

  for (const title of new Set(ISSUES.map((i) => i.milestone))) {
    if (!milestones.has(title)) {
      console.error(`Milestone not found: "${title}". Run setup-labels-milestones.mjs first.`)
      process.exit(1)
    }
  }

  const existing = new Map(
    (await listAll('/issues?state=all')).filter((i) => !i.pull_request).map((i) => [i.title, i]),
  )

  // Pass 1 - create missing issues.
  const numbers = new Map()
  let created = 0

  for (const issue of ISSUES) {
    const found = existing.get(issue.title)

    if (found) {
      numbers.set(issue.key, found.number)
      console.log(`  = #${found.number} ${issue.title}`)
      continue
    }

    if (DRY_RUN) {
      console.log(`  + (dry-run) ${issue.title}`)
      created++
      continue
    }

    const result = await gh('/issues', {
      method: 'POST',
      body: JSON.stringify({
        title: issue.title,
        body: issue.body,
        labels: issue.labels,
        milestone: milestones.get(issue.milestone),
      }),
    })

    numbers.set(issue.key, result.number)
    console.log(`  + #${result.number} ${issue.title}`)
    created++
    await sleep(REQUEST_DELAY_MS)
  }

  // Pass 2 - append dependencies, now that every issue has a number.
  let linked = 0

  for (const issue of ISSUES) {
    if (issue.blockedBy.length === 0) continue

    const refs = issue.blockedBy.map((key) => numbers.get(key)).filter(Boolean)
    if (refs.length !== issue.blockedBy.length) continue

    const marker = '\n\n---\n\n**Blocked by:** '
    const line = marker + refs.map((n) => `#${n}`).join(', ')
    const number = numbers.get(issue.key)

    if (DRY_RUN) {
      console.log(`  ~ (dry-run) ${issue.title} blocked by ${refs.map((n) => `#${n}`).join(', ')}`)
      linked++
      continue
    }

    const current = await gh(`/issues/${number}`)
    if (current.body?.includes(marker.trim())) continue

    await gh(`/issues/${number}`, {
      method: 'PATCH',
      body: JSON.stringify({ body: (current.body ?? '') + line }),
    })

    console.log(`  ~ #${number} blocked by ${refs.map((n) => `#${n}`).join(', ')}`)
    linked++
    await sleep(REQUEST_DELAY_MS)
  }

  console.log(
    DRY_RUN
      ? `\nDry run complete. Would create ${created} issues and link ${linked}. No changes made.`
      : `\nDone. ${created} created, ${linked} linked.`,
  )
}

// Only run when executed directly, so the issue list can be imported by
// print-issue-plan.mjs without touching the network.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
