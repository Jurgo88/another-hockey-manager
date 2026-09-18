# ADR-001 - Monorepo with the simulation as a separate package

- **Status:** Accepted
- **Date:** 2026-09-18
- **Relates to:** NFR-01, NFR-02, D-01

## Context

The simulation engine must stay independent of the application: testable in
isolation, free of database and framework knowledge, and fast enough to run
tens of thousands of times in a test suite. The application will be a Nuxt
app on Supabase, following the pattern already established on other projects.

Three options were on the table: a single Nuxt application with the engine in
`server/domain/sim`, a pnpm monorepo with the engine as its own package, or
two separate repositories with the engine published to npm.

## Decision

A pnpm workspace monorepo. `packages/sim` is the engine as `@ahm/sim` with
zero runtime dependencies. `apps/web` arrives in Phase 1.

## Rationale

The single-application option keeps the boundary alive only through
discipline. The first time something needs a value that happens to be in the
database, the import appears, and from then on the engine can no longer be
run without a database - which silently kills the realism suite, the single
most valuable artefact in the project. A workspace boundary makes that import
a build error instead of a judgement call.

Two repositories enforce the boundary harder still, but impose a
publish-and-bump cycle on every change that touches both sides. On a solo
project that is pure friction with no compensating benefit.

## Consequences

- `@ahm/sim` declares no dependencies, and adding one is a visible decision.
- The engine can be exercised from a CLI with no application present.
- Slightly more initial tooling: workspace config, a shared tsconfig base.
- Phase 1 adds `apps/web` without restructuring anything.
