# ADR-029 - A career is a row, each Season a row, and a record is stored split

- **Status:** Accepted
- **Date:** 2026-11-11
- **Amends:** ADR-017 (the tables), ADR-025 (where the application keeps records)
- **Relates to:** D-03, D-04, D-11, ADR-014, ADR-025, ADR-028, issue #91

## Context

Phase 2, item 9: a Manager finishes a Season in the application and goes on to
the next one. Until now the application kept one Season per Manager
(ADR-017): a `seasons` row with the whole `SeasonState`, its `version` and its
`live` progress, with `fixture_results` and `notices` hanging from it. A new
Season deleted the old one.

The simulation already moves between Seasons through the `Offseason`
(ADR-028): `endSeason`, the draft window, the Roster window, `startNextSeason`.
Each finished Season leaves a `SeasonRecord` (ADR-025), kept by the caller
beside the state, from which a Club's history and a Player's career are read.
A record is 100-400 kB, almost all of it the Players' counts.

Two facts shape the storage:

- A Player who leaves the league leaves the state with his name. A record holds
  Player ids only, so a career page could not name a retired Player, nor a
  prospect who was drafted and never played.
- A Player's id is unique within a run (`draft-y{year}-{i}`,
  `{club}-y{year}-u{k}`), so it is a stable key within a career.

The author chose the options below on 2026-11-11.

## Decision

### Four tables

- **`careers`**: one row per run - the Manager, the seed, when it began. One
  career per Manager at a time, as one Season was before: the unique index moves
  from `seasons.manager_id` to `careers.manager_id`. A new career replaces the
  old one, and everything below it goes with it.
- **`seasons`**: one row per Season of a career, unique by career and `year`.
  It keeps the Club, the state while the Season is current, `version` and
  `live` as before, a `phase`, and the Season's record once it has ended.
  `fixture_results` and `notices` keep hanging from it, so every Season keeps
  its own results and notices.
- **`player_seasons`**: one row per Player and Season of a career, with his Club,
  age, natural position and level as the Season ended, and his regular-Season
  and playoff counts.
- **`players`**: one row per Player of a career, his identity only: first and
  last name, and whether he is a Goalie (D-11). Written for everyone when a
  career begins, and for each Player who arrives - drafted, filled or called
  up - when he first appears.

### The current Season is the row with the highest `year`

The working state stays on the Season's own row rather than moving to the
career. `phase` says which value its `state` holds:

- `season`: a `SeasonState`, advanced day by day as before.
- `offseason`: the `Offseason` that followed it (ADR-028). It is this Season's
  ending - `Offseason.ended` is this Season - so it lives on the same row, and
  `version` guards its steps as it guards days.

A finished Season whose successor exists holds no state: `state` is null.

### A record is stored split, not copied

`seasons.record` holds a record's own parts: the Season's id, year, champion,
final table, playoffs, draft and departures. `player_seasons` holds the rest,
the counts and the Roster as it ended, one row per Player. Reading puts the two
back into one `SeasonRecord`, so `stats/history.ts` reads it unchanged.

Nothing is stored twice and nothing is a view (ADR-025): the record is all
there, in two places. A test holds that storing a record and reading it back
gives the record `recordOf` made. A Player's career is then one query by his id,
not every record of the run read whole.

A row of `player_seasons` keeps each part of the record it comes from, empty
where that part had nothing for him, so the round trip loses nothing even for a
Player counted but not on a Roster at the end.

### Moving on: writes in an order that can be repeated

Closing a Season writes about a thousand rows. They are written in an order
that is safe to repeat, as a day's results are (ADR-017):

1. `players` and `player_seasons`, upserted by their keys;
2. the Season's row: `record` and the `Offseason` in `state`, `phase` to
   `offseason`, guarded by `version`.

Starting the next Season:

1. `players` for those who arrived, upserted;
2. the next Season's row, inserted, the unique `(career, year)` refusing a
   second;
3. the finished row's `state` set to null.

A failure part way leaves either the old row current, to be repeated, or the
new row current, with an old state left to clear on the next try. The step
from the state to the next is pure (ADR-014), so a repeat writes the same
values. A database function doing it all in one transaction was the
alternative; it would put logic in a second language for no difference a
Manager can see.

### The Manager's way through

1. A Season with its champion shows **Close the Season**. It stores the record
   and the `Offseason` (`endSeason`).
2. Between Seasons the home screen shows how the Season ended and **Start
   Season N**, which makes the next Season (`startNextSeason`). Until item 10
   every pick and every move is the assistant's, for every Club (D-04).
3. While a Season is in its `offseason` phase, the routes that need a
   `SeasonState` - the Lineup, a followed Fixture, advancing - refuse with
   `errors.offseason`, and the pages that use them send the Manager home.
   The table, the leaders and the results of the Season just ended still read
   from `Offseason.ended`.

Choosing a Club starts a new career, replacing the old one, as it replaced a
Season before.

### Event streams are all kept for now

A Manager's own Fixtures keep their streams, about 6 MB a Season, and every
Fixture its box score. Nothing is pruned when a Season ends. Whether to drop
the streams of finished Seasons is decided before the first public release,
with hosting (ADR-017).

### Existing Seasons become the first of a career

The migration gives each stored Season a career of its own, with `year` from
its state (1 for Seasons stored before #85) and phase `season`. A Season under
way plays on, and goes on to the next.

## Options considered

**The working state on the career row.** One row that moves and Season rows
that only hold history - the cleaner model. But every route's storage would be
rewritten, and `fixture_results` and `notices` would need the career to point
at its current Season. It changes nothing a Manager sees.

**The `Offseason` in a column of the career.** The working state would sit in
two places, depending on the phase.

**The whole record in `seasons.record`, with `player_seasons` beside it.** A
second copy of the counts, which ADR-025 rejected.

**The whole record in `seasons.record` and no `player_seasons`.** Simplest, but
a career page twenty Seasons on reads about 8 MB.

**Names in `player_seasons` instead of `players`.** One table fewer, but a
prospect who never plays has no row there, so the draft would need its names
kept apart.

**One button, `nextSeason`, and no stored `Offseason`.** Least work now, but
item 10 would rework the storage and the way through to add the windows.

## Consequences

- A career survives any number of Seasons. Its size grows by about 1,000
  `player_seasons` rows, about 1,430 `fixture_results` rows and 6 MB of
  streams a Season. The state written each day does not grow.
- Item 10 adds the draft and Roster windows on the stored `Offseason`
  (`setDraftList`, `setRosterMoves`) and the notices between Seasons, with no
  new storage. It decides which Season those notices belong to.
- Item 11 reads history from `seasons.record`, `player_seasons` and `players`,
  through the folds of `stats/history.ts`.
- `loadSeason` finds the current Season through the career. Every other
  route keeps the shape it has.

## Amendment, 2026-11-12: a career keeps its Roster source (#115)

`careers.roster_source` records whether a career began on generated Rosters
(`generated`, the default, and every career stored before) or on the server's
roster file (`file`), ADR-003 amendment. Nothing reads it to play: it tells the
Manager which league the career is.

## Amendment, 2026-11-12: notices between Seasons (#92)

A notice belongs to the Season that is current when it is known. Departures
and the draft are known between Seasons, while the ended Season's row holds
the `Offseason`, so they hang from that row and the Manager reads them before
he decides. Call-ups, releases, expired rights and the fill are known as the
next Season starts, and hang from its row. Names come from `players`, which
keeps those who have left.
