---
name: calibrate
description: Fit @ahm/sim's parameters to the realism and long-run targets of .clauden/04-validation-targets.md - run eight generated leagues and the NHL roster file over ten Seasons, patch parameters without editing source, read the gate report and find which mechanism moves a target. Use when a realism or long-run band is red, when a change to development, leaving, the draft, the generator or the engine needs refitting, or when asked why a league drifts over Seasons.
---

# Calibrating the simulation

A red band means calibrate, never widen the band (CLAUDE.md). Moving a target
to another gate, or changing what a target means, is the author's decision:
present options with a recommendation and wait.

## The loop

1. **State a hypothesis** with the mechanism: which parameter, why it moves
   which target, and what else it will move.
2. **Try it without editing source**, through `PATCH`. A fit takes about 85 s;
   a change under `packages/sim/src`, comments included, also throws away the
   test cache and the next `pnpm test` simulates again (about 95 s more).
3. **Read the report** against the bands, on the generated leagues and the
   roster file. A trial that helps one target and hurts three is not progress.
4. **Diagnose** with the scripts below when the report alone does not say why.
5. **Commit the winner in source**, with the reason in the doc comment of the
   constant ("THE VALUES ARE FITTED in #NN ..."), then run `pnpm test`.
6. **Record it in the spec** in its own `docs(spec)` commit: an amendment in the
   ADR that owns the parameter, and the result in `04-validation-targets.md`
   if a target changes.

Keep a table of trials in the conversation (parameter, value, what moved) so
nothing is tried twice.

## Commands

Run from the repo root. Runs land in `packages/sim/.cache/fit` (gitignored).

```sh
sh .claude/skills/calibrate/scripts/fit.sh             # 8 generated leagues, seeds 1-8
ROSTER=1 sh .claude/skills/calibrate/scripts/fit.sh    # and the NHL 2025-26 roster file
PATCH='{"draft/index.ts":{"SWAP":{"margin":2}}}' ROSTER=1 sh .claude/skills/calibrate/scripts/fit.sh
SEASONS=3 sh .claude/skills/calibrate/scripts/fit.sh   # shorter runs, for a quick look
OUT=packages/sim/.cache/fit-margin2 sh ...             # keep a trial's runs apart
```

`PATCH` is `{"<module under src>": {"<export>": {key: value}}}`, assigned onto
the exported object before the run. Only properties of exported objects can be
patched. An exported number such as `CLUB_WEIGHT` cannot: wrap it in an object
first, or edit the source for that trial.

Diagnostics, run in `packages/sim` on saved runs:

| Script                  | What it answers                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| `fit-report.mts <runs>` | The gate: ok or XX against each band, the reported targets, level by age, Tier 1 at a glance  |
| `levels.mts <runs>`     | Where the league's level goes: by Season and age band, drafted against generated, percentiles |
| `leaving.mts <runs>`    | Why Players leave, by age and ice-time third: retired, unsigned, released, rights expired     |
| `careers.mts [seed]`    | The shape of careers from development alone, no one leaving (`PATCH` works)                   |

```sh
cd packages/sim
npx tsx ../../.claude/skills/calibrate/scripts/levels.mts .cache/fit/seed-*.json
```

The full Tier 1 and Tier 2 suites on the tenth Seasons are
`pnpm --filter @ahm/sim test:longrun`; the report only glances at them.

## Reading the report

- The report's targets are copied from `04-validation-targets.md` and
  `packages/sim/test/support/gate.ts`. If those change, update
  `scripts/fit-report.mts` in the same change.
- Pooled figures over eight seeds are what the gate asserts; one seed is noise.
  Figures near a band edge move with any change to a stream, even a renamed fork.
- The roster file is one run and is asserted on its own. It is noisier.
- **Selection versus growth.** The level of the Rosters by age depends on who
  leaves, not only on development. Compare `careers.mts` (growth alone) with
  the report's "level" lines (growth and selection) before changing a curve.

## Lessons from #90 (Phase 2, ten Seasons)

What moved the targets:

- **Opening prospects** (four drafts held from the start). Without them the
  first four Seasons filled gaps with undrafted Players and the league aged.
- **The draft class ladders** (`DRAFT_CLASS.level`, `.room`, `goalieShift`)
  move the draft table and, through who gets pushed out, the age of the league.
- **The swap margin** (`SWAP.margin`): Clubs swapped for differences that
  development noise erases; a margin of 1 level settled turnover.
- **Club strength** (`CLUB_WEIGHT`) holds the table's correlation from Season
  to Season. A run converges without contracts; widening Club strength only
  moves the start.
- **The spread of an estimated curve** (`TOP_SPEED.spread`) sizes how far its
  attributes grow; at 0.75 mph `speed` and `stamina` grew eight points.

What did not, and was reverted:

- Less room at 18, larger curve spreads with a lower ladder, decline twice or
  three times as strong, no ice-time bonus, more young noise, a swap margin
  of 2.
- `ICE_TIME` spread 5 broke the unit test of a declining veteran.
  `LEFT_AFTER_A_DAY` 0.5 broke the first Season's Goalie save spread.
- Stronger fatigue (`FATIGUE_OFFENCE` 5, `LEFT_AFTER_A_DAY` 0.5) fixed the
  back-to-back cost but lowered shots and goals everywhere: 13 targets red.
  Fatigue must be fitted together with shot and goal rates (#109).

What the long run does by itself:

- The league's level rises about 1.3-1.6 above the generated league and then
  holds: the bottom of the Roster ratchets up once between Seasons 1 and 2,
  and stars accumulate at the top. Growth from the curves is not the driver.
- The Rosters' level keeps rising through 34+ by age: selection by role, since
  Players with a large role stay longer. Development alone holds the shape.
- The spread of points falls from about 18 to about 13 over ten Seasons. What
  holds Clubs apart in the NHL arrives with contracts in Phase 3.

## Rules that still apply

- D-08: a new random draw takes its own named fork of the stream. A new fork
  changes every downstream number, so expect near-edge targets to move.
- D-06: no attribute without an engine read site.
- `pnpm test`, every tier, green before a PR. See the `ship` skill.
