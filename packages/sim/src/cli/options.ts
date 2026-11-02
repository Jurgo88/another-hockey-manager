import { resolve } from 'node:path'

export function integerOption(flag: string, value: string, min: number): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < min) {
    throw new Error(`${flag} must be an integer of at least ${min}, got "${value}"`)
  }
  return parsed
}

/** pnpm runs the script from the package; a path is meant from where it was typed. */
export function typedPath(path: string): string {
  return resolve(process.env.INIT_CWD ?? process.cwd(), path)
}
