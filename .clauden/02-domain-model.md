# 02 - Domain Model

## Vocabulary (D-07)

Hockey has an awkward collision: "game" means both a match and the product.
The vocabulary below resolves it and is enforced, not merely recommended.

| Term | Meaning |
| --- | --- |
| `Club` | The organisation. Owns a Roster, is managed by a Manager. |
| `Manager` | Whoever makes decisions for a Club - human or AI (D-04). |
| `Player` | A contracted individual. Always either a `Skater` or a `Goalie`. |
| `Skater` | A Player who plays out. Twelve attributes. |
| `Goalie` | A Player in net. Five attributes, a deliberately separate model. |
| `Roster` | The set of Players contracted to a Club. |
| `Lineup` | A Club's declared configuration for one Fixture. |
| `Line` | A forward unit of three: LW, C, RW. |
| `Pairing` | A defensive unit of two: LD, RD. |
| `Unit` | A special-teams formation - an ordered list of Skaters: five on a power play, four on a penalty kill (ADR-009). |
| `Tactics` | Manager-set dials that shape how a Lineup plays. |
| `Fixture` | A scheduled match, an entry in the schedule. |
| `Match` | A played Fixture: its seed plus its event stream. |
| `Shift` | One stretch of ice time for one unit. The engine's time quantum. |
| `Period` | 1, 2, 3, OT, or SO. |
| `Event` | One atomic entry in a Match's event stream. |
| `Competition` | A structured set of Fixtures: regular season plus playoff. |
| `Season` | One cycle of Competitions, after which Players age and develop. |

### Banned identifiers

| Banned | Use instead | Reason |
| --- | --- | --- |
| `Team` | `Club`, or the specific unit (`Line`, `Pairing`, `Unit`) | Ambiguous between the organisation and who is on the ice. |
| `Game` | `Fixture` (scheduled) or `Match` (played) | Collides with the product itself. |
| `User` | `Manager` | A Manager may be AI; "user" implies a human and invites an `if (human)` branch. |
| `Squad` | `Roster` | Redundant synonym; one word per concept. |

A lint rule enforces this. Violations fail CI.

## Entities

```
Competition ──< Fixture >── Club ──< Player (Skater | Goalie)
                   │           │
                   │           └──< Manager (isAi)
                   │
                   └── Match ──< MatchEvent
                            (seed)
```

A `Lineup` is not an entity in its own right at Phase 0 - it is an input value
supplied per Fixture. It becomes persistent in Phase 1.

## Player attributes

All attributes are integers 1-20, following the EHM convention: 1 is
beer-league, 10 is replacement-level professional, 20 is generational.

The set is deliberately small. Rule D-06: an attribute exists only if
`src/engine` reads it. An attribute with no effect on a Match is noise in the
interface and a lie to the Manager. Eleven plus five is enough to make
decisions matter; the set is extensible, but each addition ships together with
its read site.

`strength` was removed under D-06: no public data source, and its intended
effect overlapped almost entirely with `checking` and `puckControl`. It can
return if board battles become a distinct engine step.

### Skater (11)

| Group | Attribute | Meaning |
| --- | --- | --- |
| Offensive | `shooting` | Accuracy and power releasing the puck at the net. |
| | `passing` | Completing intended passes under pressure. |
| | `puckControl` | Retaining the puck while carrying and protecting it. |
| | `offPositioning` | Finding and occupying dangerous ice without the puck. |
| Defensive | `checking` | Separating an opponent from the puck. |
| | `defPositioning` | Reading play and denying lanes in the defensive zone. |
| | `shotBlocking` | Getting into shot lanes and absorbing pucks. |
| | `faceoffs` | Winning draws. Only meaningful for centres. |
| Physical | `speed` | Acceleration and top speed. |
| | `stamina` | How slowly fatigue accrues and how fast it clears. |
| Mental | `discipline` | Inverse of penalty propensity. |

### Goalie (5)

| Attribute | Meaning |
| --- | --- |
| `reflexes` | Reaction on pucks not read early. |
| `positioning` | Being in the right place, so reflexes are needed less. |
| `reboundControl` | Killing second chances. |
| `recovery` | Getting back into a stance after the first save of a sequence. |
| `puckHandling` | Handling and distributing to start a breakout. |

### Shared meta fields

`age`, `potential` (1-20 ceiling of the Player's level, never shown raw -
scouting derives from it; the level is the mean of a Skater's attributes without
`faceoffs` and `discipline`, or of all five for a Goalie, ADR-020),
`handedness`, `preferredPositions[]` (Skater only, first entry is natural),
Rosters hold 16 forwards, 10 defencemen and 3 Goalies, the last of the depth
standing in for call-ups (ADR-012).

`form` (0-100, short-term deviation, resets each Season), `fatigue` (0-100,
Skaters only in effect: rises within a Match and falls between Fixtures,
ADR-010).

`contract` (ADR-030): its cap hit as a share of the cap, Seasons left with this
one counted, `entry-level` or `standard`, and `restricted` or `unrestricted`
when it runs out. Every Player on a Roster holds one; a prospect holds only his
rights. The engine does not read it, so it is no attribute (D-06). The rules a
contract is made to are `CapRules`, data in a `SeasonFormat` (D-10).

### Attribute provenance (ADR-008)

Each attribute value is accompanied by a record saying where it came from and
how much to trust it. Provenance sits in a record **parallel** to the
attributes, so `attributes.speed` stays a plain number that the engine can
read without touching metadata.

| Source | Meaning | Default confidence |
| --- | --- | --- |
| `measured` | From tracking data - NHL EDGE speed and shot velocity, published faceoff rates | 0.95 |
| `rated` | Set by hand, by a community database or the author. Outranks `derived` | 0.80 |
| `derived` | Inferred from performance statistics by the estimator | 0.50 |
| `generated` | Procedural, anchored to the Player's level | 0.25 |

Confidence is per attribute, not per Player, because the real situation is
that one Player's `speed` can be radar-measured while his `checking` is a
guess. An estimator may lower its own figure for a specific attribute.

`observedRange(value, confidence)` turns a value and its confidence into the
band a Manager is shown. This is the scouting system: scouting narrows the
band rather than existing as a separate mechanic. A Roster with no provenance
is treated as uniformly generated.

## Tactics

| Dial | Range | Effect |
| --- | --- | --- |
| `aggression` | 0-100 | Trades defensive structure for offensive pressure. Raises both shot generation and shots allowed, and raises penalty rate. |
| `shotVolume` | 0-100 | Higher means more attempts from distance and fewer forced plays: more shots, lower average danger. |
| `goalieRotation` | rule | When the backup starts: whoever played yesterday sits, and a limit on starts running (ADR-011). |
| `shiftLength` | 0-100 | Higher means shorter shifts - less fatigue, but the Matchup policy gets less traction. |
| `matchup` | enum | `none`, `exploit` (top Line against weakest Pairing), `shutdown` (best defensive unit against their top Line). A Shift it sends a unit out for costs extra fatigue (ADR-013). |

Every dial must be observable in the statistics, or it is a placebo. This is
asserted in `04-validation-targets.md`.
