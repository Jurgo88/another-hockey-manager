// Shared by the calibration scripts: where @ahm/sim's source is, and how a run is saved.
import { readFileSync } from 'node:fs'

export const SRC = new URL('../../../../packages/sim/src/', import.meta.url).href

/** Imports a module of @ahm/sim by its path under src, e.g. 'stats/league.ts'. */
export const sim = (path: string) => import(SRC + path)

export const mean = (values: readonly number[]) =>
  values.reduce((sum, v) => sum + v, 0) / values.length

/** JSON with Maps kept, as fit-run writes and the reports read. */
export const replacer = (_: string, v: unknown) => (v instanceof Map ? { __map: [...v] } : v)

/** The runs fit-run saved, from the files given. */
export const readRuns = (files: readonly string[]) =>
  files.map((file) => JSON.parse(readFileSync(file, 'utf8')))
