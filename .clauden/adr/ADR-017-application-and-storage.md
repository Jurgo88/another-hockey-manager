# ADR-017 - Nuxt on Supabase, with the browser kept away from Supabase

- **Status:** Accepted
- **Date:** 2026-11-01
- **Relates to:** D-03, D-04, ADR-001, ADR-004, ADR-005, ADR-014, ADR-016, issue #49

## Context

Phase 1 adds `apps/web`. `05-roadmap.md` already fixed Nuxt, Supabase and the rule
that all domain logic lives in Nitro server routes, with no client-to-database
access. Still open were where it runs during development, how much to store, and
how signing in works under that rule.

Measured over one Season of 1,430 Fixtures:

| Figure | Size |
| --- | --- |
| Season state | 1.1 MB, 0.07 MB compressed |
| Events of one Fixture | 68 KB, at most 121 KB |
| Events of a whole Season | 95 MB, 8.3 MB compressed |
| Longest day to simulate | 194 ms |

## Decision

**Supabase runs locally in Docker during development.** Migrations live in
`supabase/migrations`. Hosting is decided before the first public release, and
Supabase and the host are separate choices. Cloudflare Workers remain possible for
the web tier, though on the free plan its 10 ms of CPU per request would not cover
a simulated day.

**The browser talks only to Nitro, for signing in too.** Nitro calls Supabase Auth
with the anon key and keeps the session in `httpOnly` cookies, so no key and no
token reaches client code. The tables are reached with the service key. RLS is on
with no policies, so a leaked anon key reads nothing.

**A simulated day runs inside the request.** At under 200 ms it needs no worker.

**Three tables.**

- `managers` holds the account link and `is_ai` (D-04). An AI Manager has no
  account, so `auth_id` may be null.
- `seasons` holds the Club, the seed and the `SeasonState` in a `json` column.
  Nothing queries inside it, and `json` stores it as written, where `jsonb` would
  reorder keys. One unique index limits a Manager to one Season at a time, and
  dropping it allows several.
- `fixture_results` holds the result and box score of every Fixture, and the event
  stream only for the Manager's own Club, about 6 MB a Season.

**Email and password** is the sign-in, with confirmation off locally.

## Options considered

**`@nuxtjs/supabase`, with the session held in the browser.** Less code, but the
client would hold a token that talks to the database directly, and RLS policies
would become the real boundary, against the architecture constraint.

**Keeping every event stream.** Any Fixture in the league could be read, at about
95 MB a Season, which fills a 500 MB free database within a few Seasons.

**Cloudflare with D1.** No Docker and always online, but sign-in would have to be
built, and simulation would need a paid plan.

## Consequences

- A Fixture of another Club shows a result and a box score, not a play-by-play.
- Development needs Docker running.
- Before a public release, email confirmation has to go on, which needs a mail
  service, and the service key has to move to a secret store.
- Each browser request costs one call to Supabase Auth to check the session.
