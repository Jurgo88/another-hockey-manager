export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const { clubId, state } = await requireSeason(manager.id)
  const fixture = liveFixture(state, clubId)
  return fixture && liveView(state, clubId, fixture)
})
