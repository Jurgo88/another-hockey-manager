# ADR-008 - Attributes carry provenance and confidence

- **Status:** Accepted
- **Date:** 2026-09-18
- **Relates to:** D-06, D-11, ADR-003, R-07
- **Extends:** ADR-003

## Context

The goal is real Player names *and* ability grounded in genuinely findable
data, while keeping fictional Players possible. An earlier reading of the
problem treated these as competing options requiring a switch. They are not.

What public data actually supports, attribute by attribute:

| | Attributes | Source |
| --- | --- | --- |
| **Measurable** | `speed`, `shooting`, `faceoffs`, `stamina` | NHL EDGE publishes per-Player top skating speed in mph, speed bursts over 20 and 22 mph, shot velocity, and skating distance. Faceoff rate is published directly. |
| **Inferable with deployment adjustment** | `passing`, `offPositioning`, `puckControl`, `discipline` | Primary assists, expected goals, takeaway and giveaway rates, penalty minutes per 60 - each requiring adjustment for ice time, zone starts and teammate quality. |
| **Not reliably obtainable** | `checking`, `defPositioning`, `shotBlocking` | Proxies exist and are traps. See below. |

The trap is worth stating precisely, because the intuition that "you can look
up who has what checking" fails exactly here. Hit counts do not measure
checking ability; they measure role and position on the ice. A defender with
sound positioning takes the puck and moves it, and never needs the hit - so
high hit totals correlate with being *behind* the play. Blocked shots
partly measure how much a Club defends, which is to say how bad it is.
Separating a defenceman's defensive contribution from his partner's is a known
unsolved problem in hockey analytics, since pairs play almost all their minutes
together. An estimator built on raw counting stats will systematically
overrate heavy fourth lines and underrate elite defenders.

There is also a coverage cliff. NHL EDGE covers NHL Players - roughly 900
Skaters. A manager game needs prospects, minor leagues, juniors and Europe:
thousands of Players with no tracking data at all, and that is exactly where
the texture of the genre lives, in drafting and call-ups.

So the honest position is that attribute quality varies enormously by
attribute and by Player, and any single-source model has to either pretend
otherwise or discard the good data along with the bad.

## Decision

Every attribute value carries a provenance record: a `source` of `measured`,
`derived`, `rated` or `generated`, and a `confidence` in 0-1.

Provenance is stored **parallel to** the attributes, not wrapped around each
value:

```ts
interface Skater {
  attributes: SkaterAttributes          // plain numbers
  provenance?: SkaterProvenance         // per-key metadata, optional
}
```

A Roster with no provenance is treated as uniformly generated.

## Rationale

**Parallel rather than wrapped.** The obvious shape is
`{ value, source, confidence }` per attribute. It was rejected: the engine
reads attributes millions of times in a realism run and must not walk a
wrapper object for metadata it never consults, and `attributes.speed` reading
as a number keeps every engine call site honest and simple. Scouting and the
interface are the only consumers of provenance, and they are not hot paths.

**Per-attribute rather than per-Player.** A single "data quality" flag on a
Player cannot express the real situation, which is that McDavid's `speed` is
radar-measured and his `checking` is a guess. Per-attribute confidence is the
minimum granularity that matches the data.

**Confidence is the scouting system.** This is the part that turns a
constraint into a feature. Scouting exists in this genre because the Manager
does not know a Player's true ability. If confidence is a first-class field,
scouting is not a mechanic bolted on beside the attributes - it is the act of
narrowing `observedRange`. An unscouted junior shows wide bands; a measured
NHL star shows a point. The information asymmetry the genre runs on comes out
of the data model rather than being simulated on top of it.

**Both worlds coexist by construction.** Real NHL Clubs, generated prospects
and a fully fictional league are the same structure with different provenance.
A Competition can mix them - a real NHL with fictional draft classes - without
a branch anywhere.

**An estimator can be improved in place.** Because `rated` outranks `derived`,
a community database can correct the estimator without replacing it, and a
better estimator can ship without touching generated or rated Players.

## Consequences

- `strength` was removed from the Skater attributes under D-06. It had no
  public source, and its intended effect overlapped almost entirely with
  `checking` and `puckControl`. Skaters now have 11 attributes. It can return
  if board battles become a distinct engine step.
- An attribute estimator that ignores deployment will be wrong in a specific,
  predictable direction. Adjusting for ice time, zone starts and teammate
  quality is not an optional refinement; it is the difference between a rating
  and a role description. Recorded as R-07.
- The interface must never present a low-confidence value as a fact. Showing
  a derived `checking` of 12 as "12" is a lie the Manager can detect.
- Real identity with generated ability is a legitimate and probably preferable
  configuration: a real Player whose attributes are anchored to his real
  production, without pretending to know whether his `checking` is 11 or 14.
- Phase 0 uses generated Rosters only, for reasons set out in `05-roadmap.md`:
  with an unvalidated engine and estimated attributes, a wrong result has two
  possible causes and neither can be isolated.
