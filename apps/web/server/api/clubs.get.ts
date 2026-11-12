import { NHL_2026_27, NHL_2026_27_CLUB_SEEDS } from '@ahm/sim'

export default defineEventHandler(async (event) => {
  await requireManager(event)

  return {
    divisions: NHL_2026_27.divisions.map((division) => ({
      id: division.id,
      name: division.name,
      clubs: NHL_2026_27_CLUB_SEEDS.filter((club) => division.clubIds.includes(club.id)).map(
        ({ id, code, name }) => ({ id, code, name }),
      ),
    })),
    // The roster file appears only when the server is given one (ADR-003).
    sources: rosterSources(),
  }
})
