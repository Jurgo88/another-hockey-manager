# Another Hockey Manager - conventions for Claude Code sessions

## Read first

`.clauden/` holds the specification. Read `00-overview.md` and
`01-requirements.md` before proposing any change. Decisions are in
`.clauden/adr/`.

## Working agreement

- **Plan before code.** Propose the approach and get approval before writing
  implementation. This is not optional on this repo.
- **Slovak in conversation, English in artefacts.** All code, comments,
  commit messages, specification documents and ADRs are English.
- Architecture decisions are the author's to make. Present options with
  trade-offs and an explicit recommendation; do not pick silently.
- Legal and policy questions (licensing, GDPR) are not architecture questions.
  Say so rather than answering them.

## Hard invariants - do not violate without an ADR

| ID | Invariant |
| --- | --- |
| D-01 | `simulateFixture` is pure: no I/O, no clock reads, no ambient state. |
| D-02 | `Math.random()` must never appear in `@ahm/sim`. Draw from the injected `Rng`. |
| D-03 | The event stream is the only engine output. Statistics are folded from it, never computed alongside. |
| D-04 | `Manager` is one entity with `isAi`. No AI-specific code path, no `if (human)` branch. |
| D-05 | Roster acquisition sits behind `RosterProvider`. |
| D-06 | A Player attribute exists only if `src/engine` reads it. Add the read site in the same change. |
| D-07 | Banned identifiers: `Team`, `Game`, `User`, `Squad`. |
| D-08 | Each Fixture draws from its own forked `Rng` stream. |
| D-10 | Competition and playoff formats are declarative data, not code branches. Adding a league means adding a value. |
| D-11 | Player identity and ability are separate. Provenance is per attribute, parallel to `attributes`, so engine reads stay plain numbers. Never present a low-confidence value as a fact. |

## Domain vocabulary

`Club` not Team. `Fixture` (scheduled) and `Match` (played), never Game.
`Manager` not User. `Roster` not Squad. `Line` is a forward trio, `Pairing` a
defensive duo, `Unit` a special-teams formation. Full table in
`.clauden/02-domain-model.md`.

## Module boundaries

```
domain/   types only, no behaviour       - imports nothing internal
rng/      deterministic randomness      - imports nothing internal
generate/ procedural Rosters and names  - may import domain, rng
engine/   simulation                    - may import domain, rng
stats/    folds over the event stream   - may import domain ONLY
cli/      entry points                  - may import anything
```

`stats/` importing from `engine/` breaks D-03. This is the boundary that
matters most.

## Definition of done

A change to the engine is done when `pnpm test` is green, including
`packages/sim/test/realism/`. A red realism band means calibrate the engine,
not widen the band (see `.clauden/04-validation-targets.md`).

## Commands

```
pnpm install
pnpm test                 # all packages
pnpm --filter @ahm/sim test:watch
pnpm --filter @ahm/sim test:realism
pnpm typecheck
pnpm sim:season           # simulate a Season, print tables
```

## Git

See `GIT_CONVENTION.md`. Branches `feat/task-{number}-{description}`, commits
reference `refs #NN` during work and `closes #NN` on the final commit, one PR
per task.
