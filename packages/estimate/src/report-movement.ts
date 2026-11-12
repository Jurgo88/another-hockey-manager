import type { CapView } from './capwages/pages.js'
import {
  GROUPS,
  contractMix,
  joinView,
  payrolls,
  reSigning,
  regularsOf,
  shareByAge,
  shareByStatus,
  shareByTenth,
  termsAtSigning,
  type Group,
} from './contracts.js'
import { clubChanges, continuity, midSeasonMoves, type ShareRow } from './movement.js'
import type { MovementHistory, SeasonPlayer } from './nhl/movement.js'

/** The #122 measurements as markdown for `07-league-over-time.md`. */

const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`
const span = (season: number) => `${season}-${String(season + 1).slice(2)}`
const shareTable = (rows: readonly ShareRow[], head: string) => [
  `| Group | Players | ${head} | Share |`,
  '| --- | --- | --- | --- |',
  ...rows.map((r) => `| ${r.group} | ${r.players} | ${r.count} | ${pct(r.share)} |`),
]

export function movementReport(history: MovementHistory): string {
  const seasons = [...new Set(history.players.map((p) => p.season))].sort()
  const changes = clubChanges(history)
  const moves = midSeasonMoves(history)
  const kept = continuity(history)
  const total = moves.byTenth.reduce((a, b) => a + b, 0)
  return [
    `## Movement, NHL ${span(seasons[0]!)} to ${span(seasons.at(-1)!)} (pnpm sim:measure --movement)`,
    '',
    '### Changing Club between seasons (20 or more Fixtures, and played the next)',
    '',
    ...shareTable([changes.all, ...changes.byAge], 'Another Club'),
    '',
    '### Moving during a season',
    '',
    `Of Players with 20 or more Fixtures, ${pct(moves.severalClubs.share)} played for more than one Club (${moves.severalClubs.count} of ${moves.severalClubs.players}).`,
    `Of ${total} moves, ${pct(moves.nearDeadline.share)} came in the 14 days before the deadline and ${pct(moves.afterDeadline.share)} after it.`,
    '',
    '| Tenth of the regular season | Moves | Share |',
    '| --- | --- | --- |',
    ...moves.byTenth.map((n, i) => `| ${i + 1} | ${n} | ${pct(n / (total || 1))} |`),
    '',
    '| Season | Moves | In the 14 days before the deadline |',
    '| --- | --- | --- |',
    ...moves.perSeason.map((r) => `| ${span(r.season)} | ${r.moves} | ${r.nearDeadline} |`),
    '',
    '### Continuity',
    '',
    `A Club's Skater ice time played by Skaters who played for it the season before: ${pct(kept.mean)} on average over ${kept.clubSeasons} Club-seasons, from ${pct(kept.min)} to ${pct(kept.max)}.`,
  ].join('\n')
}

const groupLabel: Record<Group, string> = {
  forward: 'Forwards',
  defence: 'Defencemen',
  goalie: 'Goalies',
}

