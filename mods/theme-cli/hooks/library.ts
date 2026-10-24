// The user's theme library: ~/.claude/theme-cli/, outside every project.
//
//   config.json                    { "theme": "<name>" }, the theme on show
//   themes/<name>/theme.json       what a theme draws and where its images are
//   themes/<name>/.cache/frames.json   the scaled sprites, built once and reused
//
// A theme is scaled when it loads, never while the strip draws. The cache carries a stamp of
// everything the scale depends on, so a load that finds the same stamp reads the cache and
// does no image work.

import type { EngineInterface } from 'claude-code'

import { BUILT_IN, CUES, heightOf, parseSpec, resolveScene, resolvePath, sourcesOf } from './theme'
import type { Scene, Sounds, ThemeSpec } from './theme'

// Raise when the build script's output changes, so old caches rebuild.
const BUILD = 1
export const DEFAULT_THEME = 'default'
const NAME = /^[a-z0-9][a-z0-9_-]{0,39}$/i

export type Loaded = { scene: Scene; sounds: Sounds; status: string }

const MIME: Record<string, string> = { wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', aiff: 'audio/aiff', aif: 'audio/aiff', ogg: 'audio/ogg' }

export function isThemeName(name: string) {
  return NAME.test(name)
}

export async function homeOf($: EngineInterface) {
  return (await $.env.get('HOME')) ?? ''
}

export async function rootOf($: EngineInterface) {
  const home = await homeOf($)

  return home ? `${home}/.claude/theme-cli` : ''
}

// The theme names in the library, 'default' first.
export async function listThemes($: EngineInterface): Promise<string[]> {
  const root = await rootOf($)
  const names: string[] = [DEFAULT_THEME]
  if (!root) return names

  try {
    for (const entry of await $.fs.list(`${root}/themes`)) {
      if (entry.kind === 'dir' && isThemeName(entry.name) && (await $.fs.exists(`${root}/themes/${entry.name}/theme.json`))) {
        names.push(entry.name)
      }
    }
  } catch {
    // No library yet.
  }

  return names
}

export async function readChoice($: EngineInterface): Promise<string> {
  const root = await rootOf($)
  if (!root) return DEFAULT_THEME

  try {
    const config = JSON.parse((await $.fs.read(`${root}/config.json`)) as string) as { theme?: unknown }

    return typeof config.theme === 'string' && isThemeName(config.theme) ? config.theme : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export async function writeChoice($: EngineInterface, name: string) {
  const root = await rootOf($)
  if (!root) throw new Error('HOME is not set, so there is no library folder')

  await $.fs.write(`${root}/config.json`, JSON.stringify({ theme: name }, null, 2) + '\n')
}

// One line standing for a file or a folder's contents: changes when any image under it changes.
async function mark($: EngineInterface, path: string): Promise<string> {
  try {
    const stat = await $.fs.stat(path)
    if (stat.kind !== 'dir') return `${path}:${stat.size}:${Math.round(stat.mtimeMs)}`

    const entries = await $.fs.list(path)

    return `${path}[${entries.map(e => `${e.name}:${e.size}:${Math.round(e.mtimeMs)}`).sort().join(',')}]`
  } catch {
    return `${path}:missing`
  }
}

async function stampOf($: EngineInterface, spec: ThemeSpec, dir: string, home: string) {
  const parts = [`build${BUILD}`, `h${heightOf(spec)}`, await mark($, `${dir}/theme.json`)]
  for (const source of sourcesOf(spec, home, dir)) parts.push(await mark($, source))

  return parts.join('|')
}

async function readCache($: EngineInterface, path: string): Promise<{ stamp?: string; frames: Record<string, unknown> } | null> {
  try {
    const cache = JSON.parse((await $.fs.read(path)) as string) as { stamp?: string; frames?: Record<string, unknown> }

    return { stamp: cache.stamp, frames: cache.frames ?? {} }
  } catch {
    return null
  }
}

// Reads the audio files a theme names, once per load, so a cue plays without touching the disk.
// A file that cannot be read is left out and named in `missing`; the other cues still play.
async function loadSounds($: EngineInterface, spec: ThemeSpec, home: string, dir: string) {
  const sounds: Sounds = {}
  const missing: string[] = []
  for (const cue of CUES) {
    const entry = spec.sounds?.[cue]
    if (!entry) continue

    const mime = MIME[entry.file.split('.').pop()?.toLowerCase() ?? '']
    try {
      if (!mime) throw new Error('unknown audio type')

      const { base64 } = await $.fs.read(resolvePath(entry.file, home, dir), { as: 'bytes' })
      sounds[cue] = { base64, mime, gain: entry.gain ?? 1 }
    } catch {
      missing.push(cue)
    }
  }

  return { sounds, missing }
}

// Loads a theme by name: the check, the build when the stamp moved, then the scene.
// A theme that cannot load comes back as the built-in one, with the reason in `status`.
export async function loadTheme($: EngineInterface, name: string, force = false): Promise<Loaded> {
  const fallback = (why: string): Loaded => ({ scene: resolveScene(BUILT_IN, {}, DEFAULT_THEME), sounds: {}, status: why })
  if (name === DEFAULT_THEME) return fallback('built-in placeholders')

  const home = await homeOf($)
  const dir = `${await rootOf($)}/themes/${name}`
  let spec: ThemeSpec
  try {
    spec = parseSpec((await $.fs.read(`${dir}/theme.json`)) as string)
  } catch (error) {
    return fallback(`theme "${name}" not loaded (${(error as Error).message}); using placeholders`)
  }

  const cachePath = `${dir}/.cache/frames.json`
  const stamp = await stampOf($, spec, dir, home)
  let cache = await readCache($, cachePath)
  let status = 'sprites from cache'
  if (force || cache?.stamp !== stamp) {
    const script = `${$.plugin.root}/scripts/build-theme.py`
    try {
      const run = await $.process.run(
        ['python3', '-I', script, '--theme', dir, '--out', cachePath, '--home', home, '--height', String(heightOf(spec)), '--stamp', stamp],
        { timeoutMs: 120_000 },
      )
      const lines = `${run.stdout}${run.stderr}`.trim().split('\n').filter(Boolean)
      status = run.exitCode === 0 ? `built: ${lines.join('; ')}` : `build failed (${run.exitCode}): ${lines.join('; ')}`
      cache = (await readCache($, cachePath)) ?? cache
    } catch (error) {
      status = `build could not run (${(error as Error).message}); ${cache ? 'using the older cache' : 'using placeholders'}`
    }
  }

  const scene = resolveScene(spec, cache?.frames ?? {}, name)
  if (scene.missing.length) status += `; missing frames: ${scene.missing.join(', ')}`

  const { sounds, missing } = await loadSounds($, spec, home, dir)
  if (Object.keys(sounds).length) status += `; sounds: ${Object.keys(sounds).join(', ')}`
  if (missing.length) status += `; missing sounds: ${missing.join(', ')}`

  return { scene, sounds, status }
}

// What `/theme-new` writes: a theme folder to fill in. Frames not drawn yet stay placeholders.
export function templateFor(name: string) {
  const spec: ThemeSpec & { note: string } = {
    note: 'sheets point at your images (absolute, ~/ or relative to this folder). frames name a box (x, y, w, h) on a sheet, or a file inside a folder sheet. cast says which frame plays which part. Run /theme-build after editing.',
    name,
    height: 8,
    sheets: { main: { file: 'assets/sheet.png' } },
    frames: { 'run-1': { sheet: 'main', box: [0, 0, 16, 16] }, 'run-2': { sheet: 'main', box: [16, 0, 16, 16] } },
    cast: { lead: { run: ['run-1', 'run-2'], jump: 'run-1' } },
    sounds: { start: { file: 'assets/start.wav' }, working: { file: 'assets/working.wav', gain: 0.4 }, success: { file: 'assets/success.wav' }, error: { file: 'assets/error.wav' } },
    colors: { ground: ['#e69c3c', '#c84c0c'], dirt: '#7c2c00', pole: '#cfcfcf', flag: '#2e9d4f' },
  }

  return JSON.stringify(spec, null, 2) + '\n'
}

export { resolvePath }
