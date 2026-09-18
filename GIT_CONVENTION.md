# Git conventions

## Branches

```
feat/task-{number}-{short-description}
fix/task-{number}-{short-description}
chore/{short-description}
```

`{number}` is the GitHub issue number. Lowercase, hyphen-separated
description.

```
feat/task-12-shift-loop
fix/task-31-powerplay-overlap
```

## Commits

Conventional Commits, with issue references:

```
<type>(<scope>): <subject>

refs #12
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`.
Scopes: `sim`, `engine`, `stats`, `domain`, `rng`, `cli`, `web`, `spec`, `ci`.

Use `refs #NN` on work-in-progress commits and `closes #NN` on the final
commit of a task, so the issue closes when the PR merges.

```
feat(engine): resolve shot outcomes against goalie attributes

refs #18
```

Subject in imperative mood, lowercase, no trailing period, under 72
characters.

## Pull requests

One PR per task. Title matches the issue. The body states what changed, which
requirement or decision identifiers it touches (`FR-05`, `D-03`), and whether
the realism suite was run.

`closes #NN` in the final commit or the PR body.

## Specification changes

A change to `.clauden/` is its own commit with scope `spec`, separate from
implementation. If a change contradicts an accepted ADR, supersede the ADR
with a new one rather than editing it in place - accepted ADRs are a record of
what was decided and why, not current-state documentation.

## Definition of done before opening a PR

```
pnpm typecheck
pnpm lint
pnpm test
```

All green. A red realism band is not a passing build.
