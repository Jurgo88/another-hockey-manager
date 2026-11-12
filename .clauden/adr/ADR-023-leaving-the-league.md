# ADR-023 - Players leave by age, level and Roster pressure

- **Status:** Accepted; its retirement rule superseded, and release moved to #89, by ADR-027; a release becomes a buyout and a move to free agency by ADR-032
- **Date:** 2026-11-03
- **Relates to:** D-04, D-08, ADR-012, ADR-020, ADR-022, ADR-024, issue #83, issue #88

## Context

Without departures a league only grows older. The author chose on 2026-11-02:
leaving depends on age, level and pressure on the Roster. A Club keeps its shape,
and the weakest at a position leave when new Players arrive. An assistant coach
decides by default, and a Manager can overrule it.

Measured in `07-league-over-time.md`, of Players with 20 or more Fixtures in a
season, the share who play none the next:

| Age | Rate | Ice time in his group | Rate |
| --- | --- | --- | --- |
| 23 or younger | 4.4% | Top third | 1.3% |
| 24-27 | 7.3% | Middle third | 5.3% |
| 28-30 | 7.4% | Bottom third | 20.1% |
| 31-33 | 13.0% | | |
| 34-36 | 23.0% | | |
| 37 or older | 43.0% | | |

Level matters more than age until the mid-thirties, and then age dominates.

## Decision

**Two ways out, kept apart.**

- **Retirement is the Player's decision.** After each Season a Player retires
  with a chance that rises with age and falls with his level among his position
  group in the league. The chance is fitted so that both tables above are met
  together. A Manager cannot overrule a retirement.
- **Release is the Club's decision.** When a Club holds more than its shape at a
  position, because prospects are ready (ADR-024) or Players arrive, the weakest
  at that position by level is released and leaves the league.
  - The assistant proposes the releases.
  - A Manager can choose a different Player to release, through the same call
    every Manager uses, AI included (D-04).

  Until Phase 3 adds free agency, a released Player is gone.

**A Club always keeps the Roster shape, 16-10-3 (ADR-020).** Where departures
leave a gap that no prospect fills, an undrafted Player is generated at the
depth of a call-up (ADR-021) and marked generated.

**The draws come from their own stream** per Season and Player (D-08).

**Order between Seasons:**

1. Development (ADR-022).
2. Retirement.
3. The draft (ADR-024).
4. Prospects who are ready join their Club.
5. Releases.
6. Undrafted fill.

## Options considered

**Retirement by age alone.** It matches the age table and misses the level table
by a wide margin: a fourth-liner at 26 is far likelier to be gone than a star.

**No releases; Rosters grow and shrink.** Simpler, but the engine and the injury
rate are calibrated on the Roster shape (ADR-012).

**Overrulable retirement.** It would hand a Manager the power to keep a
40-year-old forever.

## Consequences

- About 173 real Players a season play none the next and about 137 play their
  first, in a league that grew by two Clubs. The run has to keep the Roster count
  steady, so departures and arrivals match by construction.
- The rates by age and level are part of the Phase 2 gate.
- With Phase 3 a release becomes a move to free agency, without changing this
  rule.
