# ADR-021 - The attribute estimator ranks real Players into the generated distribution

- **Status:** Accepted
- **Date:** 2026-11-03
- **Relates to:** D-05, D-06, D-11, ADR-008, ADR-012, ADR-020, R-07, R-08, issue #17

## Context

Phase 0.5 needs real NHL Rosters with attributes that are grounded in public
data and honestly marked (ADR-008). The output is a roster file (ADR-020), so
nothing in the engine or the Season changes.

What the NHL publishes, checked against the 2025-26 season:

| Source | What it gives |
| --- | --- |
| `api.nhle.com/stats` reports | Per Player and season: ice time by situation, 5v5 goals, primary assists and individual shots per 60, offensive zone start share, relative shot attempt share, takeaways, giveaways, minor penalties, faceoffs won and taken, birth date, shooting hand. Goalie shots and saves by strength. |
| `api-web.nhle.com` club statistics | Games and ice time per Player per Club, which splits a traded Player's season. |
| NHL EDGE, per Player | Top skating speed, top shot speed, distance skated, and shots and goals by area, including the high-danger area. |

Expected goals and teammate quality are not published by the NHL.

Four constraints shape the method:

- The engine is calibrated against the generator's attribute distribution
  (`04-validation-targets.md`). Attributes on a different distribution would
  move every realism band, and a bad result could no longer be told apart from a
  bad engine.
- Counting statistics measure deployment as much as ability (R-07).
- The naive Lineup needs four natural left wings, centres and right wings and
  three natural left and right defencemen per Club. The NHL lists positions
  loosely and does not separate left from right defence.
- Every value must say how far it can be trusted (D-11).

## Decision

**A separate package, `@ahm/estimate`, fetches and estimates.** It depends on
`@ahm/sim` and writes a roster file. `@ahm/sim` stays free of dependencies and of
code the game does not run (NFR-01). The raw NHL responses are cached in a folder
git ignores. The estimate is a pure function of them, so the same snapshot always
gives the same file, and tests run on small hand-made records with no network.

**Rank within position, then map onto the generator.** For each attribute the
estimator computes a metric per Player, ranks the Players of one position group
(centres, wingers, defencemen) by it, and gives each the value at the same
percentile of the generator's distribution for that group and attribute. The
distribution the engine is calibrated on is kept exactly; the data decides only
who sits where in it.

**Metrics, and how far each is trusted:**

| Attribute | Metric | Source |
| --- | --- | --- |
| `speed` | EDGE top skating speed | `measured` |
| `faceoffs` | Faceoff win share, forwards with at least 100 draws, mapped onto centres | `measured` |
| `shooting` | Shooting percentage with top shot speed | `derived` |
| `offPositioning` | High-danger shots per 60 at 5v5 | `derived` |
| `passing` | Primary assists per 60 at 5v5 | `derived` |
| `puckControl` | Relative shot attempt share at 5v5, with takeaways against giveaways | `derived` |
| `discipline` | Minor penalties per 60, inverted | `derived` |
| `stamina` | Distance skated per Fixture | `derived` |
| `checking`, `defPositioning`, `shotBlocking` | None; generated around the Player's level | `generated` |

`stamina` is `derived`, not `measured` as ADR-008 listed it: distance is measured,
but it is how much a Player was asked to skate, not how slowly he tires.

**Deployment is adjusted from NHL data only (R-07).** The 5v5 rates are corrected
for offensive zone starts with a slope fitted across the position group. Every
metric is shrunk towards the group mean in proportion to the sample behind it, so
ten Fixtures of hot shooting do not make an elite shooter. Teammate quality is not
adjusted for. Confidence says so: it starts from the source's default and falls
with the sample, to 0.25 at the limit, and no `derived` value starts above 0.5.

**Ice time anchors the level.** Coaches give the most ice to the Players they
think best overall, which is the judgement hit and block counts cannot make. A
Player's ice time per Fixture, ranked in his group, gives an ability on the
generator's scale. The attributes with no public source are generated from that
ability at confidence 0.25, so an elite defenceman does not draw a random 6 in
`defPositioning`. The same ability fills in any metric the data lacks for a
Player.

**Goalies get one level, not five facts.** Even-strength save percentage, shrunk
by the shots behind it, ranks the Goalies. The five attributes are generated around
the ability at that rank, `derived` at confidence 0.4 or less.

**`potential` is drawn by age, fixed per Player.** The generator's headroom for the
Player's age is drawn from a stream seeded by the Player's id and put on top of
his estimated level, as in ADR-020. A real league then has the same spread of
headroom as a generated one, which Phase 2 development is calibrated on.

**The Roster is chosen by ice time at the Club.** A Player belongs to the Club he
played the most Fixtures for. Each Club keeps its 16 forwards, 10 defencemen and 3
Goalies with the most ice time there. A defenceman plays the side of his shooting
hand. Natural positions are then moved as little as needed to give each Club four
of every forward position and three on each defence side: a centre with the
fewest draws moves to the wing, a winger with the most draws moves to centre, and
a moved Player keeps his old position as his second. A Club still short is
completed with generated Players at the depth of a call-up, at confidence 0.25
(ADR-020).

Age is taken from the date of birth on 1 October of the season's first year.

## Options considered

**Formulas from metric to scale.** Easier to read, but the distribution shifts,
and the engine would need calibrating again against ratings nobody can verify.

**Expected goals from a third party.** A better signal for shooting and positioning,
but a dependency on an external source and its licence.

**Teammate quality from shift data.** The most accurate, and a project of its own:
separating a defenceman from his partner is unsolved in hockey analytics.

**A fixed median headroom by age.** No randomness, but every Player of one age
would have the same room to grow.

**The estimator inside `@ahm/sim`.** One package, but the engine package would
grow by code the game never runs.

## Consequences

- `@ahm/sim` exports the generator's pieces the estimator needs: one Player from a
  position, an ability and an age, the headroom for an age, and the ability that
  gives a level. The generator draws the same random numbers as before, so no
  result changes. Phase 2 draft classes use the same function.
- A real league is exactly as spread as a generated one, by construction. Whether
  the right Clubs and Players come out on top is what #18 tests.
- A Player who changed roles mid-season is ranked on his season totals.
- An attribute can move a long way between two snapshots for a Player with few
  minutes; its confidence is low for that reason.
- The cached raw data stays out of the repository. The roster file with real names
  is committed; the author has cleared names in the repository.
