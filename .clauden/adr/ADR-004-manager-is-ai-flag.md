# ADR-004 - A Manager is one entity with an isAi flag

- **Status:** Accepted
- **Date:** 2026-09-18
- **Relates to:** D-04, FR-10

## Context

Phase 0 and Phase 1 are single-player: one human Manager, the rest of the
Competition controlled by AI. Multiplayer is Phase 4 and may never happen.

The tempting shortcut is to treat AI Clubs as a special case - a function that
simulates the AI Clubs' Fixtures directly and skips Lineup selection, since no
one is watching. It is less code and it is faster.

## Decision

`Manager` is a single entity with an `isAi: boolean`. AI Managers set Lineups
and Tactics through exactly the same interface a human Manager uses. There is
no AI-specific code path in the engine and no `if (human)` branch anywhere.

## Rationale

**Multiplayer becomes configuration.** With this decision, turning a
single-player Competition into a multi-Manager one means replacing N AI
Manager rows with human ones. Without it, it means auditing every code path
for the assumption that only one Club is real - which is the reason most hobby
manager projects never add multiplayer.

**The AI gets tested by playing.** An AI that uses the real interface exercises
that interface constantly. Lineup validation bugs, impossible Tactics
combinations and rule-edge cases surface in the realism suite rather than in
front of a Manager.

**Fairness is structural.** An AI that can only do what a human can do cannot
accidentally be given hidden information or illegal moves. That property is
free here and expensive to establish later.

**Tier 3 depends on it.** The tactics assertions in
`04-validation-targets.md` compare AI Clubs playing different Tactics. That is
only meaningful if AI Clubs genuinely go through Lineup and Tactics selection.

## Consequences

- AI Lineup selection must exist in Phase 0, not Phase 4. It can start naive
  (sort by attribute, fill in order) but it must go through the real path.
- Simulating a Season costs a little more than shortcutting AI Clubs would.
  Irrelevant at this scale.
- Any future AI improvement automatically benefits from, and is constrained
  by, the rules humans play under.
