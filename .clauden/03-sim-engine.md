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

Per Shift:

1. **Unit selection.** Each Club's `matchup` policy picks the next unit. With
   `none`, units roll in declared order. With `exploit` or `shutdown`, the
   home Club selects with knowledge of the away unit already committed (the
   home-ice last-change advantage), and the away Club selects blind. This is
   where home advantage is generated structurally rather than bolted on as a
   flat bonus.
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

A `penalty` event emits `powerplay_start` with the skater counts. The
advantage ends on expiry, on a power-play goal, or at period end, each emitting
`powerplay_end` with the reason. Overlapping penalties are handled by tracking
a queue of active penalties per Club and deriving skater counts from it, rather
than by special-casing 5-on-3.

## Overtime and shootout

When `fixture.allowsTie` is false and the score is level after three periods,
a sudden-death overtime Period runs with reduced skater counts, then a
shootout. Shootout attempts resolve shooter `shooting` and `puckControl`
against goalie `reflexes` and `positioning`, and are emitted as `shot` events
in Period `SO`.

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
