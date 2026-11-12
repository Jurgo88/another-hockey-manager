# ADR-035 - Each Club sees its own estimate, and every Club decides on what it sees

- **Status:** Accepted
- **Date:** 2026-11-12
- **Amends:** ADR-008 (where a range is centred), ADR-024 and ADR-028 (the assistant decides on its view), and carries out the ADR-003 amendment of 2026-11-12
- **Relates to:** FR-18, FR-36, D-01, D-04, D-08, D-11, ADR-003, ADR-008, ADR-022, ADR-028, ADR-030, ADR-033, ADR-034, issue #121

## Context

ADR-008 made confidence the scouting system: scouting narrows the band a Manager
sees. The ADR-003 amendment of 2026-11-12 sharpened it. Today's range,
`observedRange`, is symmetric about the true value and as wide as confidence is
low: it says how far an estimate can be trusted, and its middle is the truth.
Hiding the value, a window placed anywhere about it and narrowed by looking, is
scouting. A generated league shows figures until scouting arrives, and from then
shows ranges in both kinds of league.

The `potential` of a Player under 23 moves each Season (ADR-028): a wide range on
a prospect is honest, because his future is open. Scouting narrows how well it
is seen, not how open it is.

Today every assistant decision reads the truth: the draft takes the highest true
`potential`, readiness and releases compare true levels (ADR-028). With trades
and free agency that would make every AI Club omniscient, a Manager's scouting
worthless against them, and D-04 a matter of form.

The author chose on 2026-11-12: each Club holds its own estimate of a Player,
the truth plus noise from its own stream, narrowing with observation, public and
assigned, and every decision a Club makes reads its own view.

## Decision

**A Club's view of a Player is an estimate for each attribute and for
`potential`:** the true value plus an error. The error is a fixed draw for that
Club, Player and attribute, from a stream forked from the run's seed (D-08),
times a spread that shrinks as the Club observes him. The range shown is
`observedRange` centred on the estimate, as wide as the spread, so the truth
lies inside it most of the time but not in its middle. Two Clubs see the same
Player differently, which gives trades and offers something to disagree about.

The error moves with the truth: when a Player develops, every Club's estimate
moves with him, at the same relative error. A Club does not lose track of a
Player because he grew; it sees him as well as it has observed him.

**A Club observes a Player in three ways:**

- **His source.** The confidence his provenance gives (ADR-008) is a floor for
  every Club. A `measured` speed is public; a `generated` checking is not.
- **Fixtures in the league.** Every Fixture a Player plays is seen by every Club,
  and more by his own: his Club observes his ice time as a coach does. Kept per
  Player, not per Club, so it costs one count.
- **Assignments.** Each Club has the same number of scouting assignments a
  Season (ADR-034). An assignment observes one Player, or a draft class, for a
  set amount. A Manager declares them; where a Club declares none, the assistant
  assigns them, to the next draft class and to Players it is weighing for a
  trade or an offer.

What is stored is how much each Club has observed each Player it has scouted,
sparse, and the count of Fixtures per Player. The estimates are recomputed from
those and the draws, so the state stays small and plain JSON (ADR-014).

**`potential` is never shown as a figure** (FR-36). For a Player under 23 its
range is never narrower than how far his `potential` can still move by
development (ADR-028): scouting cannot see a future that is not decided.

**Every Club decides on its own view (D-04).** The assistant's draft picks,
readiness and releases (ADR-028), re-signing and offers (ADR-032), trades
(ADR-033) and Lineups read the Club's estimates, never the truth. The Player's
own choices in the market read his true ability (ADR-032), since he is not a
Club. The engine reads the truth (D-01): a Match is played by what Players are,
not by what anyone thinks of them.

**Both kinds of league.** A generated league shows ranges from Phase 3, as the
ADR-003 amendment foresaw. A Player who has played in the league is soon well
seen by every Club through his Fixtures; a prospect, a Player from outside the
league and every `potential` stay wide until scouted. A roster file keeps its
provenance: a measured attribute is narrow for everyone from the start.

## Options considered

**A narrower symmetric range about the truth,** `observedRange` with a higher
confidence. Its middle is the truth, so a Manager could read the value off any
range, which the ADR-003 amendment rejects.

**Discrete levels of knowledge,** unknown, basic and full. Easy to show, but a
Player is either known or not, and two Clubs that both scouted him agree.

**A fresh noise draw at every observation,** averaged as observations come.
Statistically closer to sampling, but the estimate would jitter from report to
report and the state would have to keep the running averages.

**The assistant reading the truth,** as it does now. Simplest, and it makes every
AI Club omniscient.

## Consequences

- The draft's calibration moves: the assistant now picks by its estimate, so
  rounds yield differently. The draft table is refitted in the long-run
  calibration of Phase 3.
- A generated league's Rosters show ranges in the application, and the career's
  first Season shows the widest, before any Fixture is played.
- The interface needs a scouting view: assignments, and how well each Player is
  seen.
- Good scouting finds Players whose public ask (ADR-030) is low for what they
  are, which is what makes it worth an assignment.
