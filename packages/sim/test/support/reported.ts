import { it } from 'vitest'

/**
 * Targets a gate reports rather than asserts, by test name, each with the
 * reason and where it is asserted instead (04-validation-targets.md, #90).
 */
export type Reported = Readonly<Record<string, string>>

/**
 * `it`, unless the gate reports this target: then a failed check is printed
 * with its reason and does not fail the run.
 */
export function targetIt(reported: Reported) {
  return (name: string, check: () => void): void => {
    const why = reported[name]
    if (why === undefined) {
      it(name, check)
      return
    }
    it(`${name} (reported: ${why})`, () => {
      try {
        check()
      } catch (error) {
        console.warn(
          `reported, not asserted - ${name}: ${(error as Error).message.split('\n')[0]} (${why})`,
        )
      }
    })
  }
}
