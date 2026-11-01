import { randomInt } from 'node:crypto'
import { NHL_2026_27_CLUB_SEEDS, startSeason } from '@ahm/sim'

const MAX_SEED = 2 ** 31

export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const { clubId } = await readBody<Record<string, unknown>>(event)
  if (!NHL_2026_27_CLUB_SEEDS.some((club) => club.id === clubId)) {
    throw createError({ statusCode: 400, message: 'errors.unknownClub' })
  }

  const state = await startSeason(randomInt(MAX_SEED))
  await replaceSeason(manager.id, clubId as string, state)
  return { ok: true }
})
