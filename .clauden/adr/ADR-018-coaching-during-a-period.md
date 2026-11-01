# ADR-018 - A Fixture is revealed in steps, and a change can come at any of them

- **Status:** Accepted
- **Date:** 2026-11-01
- **Supersedes in part:** ADR-016, on when a change can come and how a Fixture is shown
- **Relates to:** FR-30, D-01, D-03, D-04, ADR-012, ADR-016, ADR-017, issue #61

## Context

After the first play test the author asked for two things: a screen before a
Fixture, and a way to watch a Fixture run at a chosen speed and coach during a
Period. Real-time coaching was a permanent non-goal, for the cost of websockets,
disconnection handling and clock authority, so this needed a decision. The author
chose to open it, with no limit on changes.

ADR-016 already showed that a change needs no suspended engine. Nothing in that
reasoning was specific to intermissions.

## Decision

**A change is tied to a place in the stream.** `FixtureChange.afterEvent` says how
many events the stream held when the Manager decided, and the engine takes the
change up at the first Shift or intermission after that. It draws no random
numbers, so those events cannot move. This replaces `afterPeriod`.

**The server reveals, and the browser only plays back.** `continueFixture` shows
about a minute of game time, or up to the end of a Period. `LiveFixture.shown`
counts the events revealed. The browser animates each step at the chosen speed and
asks for the next. There is no server clock and no open connection, so a Manager
who walks away loses nothing, and a Fixture is still one pure call.

**The rules of ADR-016 stand.** Nothing revealed can change, the client receives
only what has been revealed, and only dressed Players take part.

**A change counts from the end of the revealed step.** While paused the broadcast
may still be up to a minute of game time behind what has been revealed, so a change
can come that much later than it looks. The alternative is a request for every
Shift.

**Progress sits apart from the Season state.** A step comes about once a second at
the usual speed, and the state is too large to rewrite that often, so the
`seasons.live` column holds it.

**What a Manager sees is what the engine knows.** The broadcast shows the clock,
score, shots, who is on the ice, a pressure bar from recent attempts and the
play-by-play. Rink visualisation stays a non-goal: the engine has no positions.

**A screen comes before the Fixture,** for the Lineup and Tactics. Starting the
Fixture saves them and opens it, with nothing yet shown.

## Options considered

**Real-time play on the server.** What the non-goal rejected, and nothing here
needs it.

**Sending a whole Period and animating it.** One request per Period, but the result
sits in the browser, and a change could only come at its end.

**Tactics only during a Period.** Closer to a real coach, but the author wants
Lines too.

**A limit of three changes a Period.** A simple way to give a change weight. Left
out so that the advantage could be measured first.

## Consequences

Measured over 2,400 home Fixtures on 32 Clubs, with the same seeds, for a Club that
checks the score every three game minutes, raises `aggression` to 85 when behind,
drops it to 25 when ahead and goes back to 50 when level:

| Figure | Static | Reacting |
| --- | --- | --- |
| Wins | 47.5% | 51.6% |
| Points per 84 Fixtures | 91.1 | 97.5 |
| Goal difference | -0.116 | +0.015 |

- **Reacting is worth about 6 points a Season, with a margin of about ±3,** from
  one rule that takes no skill, for a Club that follows every Fixture. AI Managers
  do not react, so this is an edge over them, and nothing yet offsets it.
- That rule alone beats any fixed setting of the dial, which suggests `aggression`
  costs too little when a Club is behind. Score effects are a likely cause.
- `FixtureInput.intermissions` becomes `changes`. Stored Seasons hold no change
  unless a Fixture is being followed at the time of the upgrade.
- The non-goal in `00-overview.md` narrows to a server clock and open connections.
- Goalie rotation stays with the Fixture, and overtime Periods now allow changes.
- Each step of following plays the Fixture again, at about 110 ms a request.
