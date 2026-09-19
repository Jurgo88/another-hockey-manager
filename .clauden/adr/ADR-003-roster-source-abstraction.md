# ADR-003 - Roster source behind an interface

- **Status:** Accepted
- **Date:** 2026-09-18
- **Relates to:** D-05, R-02, R-06

## Context

Real NHL Player names make the game immediately more engaging, and the data is
reachable: the NHL operates a public, undocumented API at `api-web.nhle.com`
with community reference documentation.

The legal position is not symmetrical across data types:

- Player names and statistics are factual data.
- Club names, logos and jersey designs are trademarks.
- EA holds an exclusive NHL simulation licence.

For a portfolio project the practical risk of using real names is low. For a
monetised product it is a blocker, and takedowns in this genre are routine.
The stated goal is portfolio now, product possibly later - so the licensing
question cannot simply be deferred, but it also should not dictate the
experience today.

Separately, the Slovak Extraliga has no public API, so any non-NHL real data
needs scraping or manual seeding (R-06).

## Decision

Roster acquisition sits behind an interface:

```ts
interface RosterProvider {
  loadCompetition(id: CompetitionId): Promise<Club[]>
}
```

Two implementations:

- `GeneratedRosterProvider` - procedurally generated Players, Clubs and
  Competition structure. The default, and the only one a public build uses.
- `NhlImportRosterProvider` - imports real Players from the public NHL API.
  Local and development use only.

Club logos and marks are not used in any build. Club names in a public build
come from the generator.

## Rationale

The cost of the abstraction now is a few hours. The cost of retrofitting it
after Rosters have been assumed real throughout the codebase is a rewrite of
every seeding, display and import path. Given that the product question is
genuinely open, paying the small cost is the cheap option.

Making the generator the default rather than the fallback has a second
benefit: it forces the generated Rosters to be good enough to play with,
which is a requirement for any public build anyway.

## Amendment, 2026-09-18: a roster file format

`RosterProvider` covers acquisition inside the application. It does not cover
the case that matters most for real names, which is a Roster the *Manager*
supplies.

This is the pattern Eastside Hockey Manager itself arrived at. EHM ships on
Steam with a fictional default database; real Player and competition names
come from community-built databases distributed through the Steam Workshop,
maintained by people who follow the sport. Sports Interactive does not
distribute the licensed names - the community does, which is a materially
different position.

So a third element is added: a documented **roster file format** with import
and export.

- The default build generates its Rosters.
- A Manager may import a roster file, which may contain whatever names they
  like.
- Export exists so that a Roster can be edited, shared and improved outside
  the application.

Real names therefore become an action taken by the Manager rather than a
distribution decision taken by the project - and it is a feature rather than a
concession, since it is also how community rating work becomes possible at
all. Imported values arrive with `source: 'rated'` (ADR-008), which outranks
anything the estimator derived.

A real-data import path for development (`NhlImportRosterProvider`) remains
separate from this and stays out of deployed builds.

## Consequences

- Nothing in the engine or the application may assume a Player has a real-world
  counterpart.
- The generator needs a credible name corpus and a talent distribution that
  produces a realistic league - which Tier 2 of `04-validation-targets.md`
  already demands.
- A build flag selects the provider; the real-data provider is never bundled
  into a deployed build.
- This is a risk-management decision, not legal advice. If the product goal
  activates, the licensing position needs an actual lawyer.
