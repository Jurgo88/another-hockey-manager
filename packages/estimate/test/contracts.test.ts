import { describe, expect, it } from 'vitest'
import {
  clubPageOf,
  dollars,
  isoDate,
  pagePropsOf,
  viewOf,
  type CapView,
} from '../src/capwages/pages.js'
import {
  contractMix,
  joinView,
  nameKey,
  payrolls,
  reSigning,
  regularsOf,
  shareByTenth,
  termsAtSigning,
} from '../src/contracts.js'
import type { SeasonPlayer } from '../src/nhl/movement.js'
import { withContracts } from '../src/roster-contracts.js'
import type { CompetitionRosters } from '@ahm/sim'

/** CapWages' field for the Club that signed a contract: its word, not this domain's (D-07). */
const SIGNED_WITH = 'signingTeam'

const contract = (seasons: [string, string][], extra: Record<string, string> = {}) => ({
  type: 'Standard Contract',
  [SIGNED_WITH]: 'Toronto Maple Leafs',
  expiryStatus: 'UFA',
  ...extra,
  details: seasons.map(([season, capHit]) => ({ season, capHit })),
})

const page = (players: unknown[], payroll = 80_000_000) => ({
  teamMetadata: { tricode: 'TOR', name: 'Toronto Maple Leafs' },
  teamSummary: { upperLimit: 100_000_000, lowerLimit: 70_000_000, capHit: { total: payroll } },
  data: {
    roster: { forwards: players },
    'dead cap': {
      buyouts: [{ name: 'Gone, Bought', slug: 'gone', born: 'Jan. 1, 1990', contracts: [] }],
    },
  },
})

const capPlayer = (slug: string, name: string, born: string, contracts: unknown[], pos = 'C') => ({
  slug,
  name,
  born,
  pos,
  contracts,
})

const nhl = (
  playerId: number,
  lastName: string,
  birthDate: string,
  toiPerMatch: number,
  season = 2025,
): SeasonPlayer => ({
  season,
  playerId,
  position: 'C',
  lastName,
  birthDate,
  matchesPlayed: 60,
  toiPerMatch,
})