export function contractsReport(
  views: readonly CapView[],
  players: readonly SeasonPlayer[],
): string {
  const measured = views.filter((v) => players.some((p) => p.season === v.season))
  const joins = measured.map((v) => ({ view: v, ...joinView(v, players) }))
  const regulars = joins.map((j) => regularsOf(j.view, j.joined))
  const out: string[] = ['## Contracts, CapWages (pnpm sim:measure --contracts)', '']

  out.push(
    ...joins.map((j, i) => {
      const nhlRegulars = players.filter(
        (p) => p.season === j.view.season && p.matchesPlayed >= 20,
      ).length
      return `${span(j.view.season)}: ${j.view.clubs.length} Clubs, ${new Set(j.view.players.map((p) => p.slug)).size} Players under contract, ${j.joined.length} matched to NHL Players of the season. Of ${nhlRegulars} NHL Players with 20 or more Fixtures, ${regulars[i]!.length} are matched with a contract for the season.`
    }),
    '',
  )

  for (const group of GROUPS) {
    const rows = regulars.map((r) => shareByTenth(r, group))
    out.push(
      `### ${groupLabel[group]}: cap share by tenth of role (20 or more Fixtures)`,
      '',
      `| Tenth | ${measured.map((v) => `${span(v.season)} mean | median`).join(' | ')} | Change in the mean |`,
      `| --- | ${measured.map(() => '--- | ---').join(' | ')} | --- |`,
      ...Array.from({ length: 10 }, (_, t) => {
        const cells = rows.map((r) => `${pct(r[t]!.mean, 2)} | ${pct(r[t]!.median, 2)}`).join(' | ')
        const [a, b] = [rows[0]?.[t]?.mean ?? 0, rows.at(-1)?.[t]?.mean ?? 0]
        return `| ${t + 1} | ${cells} | ${a ? pct(b / a - 1) : '-'} |`
      }),
      '',
    )
  }

  const last = joins.length - 1
  out.push(
    `### Skaters: cap share by third of role and status, ${span(measured[last]!.season)}`,
    '',
    '| Third | Status | Players | Mean share |',
    '| --- | --- | --- | --- |',
    ...shareByStatus(regulars[last]!).map(
      (r) => `| ${r.third + 1} | ${r.status} | ${r.players} | ${pct(r.mean, 2)} |`,
    ),
    '',
    `### Cap share by age, ${span(measured[last]!.season)}`,
    '',
    '| Age | Players | Mean share | Mean tenth of role |',
    '| --- | --- | --- | --- |',
    ...shareByAge(regulars[last]!, measured[last]!.season).map(
      (r) => `| ${r.group} | ${r.players} | ${pct(r.mean, 2)} | ${r.meanTenth.toFixed(1)} |`,
    ),
    '',
    '### Contracts and payrolls',
    '',
    '| Season | Regulars | At the minimum | Entry-level | Restricted | Unrestricted | Payroll, mean | SD | Lowest | Highest | Floor | Clubs within 3 pp of the floor |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...joins.map((j, i) => {
      const mix = contractMix(regulars[i]!, j.view)
      const pay = payrolls(j.view)
      // Earlier pages do not name a contract's type, so entry-level contracts cannot be told apart.
      const typed = j.view.players.flatMap((p) => p.contracts).filter((c) => c.type !== '').length
      const known = typed * 2 > j.view.players.flatMap((p) => p.contracts).length
      return `| ${span(j.view.season)} | ${mix.regulars} | ${pct(mix.atMinimum)} | ${known ? pct(mix.entryLevel) : 'n/a'} | ${pct(mix.restricted)} | ${pct(mix.unrestricted)} | ${pct(pay.mean)} | ${pct(pay.sd)} | ${pct(pay.min)} | ${pct(pay.max)} | ${pct(pay.floor)} | ${pay.nearFloor} |`
    }),
    '',
  )

  for (const view of views.slice(1)) {
    const terms = termsAtSigning(view, players)
    out.push(
      `### Term of standard contracts beginning in ${span(view.season)}, signed by regulars of ${span(view.season - 1)}`,
      '',
      '| Age at the start, or role | Contracts | Median years | Mean years | One year | Five or more |',
      '| --- | --- | --- | --- | --- | --- |',
      ...[...terms.byAge, ...terms.byRole].map(
        (r) =>
          `| ${r.group} | ${r.contracts} | ${r.median} | ${r.mean.toFixed(1)} | ${pct(r.oneYear)} | ${pct(r.fivePlus)} |`,
      ),
      '',
    )
  }

  out.push('### Re-signing: regulars whose contract ended with the season', '')
  out.push(
    '| Season | Status | Players | Same Club | Another Club | None yet |',
    '| --- | --- | --- | --- | --- | --- |',
  )
  joins.forEach((j, i) => {
    const after = views.find((v) => v.season === j.view.season + 1)
    if (!after) return
    for (const r of reSigning(j.view, after, regulars[i]!)) {
      out.push(
        `| ${span(j.view.season)} | ${r.status} | ${r.players} | ${pct(r.sameClub / (r.players || 1))} | ${pct(r.otherClub / (r.players || 1))} | ${pct(r.none / (r.players || 1))} |`,
      )
    }
  })
  return out.join('\n')
}
