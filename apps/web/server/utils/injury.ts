/**
 * How long an injury lasts, as stored. Since #97 the engine counts calendar
 * days; box scores, events and notices stored before that count Fixtures.
 */
export function injuryLength(stored: { days?: number; fixtures?: number }) {
  return { days: stored.days ?? null, fixtures: stored.fixtures ?? null }
}
