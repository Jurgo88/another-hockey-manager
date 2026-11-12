/**
 * An attribute as the server sends it: a point when it is known, a range when
 * it is an estimate (D-11, FR-18).
 */
export function shown({ low, high }: { low: number; high: number }): string {
  return low === high ? String(low) : `${low}–${high}`
}
