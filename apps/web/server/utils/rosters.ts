import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createFileRosterProvider, NHL_2026_27, type RosterProvider } from '@ahm/sim'

/** Where a career's Rosters came from (ADR-003, ADR-029 amendments). */
export type RosterSource = 'generated' | 'file'

export function isRosterSource(value: unknown): value is RosterSource {
  return value === 'generated' || value === 'file'
}

/**
 * The provider of a roster file, or null with the reason logged when it cannot
 * be read or does not fit the Competition. A relative path is read from where
 * the server runs.
 */
export function readRosterProvider(
  path: string,
  warn: (message: string) => void = console.warn,
): RosterProvider | null {
  try {
    return createFileRosterProvider(readFileSync(resolve(path), 'utf8'), NHL_2026_27)
  } catch (error) {
    warn(`Roster file ${path} is not offered: ${(error as Error).message}`)
    return null
  }
}

let cached: { path: string; provider: RosterProvider | null } | null = null

/** The configured roster file's provider, read once while the path stays the same. */
export function fileRosterProvider(): RosterProvider | null {
  const { rosterFile } = useRuntimeConfig()
  if (!rosterFile) return null
  if (cached?.path !== rosterFile)
    cached = { path: rosterFile, provider: readRosterProvider(rosterFile) }
  return cached.provider
}

/** The sources a new career may start on: generated always, the file when one is given. */
export function rosterSources(): RosterSource[] {
  return fileRosterProvider() ? ['generated', 'file'] : ['generated']
}
