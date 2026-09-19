#!/usr/bin/env node
/**
 * Prints what create-phase-0-issues.mjs would create.
 *
 * No network, no token, no GitHub account needed - it imports the issue list
 * and renders it. Use this to review the plan before running the real
 * --dry-run, which additionally checks what already exists in the repository.
 *
 *   node scripts/github/print-issue-plan.mjs
 *   node scripts/github/print-issue-plan.mjs --bodies
 */
import { ISSUES } from './create-phase-0-issues.mjs'
import { LABELS, MILESTONES } from './setup-labels-milestones.mjs'

const SHOW_BODIES = process.argv.includes('--bodies')

const byKey = new Map(ISSUES.map((issue) => [issue.key, issue]))

/**
 * Fails loudly on a typo in a `blockedBy` key, a dependency cycle, or a
 * milestone or label an issue references that the setup script does not
 * create.
 *
 * That last check exists because it was missed: an issue referenced
 * "Phase 0.5 - Real roster import" while the setup script only created
 * phases 0 through 4, and the mismatch surfaced as a failed run against the
 * live repository instead of here.
 */
function validate() {
  const problems = []

  const knownMilestones = new Set(MILESTONES.map((m) => m.title))
  const knownLabels = new Set(LABELS.map((l) => l.name))

  for (const issue of ISSUES) {
    if (!knownMilestones.has(issue.milestone)) {
      problems.push(`${issue.key}: milestone "${issue.milestone}" is not created by setup`)
    }
    for (const label of issue.labels) {
      if (!knownLabels.has(label)) {
        problems.push(`${issue.key}: label "${label}" is not created by setup`)
      }
    }
    for (const key of issue.blockedBy) {
      if (!byKey.has(key)) problems.push(`${issue.key}: unknown blockedBy key "${key}"`)
    }
  }

  const state = new Map()
  const visit = (key, trail) => {
    if (state.get(key) === 'done') return
    if (state.get(key) === 'open') {
      problems.push(`dependency cycle: ${[...trail, key].join(' -> ')}`)
      return
    }
    state.set(key, 'open')
    for (const next of byKey.get(key)?.blockedBy ?? []) visit(next, [...trail, key])
    state.set(key, 'done')
  }
  for (const issue of ISSUES) visit(issue.key, [])

  const titles = ISSUES.map((i) => i.title)
  const duplicates = titles.filter((t, i) => titles.indexOf(t) !== i)
  for (const title of new Set(duplicates)) problems.push(`duplicate title: "${title}"`)

  return problems
}

/** Groups issues into waves: everything in a wave can be worked in parallel. */
function waves() {
  const remaining = new Set(ISSUES.map((i) => i.key))
  const placed = new Set()
  const result = []

  while (remaining.size > 0) {
    const wave = [...remaining].filter((key) =>
      (byKey.get(key)?.blockedBy ?? []).every((dep) => placed.has(dep)),
    )

    if (wave.length === 0) {
      result.push(['<unreachable - check for a cycle>'])
      break
    }

    for (const key of wave) {
      remaining.delete(key)
    }
    for (const key of wave) {
      placed.add(key)
    }
    result.push(wave)
  }

  return result
}

const problems = validate()

if (problems.length > 0) {
  console.error('Plan is invalid:\n')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log(`Offline plan preview - ${ISSUES.length} issues, no network calls made.\n`)

for (const milestone of new Set(ISSUES.map((i) => i.milestone))) {
  const group = ISSUES.filter((i) => i.milestone === milestone)
  console.log(`${milestone}  (${group.length} issues)`)
  console.log('-'.repeat(72))

  for (const issue of group) {
    const blocked = issue.blockedBy.length
      ? `  <- blocked by ${issue.blockedBy.join(', ')}`
      : '  <- ready to start'
    console.log(`  ${issue.title}`)
    console.log(`    labels: ${issue.labels.join(', ')}`)
    console.log(`    ${blocked.trim()}`)
    console.log(`    body: ${issue.body.split('\n').length} lines`)
    if (SHOW_BODIES) {
      console.log()
      for (const line of issue.body.split('\n')) console.log(`      | ${line}`)
    }
    console.log()
  }
}

console.log('Work order - each wave can be done in parallel')
console.log('-'.repeat(72))
waves().forEach((wave, index) => {
  console.log(`  wave ${index + 1}:  ${wave.join(', ')}`)
})

const labelUse = new Map()
for (const issue of ISSUES) {
  for (const label of issue.labels) labelUse.set(label, (labelUse.get(label) ?? 0) + 1)
}

console.log('\nLabels used')
console.log('-'.repeat(72))
for (const [label, count] of [...labelUse].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(2)}x  ${label}`)
}

console.log('\nNo changes were made. To check against the live repository:')
console.log('  pnpm gh:issues:dry')
