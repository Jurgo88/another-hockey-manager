# 03 - Simulation Engine

## Entry point

```ts
function simulateFixture(input: FixtureInput, seed: number): MatchEvent[]
```

Pure (D-01). No I/O, no clock reads, no ambient state, no module-level
mutation. The same pair of arguments always yields the same array (FR-02).

A Season forks one stream per Fixture from the Season seed (D-08):

```ts
const rng = seasonRng.fork(`fixture:${fixture.id}`)
```

This matters because it makes Fixtures independent: re-scheduling, adding a
Club, or replaying a single Fixture does not perturb the rest of the Season.

## Why not second-by-second

Simulating 3,600 ticks per Fixture buys nothing. The decisions a Manager makes
are expressed at the granularity of a Shift and a possession, so that is the
granularity the engine models. It is roughly two orders of magnitude cheaper,
which is what makes a 10,000-fixture realism suite practical (NFR-03).

## Two-level loop

### Level 1 - Shift loop

The match clock advances by Shift. A Shift is about 45 seconds of ice time at
`shiftLength = 50`, scaled by the dial and shortened when the unit on the ice
is fatigued.

### Ice-time budget, and the decomposition that matters most

Measured NHL 2025-26 deployment for forwards with 40 or more appearances
(411 of them), ranked by ice time:

| Tier | Ice time per Fixture |
| --- | --- |
| Ranks 1-96 - the first Lines | 19:34 mean, 18:02 to 22:59 |
| Ranks 289-384 - the fourth Lines | 12:03 mean, 10:33 to 13:18 |

The ratio is **1.62**. The measured point ratio between the same two tiers is
**4.40**. Dividing one by the other gives the number this engine has to
produce on its own:

```
point ratio        4.40
------------  =  --------  =  2.71  points per minute, tier 1 over tier 4
TOI ratio          1.62
```

**Only a third of the scoring gap comes from ice time.** The remaining 2.71x
has to come out of the possession and shot model - better attributes, and
better linemates to play them with.

This is the single most useful constraint in the specification, because it
splits a hard question into two checkable ones. If the engine deploys first
Lines for 19:34 and fourth Lines for 12:03 and still misses the 4.40 point
ratio, then unit selection is right and the shot model is too flat. Without
the split, a failing Tier 2 says only "the distribution is wrong" and every
parameter looks equally guilty.

The corollary is a trap to avoid: the gap must NOT be closed by handing first
Lines more ice time. Ice time is measured and is only worth 1.62x. An engine
that hits 4.40 by deploying its top Line for 26 minutes has produced the right
statistic from the wrong mechanism, and it will feel wrong to anyone who reads
a box score.

Per Shift:

1. **Unit selection.** Each Club's `matchup` policy picks the next unit. With
   `none`, units roll in declared order. With `exploit` or `shutdown`, the
   home Club selects with knowledge of the away unit already committed (the
   home-ice last-change advantage), and the away Club selects blind. This is
   where home advantage is generated structurally rather than bolted on as a
   flat bonus.

   **The effect must be small.** Measured NHL home win rate is 50.5%, so the
   whole home advantage is worth about one percentage point - the NHL is the
   outlier sport where home ice barely matters, and playoff evidence shows no
   increase. If the last-change advantage produces a materially larger edge
   than that, the mechanism is overweighted and needs damping, not
   compensating elsewhere. See `04-validation-targets.md`.
2. **Strength check.** If a man advantage is active, the appropriate special
   teams `Unit` replaces the even-strength selection.
3. **Possession sequence.** Level 2 runs.
4. **Fatigue.** Each Player on the ice accrues fatigue inversely to `stamina`;
   Players on the bench recover.
5. Emit `shift_change`.

### Level 2 - Possession resolution

A Shift contains a small number of possessions (typically 2-5, drawn from the
pace of the two units on the ice).

Per possession:

1. **Who has the puck.** Derived from the offensive strength of one unit
   against the defensive strength of the other. The first possession after a
   stoppage is decided by a faceoff between the two centres, weighted by
   `faceoffs`.
