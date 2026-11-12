/**
 * A Player's career over the career's finished Seasons (ADR-025), and the
 * Season under way, for any Player the career has known, gone or not.
 */
export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const { careerId, current, state } = await requireCareer(manager.id)
  const playerId = getRouterParam(event, 'id') ?? ''
  const identity = await loadIdentity(careerId, playerId)
  if (!identity) throw createError({ statusCode: 404, message: 'errors.noPlayer' })

  const [records, rows] = await Promise.all([
    loadOwnRecords(careerId),
    loadPlayerRows(careerId, playerId),
  ])
  const career = careerOf(records, rows, playerId, identity.goalie)
  const counts = (totals: typeof state.totals.regular) =>
    (identity.goalie ? totals.goalies[playerId] : totals.skaters[playerId]) ?? null
  // The Season under way is in its state, not yet in a record.
  const now =
    current.phase === 'season'
      ? { regular: counts(state.totals.regular), playoffs: counts(state.totals.playoffs) }
      : null
  const club = (id: string) => ({
    clubId: id,
    club: state.clubs.find((c) => c.id === id)?.code ?? id,
  })

  return {
    id: playerId,
    name: identity.name,
    goalie: identity.goalie,
    lines: career.lines.map((line) => ({ ...line, ...club(line.clubId) })),
    totals: career.totals,
    current:
      now && (now.regular ?? now.playoffs)
        ? { year: state.year, ...now, ...club((now.regular ?? now.playoffs)!.clubId) }
        : null,
  }
})