describe('reading a CapWages page', () => {
  it('reads dollars and dates as the pages write them', () => {
    expect(dollars('$13,250,000')).toBe(13_250_000)
    expect(isoDate('Sep. 17, 1997')).toBe('1997-09-17')
    expect(isoDate('May 3, 2001')).toBe('2001-05-03')
    expect(isoDate('June 30, 1999')).toBe('1999-06-30')
  })

  it('finds the embedded data of a page', () => {
    const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { teamName: 'X' } } })}</script></html>`
    expect(pagePropsOf(html)).toEqual({ teamName: 'X' })
    expect(pagePropsOf('<html></html>')).toBeNull()
  })

  it('keeps Players under contract and leaves dead money out', () => {
    const { club, players } = clubPageOf(
      page([
        capPlayer('a', 'Slafkovský, Juraj', 'Mar. 30, 2004', [
          contract([['2025-26', '$7,600,000']]),
        ]),
      ]),
    )
    expect(club).toEqual({
      club: 'TOR',
      name: 'Toronto Maple Leafs',
      upperLimit: 1e8,
      lowerLimit: 7e7,
      payroll: 8e7,
    })
    expect(players.map((p) => p.slug)).toEqual(['a'])
    expect(players[0]).toMatchObject({ lastName: 'Slafkovský', birthDate: '2004-03-30' })
    expect(players[0]!.contracts[0]!.seasons).toEqual([{ season: 2025, capHit: 7_600_000 }])
  })
})

describe('contracts joined with NHL seasons', () => {
  const view: CapView = viewOf(2025, [
    page([
      capPlayer('a', 'Alpha, A', 'Jan. 1, 1995', [
        contract([['2025-26', '$10,000,000']], { expiryStatus: 'UFA' }),
      ]),
      capPlayer('b', 'Béta, B', 'Feb. 2, 1996', [
        contract([['2025-26', '$775,000']], { expiryStatus: 'RFA' }),
      ]),
      capPlayer('c', 'Gamma, C', 'Mar. 3, 2004', [
        contract(
          [
            ['2025-26', '$950,000'],
            ['2026-27', '$950,000'],
          ],
          { type: 'Entry-Level Contract', expiryStatus: 'RFA' },
        ),
      ]),
      capPlayer('d', 'Nobody, D', 'Apr. 4, 1990', [contract([['2025-26', '$1,000,000']])]),
    ]),
  ])
  const season = [
    nhl(1, 'Alpha', '1995-01-01', 1200),
    nhl(2, 'Beta', '1996-02-02', 600),
    nhl(3, 'Gammas', '2004-03-03', 900),
  ]

  it('matches by birth date and last name, accents dropped, or by birth date alone', () => {
    expect(nameKey('Béta')).toBe('beta')
    const { joined, unmatched } = joinView(view, season)
    expect(joined.map((j) => j.nhl.playerId).sort()).toEqual([1, 2, 3])
    expect(unmatched).toBe(1)
  })

  it('ranks regulars by ice time and reads the share of the cap', () => {
    const regulars = regularsOf(view, joinView(view, season).joined)
    const rows = shareByTenth(regulars, 'forward')
    expect(rows[0]).toMatchObject({ players: 1, mean: 0.1 })
    expect(regulars.find((r) => r.joined.nhl.playerId === 2)!.tenth).toBe(6)
    expect(contractMix(regulars, view)).toMatchObject({
      regulars: 3,
      atMinimum: 1 / 3,
      entryLevel: 1 / 3,
    })
  })

  it('summarises payrolls against the cap', () => {
    expect(payrolls(view)).toMatchObject({ clubs: 1, mean: 0.8, floor: 0.7, nearFloor: 0 })
  })

  it('reads terms of standard contracts that begin in the season, signed by the regulars of the season before', () => {
    const before = [
      nhl(1, 'Alpha', '1995-01-01', 1200, 2024),
      nhl(2, 'Beta', '1996-02-02', 600, 2024),
    ]
    const terms = termsAtSigning(view, before)
    // Alpha and Beta were regulars; Gamma's is entry-level, and Nobody did not play.
    expect(terms.byAge.find((t) => t.group === '28-30')).toMatchObject({ contracts: 2, median: 1 })
    expect(terms.byRole.map((t) => t.contracts)).toEqual([1, 1, 0])
  })

  it('follows expiring regulars into the next view', () => {
    const after = viewOf(2026, [
      page([
        capPlayer('a', 'Alpha, A', 'Jan. 1, 1995', [
          contract([['2026-27', '$9,000,000']], { [SIGNED_WITH]: 'Boston Bruins' }),
        ]),
        // An earlier page may leave the signing Club out: the Club that lists him stands in.
        capPlayer('b', 'Béta, B', 'Feb. 2, 1996', [
          contract([['2026-27', '$1,000,000']], { [SIGNED_WITH]: '' }),
        ]),
      ]),
    ])
    const rows = reSigning(view, after, regularsOf(view, joinView(view, season).joined))
    expect(rows).toEqual([
      { status: 'restricted', players: 1, sameClub: 1, otherClub: 0, none: 0 },
      { status: 'unrestricted', players: 1, sameClub: 0, otherClub: 1, none: 0 },
    ])
  })
})

describe('real contracts on estimated Rosters (#125)', () => {
  const view = viewOf(2025, [
    page([
      capPlayer('one', 'One, First', 'Jan. 1, 1995', [
        contract([
          ['2024-25', '$5,000,000'],
          ['2025-26', '$6,000,000'],
          ['2026-27', '$6,000,000'],
        ]),
      ]),
      capPlayer('kid', 'Kid, Young', 'Mar. 3, 2005', [
        contract([['2025-26', '$950,000']], {
          type: 'Entry-Level Contract',
          expiryStatus: 'RFA',
        }),
      ]),
    ]),
  ])
  const players = [nhl(1, 'One', '1995-01-01', 1000), nhl(2, 'Kid', '2005-03-03', 700)]
  const skater = (id: string) => ({ id, kind: 'skater' })
  const rosters = {
    structure: {},
    clubs: [
      { id: 'tor', skaters: [skater('nhl-1'), skater('nhl-2'), skater('tor-fill-1')], goalies: [] },
    ],
  } as unknown as CompetitionRosters

  it('gives each matched Player the contract covering the season, as a share of its cap', () => {
    const signed = withContracts(rosters, view, players)
    expect(signed.upperLimit).toBe(100_000_000)
    expect(signed).toMatchObject({ contracted: 2, players: 3 })
    const [one, kid, fill] = signed.rosters.clubs[0]!.skaters
    expect(one!.contract).toEqual({
      capHit: 0.06,
      years: 2,
      kind: 'standard',
      onExpiry: 'unrestricted',
    })
    expect(kid!.contract).toEqual({
      capHit: 0.0095,
      years: 1,
      kind: 'entry-level',
      onExpiry: 'restricted',
    })
    expect(fill!.contract).toBeUndefined()
  })
})