2. **Outcome.** One of:
   - **Shot attempt** - probability driven by `offPositioning`, `passing`,
     `puckControl` against `defPositioning`, and scaled by `shotVolume`.
   - **Turnover** - `giveaway` (attacker's `puckControl` failing) or
     `takeaway` (defender's `checking` succeeding).
   - **Penalty** - probability driven by the inverse of `discipline` and
     raised by `aggression`.
   - **Stoppage** - icing, offside, whistle. Resets to a faceoff.
3. **Shot resolution**, when a shot attempt occurred:
   - Compute `danger` in [0, 1] from shooter attributes, unit support, and
     defensive pressure. `shotVolume` raises attempt count but lowers mean
     danger, so the two dials are not the same dial.
   - `shotBlocking` of the defending unit may produce `block`.
   - Otherwise resolve against the Goalie: `positioning` reduces effective
     danger first, then `reflexes` resolves what remains, giving `goal`,
     `save` or `miss`.
   - On a `save`, `reboundControl` decides whether the puck stays live. A
     live puck grants one rebound attempt at elevated danger, resolved
     against `recovery` rather than `positioning` - the goalie is moving.
4. **Assists.** On a goal, up to two assists are credited from the unit on the
   ice, weighted by `passing` and `offPositioning`.

## Man advantage

Overlapping penalties are handled by tracking a queue of active penalties per
Club and deriving skater counts from it, rather than by special-casing 5-on-3.
At most two penalties per Club run at once; a third waits in the queue and
starts when one ends. Penalties continue across Period breaks.

`powerplay_start` and `powerplay_end` bracket a numerical advantage, not a
penalty (ADR-009). Each Skater of advantage gained emits a start; each one lost
emits an end with the reason - `expired`, `goal`, `penalty` (the advantaged
Club was penalised in turn) or `period_end` (the Fixture ended). A 5-on-3 is
two nested pairs; 4-on-4 is none.

A power-play goal ends the shorthanded Club's minor with the least time left,
or the first half of a double minor. Majors run their full five minutes.

Any change in skater counts ends the Shift: the special-teams `Unit` takes the
ice at once, and even-strength units return the moment the advantage ends.

## Overtime

Regular season and playoffs use **different formats**, and the difference is
not cosmetic.

**Regular season.** One five-minute sudden-death Period at 3-on-3. If still
level, a shootout. Three-on-three changes the possession model materially -
far more open ice, far higher scoring rate per minute - so the unit on the ice
is three Skaters, not a Line and a Pairing, and the `Lineup` must supply an
overtime rotation rather than reusing even-strength units.

**Playoffs.** Full twenty-minute sudden-death Periods at 5-on-5, with normal
intermissions, repeated until somebody scores. **No shootout ever.** A playoff
Fixture can run to four or more extra Periods, which means fatigue accumulates
far past anything the regular season produces, and the goalie models keep
running the whole way.

A `PlayoffFormat` therefore implies its overtime rules; `fixture.allowsTie`
alone is not enough information. The engine must be told which overtime regime
applies, and the two must not share a code path that assumes five minutes.

Shootout attempts resolve shooter `shooting` and `puckControl` against goalie
`reflexes` and `positioning`, and are emitted as `shot` events in Period `SO`.

## Pulling the goalie

A trailing Club replaces its Goalie with an extra attacker late in a Fixture.
This is a Manager decision with a threshold - how far behind, and how early -
and it is the only source of `emptyNet` goals, which are a real and
non-trivial share of league scoring. It raises the trailing Club's scoring
rate and the leading Club's much more.

Never applies in playoff overtime, where a goal ends the Fixture and there is
nothing to chase.

## Output contract

The engine returns events only (D-03). It never returns a score, a box score,
or a statistics object. `src/stats` folds the stream into:

- Match box score and running score
- Player match and Season statistics
- Club Season statistics
- Standings

Two sources of truth drift. If the play-by-play says one thing and the
statistics table says another, the Manager loses trust in the whole game, and
that class of bug is invisible in testing until someone reads carefully. A
single derivation path makes the class impossible.

## Event schema

See `packages/sim/src/domain/event.ts`, which is the authoritative definition.
Event types: `period_start`, `period_end`, `faceoff`, `shift_change`, `shot`,
`goal`, `save`, `turnover`, `penalty`, `powerplay_start`, `powerplay_end`.

Every event carries `clock` (elapsed seconds), `period`, and `strength`.

## Module layout

```
packages/sim/src/
  domain/     entities, attributes, event schema - types, no behaviour
  rng/        mulberry32, fork, uniform helpers
  engine/     shift loop, possession resolution, penalties, overtime
  stats/      folds over the event stream
  cli/        simulate a Season, print tables
```

`domain/` must not import from `engine/`. `stats/` must not import from
`engine/` - it consumes only the event stream, which is what guarantees the
derivation path is genuinely single.
