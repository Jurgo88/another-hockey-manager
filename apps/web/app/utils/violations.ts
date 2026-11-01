/**
 * The rules a refused Lineup broke, from a failed request. Null for any other
 * failure, whose `data` has another shape: a missing route, a lost connection.
 */
export function violationMessages(error: unknown): string[] | null {
  const data = (error as { data?: { data?: unknown } }).data?.data
  if (!Array.isArray(data)) return null
  return (data as { message: string }[]).map((violation) => violation.message)
}
