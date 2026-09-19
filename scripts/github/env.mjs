/**
 * Resolves GitHub credentials and target repository for the scripts in this
 * folder.
 *
 * Precedence, per value:
 *   1. an environment variable (typically from .env)
 *   2. the local toolchain - `gh` for the token and owner, `git` for the repo
 *
 * The fallback is the point. The GitHub CLI already holds a token for the
 * logged-in account, so storing a copy in .env creates a second place a
 * credential lives without adding any capability. Asking `gh` for it at run
 * time keeps the secret out of the working tree entirely, and it cannot go
 * stale the way a copied token can.
 *
 * Nothing here is written to disk and nothing is logged.
 */
import { execSync } from 'node:child_process'

/**
 * Runs a fixed command string and returns its trimmed stdout, or undefined if
 * the command is missing or fails.
 *
 * `execSync` with a single command string is used rather than `execFileSync`
 * with an argument array plus `shell: true`. The latter is deprecated in
 * Node 22 (DEP0190) because arguments are concatenated rather than escaped.
 * That warning does not apply here - every command below is a hardcoded
 * literal with no interpolation - but a script that prints a deprecation
 * notice on every run trains people to ignore warnings, so it is avoided.
 *
 * The shell is needed on Windows, where `gh` and `git` are shims that
 * `CreateProcess` will not resolve on its own.
 */
function tryCommand(command) {
  try {
    const output = execSync(command, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const trimmed = output.trim()
    return trimmed.length > 0 ? trimmed : undefined
  } catch {
    return undefined
  }
}

function repoFromGitRemote() {
  const url = tryCommand('git remote get-url origin')
  if (!url) return undefined

  // git@github.com:owner/repo.git  or  https://github.com/owner/repo.git
  const match = /[:/]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(url)
  return match ? { owner: match[1], repo: match[2] } : undefined
}

export function resolveGitHub() {
  const remote = repoFromGitRemote()

  const token = process.env.GITHUB_TOKEN || tryCommand('gh auth token')
  const owner =
    process.env.GITHUB_OWNER || remote?.owner || tryCommand('gh api user --jq .login')
  const repo = process.env.GITHUB_REPO || remote?.repo

  const missing = []
  if (!token) missing.push('token')
  if (!owner) missing.push('owner')
  if (!repo) missing.push('repository')

  if (missing.length > 0) {
    console.error(`Could not determine: ${missing.join(', ')}.`)
    console.error('')
    console.error('Either sign in to the GitHub CLI once, which needs no .env at all:')
    console.error('  gh auth login')
    console.error('')
    console.error('Or set GITHUB_TOKEN, GITHUB_OWNER and GITHUB_REPO in .env.')
    console.error('')
    console.error('For a preview that needs neither: pnpm gh:issues:plan')
    process.exit(1)
  }

  return {
    token,
    owner,
    repo,
    api: `https://api.github.com/repos/${owner}/${repo}`,
    /** Where the token came from, for a one-line notice. Never the token itself. */
    tokenSource: process.env.GITHUB_TOKEN ? '.env' : 'gh auth token',
  }
}
