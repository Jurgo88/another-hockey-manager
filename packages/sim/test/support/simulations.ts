import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'
import type { SimulatedRun, SimulatedSeason } from '../../src/cli/season.js'
import { foldSeason } from '../../src/stats/season.js'

/**
 * Seasons simulated once and shared by the realism and long-run tests (#106).
 *
 * A result is kept on disk under a hash of `packages/sim/src` and of this
 * support, so it is simulated again whenever the engine changes, and read
 * otherwise. The first test to ask for a result that is not there takes a lock
 * and simulates it in a process of its own; any other test asking for it waits.
 * Each result so gets its own core, and none is simulated twice.
 *
 * Nothing here changes what is simulated: a cached Season is the same value
 * `simulateSeason` returns, less `replay`, and a run is what `simulateSeasons`
 * returns.
 */

export type CachedSeason = Omit<SimulatedSeason, 'replay'>

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGE = join(HERE, '..', '..')
const WORKER = join(HERE, 'simulate-worker.ts')
/** How often a test waiting on another's result looks for it. */
const POLL_MS = 100

/** One Season of the NHL on generated Rosters, as `simulateSeason(seed)` plays it. */
export function cachedSeason(seed: number): Promise<CachedSeason> {
  return cached<SeasonEntry>(`season-${seed}`, ['season', String(seed)]).then((entry) => ({
    ...entry,
    season: foldSeason(entry.matches),
  }))
}

/** `count` Seasons in a row from one seed, as `simulateSeasons(seed, count)` plays them. */
export function cachedRun(seed: number, count: number): Promise<SimulatedRun> {
  return cached<SimulatedRun>(`run-${seed}-${count}`, ['run', String(seed), String(count)])
}

type SeasonEntry = Omit<CachedSeason, 'season'>

/** What is kept of a Season: its statistics are folded again on reading, which is cheap. */
export function seasonEntry({ seed, clubs, lineups, fixtures, matches }: SimulatedSeason): SeasonEntry {
  return { seed, clubs, lineups, fixtures, matches }
}

async function cached<T>(name: string, args: readonly string[]): Promise<T> {
  const file = entryPath(name)
  const lock = `${file}.lock`
  mkdirSync(dirname(file), { recursive: true })
  for (;;) {
    if (existsSync(file)) return decode<T>(readFileSync(file))
    if (claim(lock)) {
      try {
        if (!existsSync(file)) await inProcessOf(args)
      } finally {
        rmSync(lock, { force: true })
      }
      continue
    }
    if (abandoned(lock)) rmSync(lock, { force: true })
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
}

/** Simulates in a process of its own, so results asked for together use separate cores. */
function inProcessOf(args: readonly string[]): Promise<void> {
  const tsx = createRequire(import.meta.url).resolve('tsx/cli')
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [tsx, WORKER, ...args], { cwd: PACKAGE, maxBuffer: 1 << 24 }, (error, _out, stderr) =>
      error ? reject(new Error(`${args.join(' ')} failed: ${stderr || error.message}`)) : resolve(),
    )
  })
}

function claim(lock: string): boolean {
  try {
    closeSync(openSync(lock, 'wx'))
    writeFileSync(lock, String(process.pid))
    return true
  } catch {
    return false
  }
}

/** A lock whose owner has ended, as after a run that was stopped. */
function abandoned(lock: string): boolean {
  try {
    const pid = Number(readFileSync(lock, 'utf8'))
    if (!pid) return Date.now() - statSync(lock).mtimeMs > 5_000
    process.kill(pid, 0)
    return false
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH'
  }
}

export function write(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true })
  const partial = `${file}.${process.pid}.partial`
  writeFileSync(partial, gzipSync(JSON.stringify(value, (_, v: unknown) => (v instanceof Map ? { __map: [...v] } : v))))
  renameSync(partial, file)
}

function decode<T>(bytes: Buffer): T {
  return JSON.parse(gunzipSync(bytes).toString('utf8'), (_, v: unknown) =>
    v !== null && typeof v === 'object' && '__map' in v ? new Map((v as { __map: [unknown, unknown][] }).__map) : v,
  ) as T
}

let directory: string | undefined

/** Where a result is kept: under a hash of the source and of this support. */
export function entryPath(name: string): string {
  directory ??= join(PACKAGE, '.cache', 'sim', sourceHash())
  return join(directory, `${name}.json.gz`)
}

function sourceHash(): string {
  const hash = createHash('sha256')
  const files = [...walk(join(PACKAGE, 'src')), join(HERE, 'simulations.ts'), WORKER].sort()
  for (const file of files) {
    hash.update(relative(PACKAGE, file).replaceAll('\\', '/'))
    // Line endings differ between a Windows checkout and CI; the source does not.
    hash.update(readFileSync(file, 'utf8').replaceAll('\r\n', '\n'))
  }
  return hash.digest('hex').slice(0, 16)
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(path)
    else if (entry.name.endsWith('.ts')) yield path
  }
}
