---
name: ship
description: Take a change in this repo from branch to pull request - branch and commit conventions, separate spec commits, the Definition of Done, then push and open the issue or PR through the GitHub API when the gh CLI is not installed. Use when starting a task from an issue, committing, opening an issue, or opening a PR in another-hockey-manager.
---

# Shipping a change

`GIT_CONVENTION.md` is the source of truth; this is the working checklist.
Commit, push or open anything only when the user asked for it.

## Start

- Read the issue: `node .claude/skills/ship/scripts/gh.mjs show <number>`.
- Plan before code, and get approval (CLAUDE.md). Architecture decisions are the
  author's: options with a recommendation, never picked silently.
- Branch from an up-to-date `main`: `feat/task-{n}-{short-description}`,
  `fix/task-{n}-...`, or `chore/task-{n}-...` when there is an issue.

## Commits

```
<type>(<scope>): <subject, imperative, lowercase, under 72 chars>

<why, wrapped at about 75 columns>

refs #NN

Co-Authored-By: <the attribution line the session gives>
```

- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`. Scopes:
  `sim`, `engine`, `stats`, `domain`, `rng`, `cli`, `web`, `spec`, `ci`, and
  module names such as `draft` or `leave`.
- `refs #NN` while working; the **last** commit says `closes #NN`. Reword it
  with `git commit --amend` before pushing, not after.
- **A change under `.clauden/` is its own `docs(spec)` commit**, apart from
  code. Contradicting an accepted ADR means a new ADR; extending it means a
  dated `## Amendment, YYYY-MM-DD: ... (#NN)` at its end.
- Write commit messages to a file and use `git commit -F <file>` when they
  hold quotes or backticks.

## Definition of done

All three, green, before the PR:

```sh
npx pnpm typecheck
npx pnpm lint
npx pnpm test        # every tier: unit, realism, longrun, in both packages
```

- `pnpm test:unit` is for the loop, not the gate.
- A red realism or long-run band is a failed build. Calibrate (`calibrate`
  skill); widening a band or moving a target is the author's decision.
- Realism and long-run tiers read Seasons cached under a hash of
  `packages/sim/src` and `packages/sim/test/support`. Any change there, even a
  comment, simulates again (about 95 s). Delete `packages/sim/.cache/` if a
  cache is ever in doubt.
- `npx prettier --check <changed files>`: the repo has older unformatted files;
  check only what you touched.

## Issues and PRs without `gh`

`gh` is not installed. `scripts/gh.mjs` uses the REST API with the credential
git already stores, for the repo of `origin`:

```sh
node .claude/skills/ship/scripts/gh.mjs issue "<title>" body.md "type: test,priority: low"
git push -u origin <branch>
node .claude/skills/ship/scripts/gh.mjs pr "<title, as the issue>" body.md
node .claude/skills/ship/scripts/gh.mjs labels
```

Write bodies to files in the scratchpad. Labels in use: `area: *`,
`type: feature|bug|calibration|test|docs|refactor`, `priority: high|medium|low`,
`gate: realism`, `state: needs decision`.

An issue body: one line of context (what it follows, who decided what and
when), then `## What`, `## Why`, `## Done when`.

A PR body:

- what changed, by mechanism, with the ADR and invariant ids it touches
  (`ADR-028`, `D-08`);
- what is reported rather than asserted, and where it is followed up;
- `## Checks`: the commands run and the test counts;
- `closes #NN`, then the PR attribution line the session gives.

## Windows notes

- Git Bash rewrites arguments that start with `/` into Windows paths. Set
  `MSYS_NO_PATHCONV=1` when passing API paths or similar to a program.
- `core.autocrlf` is true and files on disk mix LF and CRLF. The Edit tool
  handles both. In a script, read the file, note whether it has `\r\n`,
  normalise to `\n`, edit, and write it back as it was. Use
  `git diff --ignore-cr-at-eol` to review.
- Heredocs with nested quotes can break the Bash tool; write files with the
  Write tool instead.
