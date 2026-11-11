# ADR-025 - Season history is kept beside the Season state, not in it

- **Status:** Accepted
- **Date:** 2026-11-04
- **Relates to:** D-03, ADR-014, ADR-017, issue #85, issue #86

## Context

Seasons follow one another from #85, and a run has to answer two questions about
its past: how a Club did in each Season, and what a Player did over a career.

Everything needed is already folded while a Season is played (D-03): the
regular-Season table, the playoff bracket with its series, and each Player's
counts for the regular Season and the playoffs. The question is where it is kept
once the next Season starts. The counts of every Player in one Season come to
100-400 kB of JSON, and the application writes the whole Season state after
every day it plays (ADR-017).

## Decision

**The author decided on 2026-11-04: a finished Season is a `SeasonRecord`, kept by
the caller beside the state, not in it.** `recordOf(state)` gives it once the
Season has a champion, and the caller takes it before `nextSeason`. The state
holds one Season and `year`. The `past` field #85 added to the state goes.

**A record keeps what was folded, not views of it.** It holds the Season's id
and year, the champion, the final table, the playoff state and the Players'
counts, regular Season and playoffs apart. Every count is kept, as the author
chose: nothing is lost that a later screen might want.

**History and careers are read from records, never stored.** `stats/history.ts`
imports `domain` and `stats` only:

- `clubHistory` gives a Club's Seasons: its table row, its place in its division
  and in the league by the tiebreaking order, and how far it went in the
  playoffs, which is the last round it appears in.
- `skaterCareer` and `goalieCareer` give a Player's Seasons, one line each with
  the Club and the counts, null for a part they did not play, and no line for a
  Season they did not play at all. `careerTotals` sums them.

**The CLI shows both.** `pnpm sim:season --seasons <n>` prints the leading
scorer's career, or the one `--player` names, and `--club` prints a Club's
history.

## Options considered

**Records in the state, as `past`.** One value, nothing for the caller to keep,
but it grows by up to 400 kB a Season, and the application would rewrite it
after every day: twenty Seasons on, a day's save is mostly history.

**Only the main counts per career line.** Smaller, but a count left out can never
be recovered.

**History stored as views.** A Club's places and a Player's career lines written
down as the Season ends. Quicker to read, but a second copy of what the records
already say.

## Consequences

- The Season state does not grow with a run.
- The application needs a place for records, a table of its own, when it
  continues a career across Seasons (Phase 2, item 9).
- A career line is per Season and Club. Players cannot yet move during a
  Season, so a Season has one Club; when they can (Phase 3), the counts of a
  Season will need splitting by Club before they are folded.
- Ages are not in a record. A career shows them once the Player's age can be
  read for each Season, which development (#87) needs as well.

## Amendment, 2026-11-10: a record holds its draft (#89, ADR-028)

A Season's record also holds the draft held before it: each pick's year, round,
place, Club and prospect. A class is followed through a run from the records,
with the careers of its prospects, as the draft table of the Phase 2 gate needs.

## Amendment, 2026-11-11: a record holds who was there and who left (#90)

A Season's record also holds who was on each Roster as it ended, with his Club,
his age, his natural position and his level, and the departures before the
Season, each with its reason. The age of the league, who leaves it and the
level of a league by age are then folded from the records of a run, as the
Phase 2 gate needs, and a career can show a Player's age in each Season. The
consequence above, that ages are not in a record, no longer holds.
