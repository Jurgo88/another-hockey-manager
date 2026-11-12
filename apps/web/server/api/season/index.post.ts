import { randomInt } from 'node:crypto'
import { NHL_2026_27_CLUB_SEEDS, startSeason } from '@ahm/sim'

const MAX_SEED = 2 ** 31

/** Starts a new career, on generated Rosters or on the server's roster file (ADR-003). */
export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const { clubId, source = 'generated' } = await readBody<Record<string, unknown>>(event)
  if (!NHL_2026_27_CLUB_SEEDS.some((club) => club.id === clubId)) {
    throw createError({ statusCode: 400, message: 'errors.unknownClub' })
  }
  if (!isRosterSource(source)) {
    throw createError({ statusCode: 400, message: 'errors.unknownRosterSource' })
  }
  const provider = source === 'file' ? fileRosterProvider() : undefined
  if (provider === null) throw createError({ statusCode: 400, message: 'errors.noRosterFile' })

  const state = await startSeason(randomInt(MAX_SEED), provider)
  await startCareer(manager.id, clubId as string, state, source)
  return { ok: true }
})
