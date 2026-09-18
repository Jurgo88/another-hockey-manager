#!/usr/bin/env node
/**
 * Creates (idempotently) the labels and milestones for this repository.
 *
 * Follows the project script conventions: dotenv/config, GitHub REST via
 * fetch, --dry-run support, 500 ms between requests.
 *
 *   node scripts/github/setup-labels-milestones.mjs --dry-run
 *   node scripts/github/setup-labels-milestones.mjs
 *
 * Requires in .env:
 *   GITHUB_TOKEN=ghp_...            (scope: repo)
 *   GITHUB_OWNER=Jurgo88
 *   GITHUB_REPO=another-hockey-manager
 */
import 'dotenv/config'

const DRY_RUN = process.argv.includes('--dry-run')
const REQUEST_DELAY_MS = 500

const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env

if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
  console.error('Missing GITHUB_TOKEN, GITHUB_OWNER or GITHUB_REPO in environment (.env).')
  process.exit(1)
}

const API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`

const LABELS = [
  // Area
  { name: 'area: engine', color: '1d4ed8', description: 'Shift loop, possession, shot resolution' },
  { name: 'area: domain', color: '3b82f6', description: 'Entities, attributes, event schema' },
  { name: 'area: stats', color: '60a5fa', description: 'Folds over the event stream' },
  { name: 'area: rng', color: '93c5fd', description: 'Deterministic randomness' },
  { name: 'area: cli', color: 'bfdbfe', description: 'Command-line entry points' },
  { name: 'area: web', color: '0e7490', description: 'Nuxt application (phase 1+)' },
  { name: 'area: spec', color: '6b7280', description: 'Specification and ADRs' },
  { name: 'area: ci', color: '9ca3af', description: 'Tooling and pipelines' },

  // Type
  { name: 'type: feature', color: '16a34a', description: 'New capability' },
  { name: 'type: bug', color: 'dc2626', description: 'Incorrect behaviour' },
  { name: 'type: refactor', color: 'ca8a04', description: 'Behaviour-preserving change' },
  { name: 'type: test', color: '65a30d', description: 'Test coverage or harness' },
  { name: 'type: docs', color: '94a3b8', description: 'Documentation' },
  { name: 'type: calibration', color: '7c3aed', description: 'Tuning engine parameters to hit realism targets' },

  // Priority
  { name: 'priority: high', color: 'b91c1c', description: 'Blocks the current phase gate' },
  { name: 'priority: medium', color: 'f59e0b', description: 'Wanted in the current phase' },
  { name: 'priority: low', color: 'fbbf24', description: 'Nice to have' },

  // State
  { name: 'state: blocked', color: '000000', description: 'Cannot proceed - dependency named in the issue' },
  { name: 'state: needs decision', color: 'a21caf', description: 'Waiting on an architecture decision' },

  // Gate
  { name: 'gate: realism', color: 'be123c', description: 'Required for the phase 0 realism gate' },
]

const MILESTONES = [
  {
    title: 'Phase 0 - Engine',
    description:
      'Deterministic match and season simulation with a green realism suite. No web application, no database.',
  },
  {
    title: 'Phase 1 - Playable season',
    description: 'One Club, one Season, Nuxt + Supabase. Gate: 20 voluntary consecutive Fixtures.',
  },
  {
    title: 'Phase 2 - Multiple seasons',
    description: 'Ageing, development, retirement, draft. Gate: a plausible ten-Season history.',
  },
  {
    title: 'Phase 3 - Roster movement',
    description: 'Contracts, wages, transfers, scouting. Gate: bounded wage inflation over ten Seasons.',
  },
  {
    title: 'Phase 4 - Other managers',
    description: 'Seasonal cohort leagues. Gate: a cohort completes a Season with 8+ human Managers.',
  },
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function gh(path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status}: ${body}`)
  }

  return response.status === 204 ? null : response.json()
}

async function listAll(path) {
  const items = []
  for (let page = 1; ; page++) {
    const batch = await gh(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`)
    items.push(...batch)
    if (batch.length < 100) break
    await sleep(REQUEST_DELAY_MS)
  }
  return items
}

async function syncLabels() {
  const existing = new Map((await listAll('/labels')).map((label) => [label.name, label]))
  let created = 0
  let updated = 0
  let unchanged = 0

  for (const label of LABELS) {
    const current = existing.get(label.name)

    if (!current) {
      console.log(`  + ${label.name}`)
      if (!DRY_RUN) {
        await gh('/labels', { method: 'POST', body: JSON.stringify(label) })
        await sleep(REQUEST_DELAY_MS)
      }
      created++
      continue
    }

    const needsUpdate =
      current.color !== label.color || (current.description ?? '') !== label.description

    if (needsUpdate) {
      console.log(`  ~ ${label.name}`)
      if (!DRY_RUN) {
        await gh(`/labels/${encodeURIComponent(label.name)}`, {
          method: 'PATCH',
          body: JSON.stringify({ new_name: label.name, color: label.color, description: label.description }),
        })
        await sleep(REQUEST_DELAY_MS)
      }
      updated++
    } else {
      unchanged++
    }
  }

  console.log(`  labels: ${created} created, ${updated} updated, ${unchanged} unchanged`)
}

async function syncMilestones() {
  const existing = new Map(
    (await listAll('/milestones?state=all')).map((milestone) => [milestone.title, milestone]),
  )
  let created = 0
  let unchanged = 0

  for (const milestone of MILESTONES) {
    if (existing.has(milestone.title)) {
      unchanged++
      continue
    }

    console.log(`  + ${milestone.title}`)
    if (!DRY_RUN) {
      await gh('/milestones', { method: 'POST', body: JSON.stringify(milestone) })
      await sleep(REQUEST_DELAY_MS)
    }
    created++
  }

  console.log(`  milestones: ${created} created, ${unchanged} unchanged`)
}

async function main() {
  console.log(`${DRY_RUN ? '[dry-run] ' : ''}${GITHUB_OWNER}/${GITHUB_REPO}`)
  console.log('labels')
  await syncLabels()
  console.log('milestones')
  await syncMilestones()
  console.log(DRY_RUN ? 'Dry run complete. No changes were made.' : 'Done.')
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
