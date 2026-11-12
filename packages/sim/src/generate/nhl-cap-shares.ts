/**
 * Cap hits of NHL regulars (20 or more Fixtures), 2025-26, from CapWages (#122,
 * #125): shares of the cap by tenth of role in each group, top first, and by
 * third of role who holds an entry-level or restricted contract, what a
 * restricted Skater is paid against an unrestricted one, and how long a new
 * standard contract runs. The generator prices a league's opening contracts
 * from it (ADR-030). Written by `pnpm sim:measure --contracts --module`.
 */
export const NHL_CAP_SHARES = {
  season: 2025,
  regularsPerClub: { forward: 14.625, defence: 7.4375, goalie: 2.0625 },
  byTenth: {
    forward: [0.0849, 0.0633, 0.0538, 0.0409, 0.0303, 0.0238, 0.0213, 0.0181, 0.0142, 0.0108],
    defence: [0.0794, 0.067, 0.0583, 0.0451, 0.0337, 0.0296, 0.0246, 0.0175, 0.0116, 0.0114],
    goalie: [0.0652, 0.0697, 0.0606, 0.035, 0.0332, 0.0266, 0.0308, 0.0266, 0.0202, 0.0225],
  },
  byThird: [
    { entryLevel: 0.0775, restricted: 0.081, restrictedRatio: 0.5027, term: 4.9863 },
    { entryLevel: 0.2038, restricted: 0.1754, restrictedRatio: 0.5949, term: 2.5357 },
    { entryLevel: 0.1943, restricted: 0.1754, restrictedRatio: 0.6065, term: 1.619 },
  ],
} as const
