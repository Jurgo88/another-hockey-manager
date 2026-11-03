# ADR-024 - The draft gives rights to prospects who develop off the Roster

- **Status:** Accepted
- **Date:** 2026-11-03
- **Relates to:** D-04, D-08, D-10, D-11, ADR-008, ADR-022, ADR-023, issue #83, issue #89

## Context

New Players have to arrive, and how they arrive is where a manager game lives.
The author chose on 2026-11-02:

- The draft gives a Club the rights to a prospect, who develops off the Roster
  and joins when ready.
- Undrafted Players fill the remaining gaps.
- The number of rounds, 4 to begin with, and the lottery are data (D-10).
- A Manager makes their own picks through the call an AI Manager uses (D-04).

On 2026-11-03 the author settled what "ready" means, and how long rights last.

Measured in `07-league-over-time.md`, draft classes 2010 to 2018:

| Round | 200 or more NHL Fixtures | Median seasons to debut |
| --- | --- | --- |
| 1 | 74.9% | 1 |
| 2 | 38.5% | 3 |
| 3 | 19.9% | 3 |
| 4 | 16.5% | 3 |
| 5-7 | 6-13% | 4 |

## Decision

**The format is data.** A Competition's draft is a value beside its schedule and
playoff format: the number of rounds, the order and the lottery odds. NHL begins
with 4 rounds, the order is the reverse of the final table, and its lottery
follows the NHL's draws and odds. Adding a league or a round means adding a
value, not a branch (D-10).

**A draft class is generated** with the generator's one-Player functions, at 18
and a few at 19. It has more prospects than picks, so the last pick still has a
choice. Their abilities are spread so that the share who become regulars, by
round, meets the table above. That is calibrated in item 7.

**Prospects are seen as ranges (D-11).** Their attributes and `potential` are
generated at confidence 0.25, so a Manager sees wide bands. Scouting will later
narrow them (ADR-008).

**Picking is one call for every Manager (D-04).** The AI Manager's choice is the
prospect whose range is best at the top. A human Manager chooses through the same
call, or leaves it to the assistant.

**A prospect develops off the Roster** by the same curves as everyone (ADR-022),
without the ice-time bonus.

**He is ready when his level reaches the weakest Player at his position on his
Club's Roster.** The assistant then calls him up, and the weakest at the position
is released (ADR-023). A Manager can call a prospect up earlier or keep him down,
through the same call (D-04). Debut by round is not set by a rule: it follows
from development, and the Phase 2 gate checks it against the medians above.

**Rights last 4 seasons.** A prospect who has not joined by then becomes an
undrafted Player, free to fill a gap at any Club (ADR-023).

**Undrafted Players fill what remains:** generated at the depth of a call-up, and
in the measured league about 15% of Players were never drafted.

## Options considered

**Readiness by round,** the first round after one season and later rounds after
three. Exactly the medians, but a weak prospect would arrive however poor he was.

**Readiness only by the Manager's decision.** An AI Manager needs a rule anyway,
and the rule would be this one.

**Rights for 2 seasons or forever.** Two lose most late picks before they mature,
whose median debut is 3 to 4 seasons. Forever lets Clubs hoard.

**Seven rounds as in the NHL.** Rounds 5 to 7 yield few regulars, and the
undrafted fill stands in for them until the draft shows it needs more.

## Consequences

- A Club carries a list of prospects beside its Roster; the Season state holds
  it as plain JSON (ADR-014).
- The draft runs between Seasons, after retirements and before releases
  (ADR-023).
- The web shows the draft and its notices as item 10.
