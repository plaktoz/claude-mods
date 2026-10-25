import { expect, mock, test } from 'claude-code/testing'

import { resolvePath } from './library'

const HOME = '/home/u'
const ROOT = `${HOME}/.claude/theme-cli`
const THEME = {
  name: 'tall',
  height: 12,
  sheets: { s: { file: 'assets/s.png' } },
  frames: { a: { sheet: 's', box: [0, 0, 8, 8] } },
  cast: { lead: { run: ['a', 'a'] }, goal: { frame: 'castle' } },
}
const FRAME = { w: 2, h: 2, palette: ['#ff0000'], rows: ['00', '00'] }

// A library on a fake disk: files by path, a process.run that builds the cache, and a count of builds.
// `env` replaces the environment; `installed` names the Python launchers that exist (default: all).
const library = (
  $: any,
  on: any,
  files: Record<string, string>,
  mtime = { s: 1 },
  { env = { HOME }, installed = ['python3', 'python', 'py'] }: { env?: Record<string, string>; installed?: string[] } = {},
) => {
  const seen = { builds: 0, argv: [] as string[], written: {} as Record<string, string>, played: [] as any[], aborted: 0 }
  mock.env(on, env)
  const clock = mock.clock(on, { now: 1_000_000 })

  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.end', () => ({ sessionId: 's' }))
  on('command.register', () => ({ value: { command: 'x' } }))
  on('agent.list', () => ({ value: [] }))
  on('fs.read', (_: unknown, e: { path: string; as?: string }) => {
    const text = seen.written[e.path] ?? files[e.path]
    if (text === undefined) throw new Error('ENOENT')

    // An audio file read as bytes: the fake disk holds it already as base64 text.
    return { value: e.as === 'bytes' ? { base64: text } : text }
  })
  on('audio.play', (_: unknown, e: any) => {
    seen.played.push(e)

    return { value: undefined }
  })
  on('turn.start', (_: unknown, e: { turnId: string }) => ({ turnId: e.turnId }))
  on('turn.complete', (_: unknown, e: { answer: string }) => ({ text: e.answer }))
  on('fs.exists', (_: unknown, e: { path: string }) => ({ value: (seen.written[e.path] ?? files[e.path]) !== undefined }))
  on('fs.write', (_: unknown, e: { path: string; text: string }) => {
    seen.written[e.path] = e.text

    return { value: undefined }
  })
  on('fs.stat', (_: unknown, e: { path: string }) => {
    if (e.path.endsWith('s.png')) return { value: { kind: 'file', size: 10, mtimeMs: mtime.s, isLink: false } }
    if (files[e.path] === undefined) throw new Error('ENOENT')

    return { value: { kind: 'file', size: files[e.path]!.length, mtimeMs: 5, isLink: false } }
  })
  on('fs.list', () => ({
    value: [
      { name: 'tall', kind: 'dir', size: 0, mtimeMs: 1, isLink: false },
      { name: 'stray', kind: 'dir', size: 0, mtimeMs: 1, isLink: false },
    ],
  }))
  // The build script: records the stamp it was given and leaves a cache behind.
  // Other runs (the Python launcher's `--version` probe) answer 0 and count as nothing.
  on('process.run', (_: unknown, e: { argv: string[] }) => {
    if (!installed.includes(e.argv[0]!)) throw new Error('not found')
    if (!e.argv.some(arg => arg.endsWith('build-theme.py'))) return { value: { exitCode: 0, stdout: 'Python 3', stderr: '' } }
    seen.builds += 1
    seen.argv = e.argv
    const stamp = e.argv[e.argv.indexOf('--stamp') + 1]!
    seen.written[`${ROOT}/themes/tall/.cache/frames.json`] = JSON.stringify({ stamp, frames: { a: FRAME } })

    return { value: { exitCode: 0, stdout: 'built 1 frames', stderr: '' } }
  })

  const start = () => $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'm' }
  const turnStart = () => $.turn.start({ text: 'go', turnId: 't1' })
  const turnEnd = (extra: object = {}) =>
    $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, reason: 'answer', turnId: 't1', usage, ...extra })
  const run = (command: string, args = '') => $.command.run({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

  return { seen, start, run, turnStart, turnEnd, clock }
}

// The dump is the one file written outside the library.
const dump = (seen: { written: Record<string, string> }) =>
  Object.entries(seen.written).find(([path]) => path.endsWith('theme-cli-log.txt'))?.[1]

const files = {
  [`${ROOT}/config.json`]: JSON.stringify({ theme: 'tall' }),
  [`${ROOT}/themes/tall/theme.json`]: JSON.stringify(THEME),
  [`${ROOT}/themes/stray/theme.json`]: '{}',
}

test('the chosen theme is built once at start, then read from the cache', async ($, on) => {
  const { seen, start } = library($, on, files)

  await start()
  expect(seen.builds).toBe(1)
  expect(seen.argv).toContain('--height')
  expect(seen.argv[seen.argv.indexOf('--height') + 1]).toBe('12')

  // Nothing changed, so the next start finds the stamp and does no image work.
  await start()
  await start()
  expect(seen.builds).toBe(1)
})

test('a changed source image rebuilds the cache', async ($, on) => {
  const mtime = { s: 1 }
  const { seen, start } = library($, on, files, mtime)
  await start()
  expect(seen.builds).toBe(1)

  mtime.s = 2
  await start()

  expect(seen.builds).toBe(2)
})

test('/theme-build rebuilds even when the stamp matches', async ($, on) => {
  const { seen, start, run } = library($, on, files)
  await start()
  const out = await run('theme-build')

  expect(seen.builds).toBe(2)
  expect(out.text).toContain('tall')
})

test('/theme-list names the library, marks the one on show, and skips folders with no theme.json', async ($, on) => {
  const { start, run } = library($, on, { ...files, [`${ROOT}/themes/stray/theme.json`]: undefined as any })
  await start()
  const out = await run('theme-list')

  expect(out.text).toContain('* tall')
  expect(out.text).toContain('  default')
  expect(out.text).not.toContain('stray')
})

test('/theme-use switches at once and keeps the choice in config.json', async ($, on) => {
  const { seen, start, run } = library($, on, files)
  await start()

  const back = await run('theme-use', 'default')
  expect(back.text).toContain('Theme: default')
  expect(JSON.parse(seen.written[`${ROOT}/config.json`]!)).toEqual({ theme: 'default' })

  const unknown = await run('theme-use', 'nope')
  expect(unknown.text).toContain('No theme "nope"')
  expect(JSON.parse(seen.written[`${ROOT}/config.json`]!)).toEqual({ theme: 'default' })
})

test('/theme-new writes a template once and refuses a bad or taken name', async ($, on) => {
  const { seen, start, run } = library($, on, files)
  await start()

  expect((await run('theme-new', '../x')).text).toContain('Give a name')
  expect((await run('theme-new', 'tall')).text).toContain('already exists')

  const out = await run('theme-new', 'castle')
  expect(out.text).toContain(`${ROOT}/themes/castle/theme.json`)
  expect(JSON.parse(seen.written[`${ROOT}/themes/castle/theme.json`]!).name).toBe('castle')
})

test('a theme with a broken theme.json falls back to placeholders and says why', async ($, on) => {
  const { seen, start, run } = library($, on, { ...files, [`${ROOT}/themes/tall/theme.json`]: '{ nope' })
  await start()
  await run('theme-dump')

  expect(seen.builds).toBe(0)
  expect(dump(seen)).toContain('theme tall: theme "tall" not loaded')
  expect(dump(seen)).toContain('theme=default')
})

test('the theme sets the strip height: 12 px sprites need seven rows', async ($, on) => {
  const { seen, start, run } = library($, on, files)
  await start()
  await run('theme-dump')

  expect(dump(seen)).toContain('theme=tall 12px sprites, 7 rows')
  // The cast names "castle", which the cache lacks: that one is a placeholder.
  expect(dump(seen)).toContain('missing=[castle]')
})

const SOUNDS = {
  start: { file: 'assets/start.wav' },
  working: { file: 'assets/working.wav', gain: 0.4 },
  success: { file: 'assets/success.wav' },
  error: { file: 'assets/error.wav' },
}
const sounded = {
  ...files,
  [`${ROOT}/themes/tall/theme.json`]: JSON.stringify({ ...THEME, sounds: SOUNDS }),
  [`${ROOT}/themes/tall/assets/start.wav`]: 'U1RBUlQ=',
  [`${ROOT}/themes/tall/assets/working.wav`]: 'V09SSw==',
  [`${ROOT}/themes/tall/assets/success.wav`]: 'V0lO',
  [`${ROOT}/themes/tall/assets/error.wav`]: 'RVJS',
}
const clipsOf = (seen: { played: any[] }) => seen.played.map(p => p.clip.base64)

test('a turn plays the start clip, then loops the working clip until it is answered', async ($, on) => {
  const { seen, start, turnStart, turnEnd, clock } = library($, on, sounded)
  await start()
  await turnStart()
  await clock.advance(100)

  // The start clip plays once; the loop follows it, quietly, and can be stopped.
  expect(clipsOf(seen)).toEqual(['U1RBUlQ=', 'V09SSw=='])
  expect(seen.played[0]).toMatchObject({ clip: { mime: 'audio/wav' }, shouldLoop: false, gain: 1 })
  expect(seen.played[1]).toMatchObject({ shouldLoop: true, gain: 0.4 })

  await turnEnd()
  expect(clipsOf(seen)).toEqual(['U1RBUlQ=', 'V09SSw==', 'V0lO'])
})

test('a turn that fails plays the error clip, and an aborted turn plays none', async ($, on) => {
  const { seen, start, turnStart, turnEnd, clock } = library($, on, sounded)
  await start()
  await turnStart()
  await clock.advance(100)
  await turnEnd({ reason: 'error' })
  expect(clipsOf(seen).at(-1)).toBe('RVJS')

  const before = seen.played.length
  await turnStart()
  await clock.advance(100)
  await turnEnd({ reason: 'aborted', isAborted: true })
  await clock.advance(100)
  // The second turn's start and loop played; nothing played for the abort.
  expect(seen.played.slice(before).map(p => p.clip.base64)).toEqual(['U1RBUlQ=', 'V09SSw=='])
})

test('a theme with no sounds plays nothing', async ($, on) => {
  const quiet = library($, on, files)
  await quiet.start()
  await quiet.turnStart()
  await quiet.turnEnd()
  expect(quiet.seen.played).toEqual([])
})

test('a sound file that is missing is named in the status and the other cues still play', async ($, on) => {
  const { [`${ROOT}/themes/tall/assets/working.wav`]: _, ...gone } = sounded
  const { seen, start, run, turnStart, clock } = library($, on, gone)
  await start()
  await turnStart()
  await clock.advance(100)
  await run('theme-dump')

  expect(clipsOf(seen)).toEqual(['U1RBUlQ='])
  expect(dump(seen)).toContain('missing sounds: working')
})

test('a bad "sounds" entry in theme.json falls back to placeholders and says why', async ($, on) => {
  const bad = { ...files, [`${ROOT}/themes/tall/theme.json`]: JSON.stringify({ ...THEME, sounds: { start: { gain: 1 } } }) }
  const { seen, start, run } = library($, on, bad)
  await start()
  await run('theme-dump')

  expect(dump(seen)).toContain('"sounds.start" needs a "file" path')
})

test('/theme-mute silences every cue and the loop, and /theme-unmute brings them back', async ($, on) => {
  const { seen, start, run, turnStart, turnEnd, clock } = library($, on, sounded)
  await start()
  await turnStart()
  await clock.advance(100)
  expect(clipsOf(seen)).toEqual(['U1RBUlQ=', 'V09SSw=='])

  // Muting mid-turn aborts the loop; the finish then plays nothing.
  const muted = await run('theme-mute')
  expect(muted.text).toContain('muted')
  await turnEnd()
  await turnStart()
  await clock.advance(100)
  expect(clipsOf(seen)).toEqual(['U1RBUlQ=', 'V09SSw=='])

  // Unmuting during a turn restarts the loop.
  await run('theme-unmute')
  expect(clipsOf(seen).at(-1)).toBe('V09SSw==')
  await turnEnd()
  expect(clipsOf(seen).at(-1)).toBe('V0lO')
})

test('the build runs under the first Python launcher that answers', async ($, on) => {
  // Only the Windows launcher is installed here.
  const { seen, start } = library($, on, files, { s: 1 }, { installed: ['py'] })
  await start()

  expect(seen.builds).toBe(1)
  expect(seen.argv.slice(0, 2)).toEqual(['py', '-3'])
})

test('with no Python at all the status says so and the older cache or placeholders stand', async ($, on) => {
  const { seen, start, run } = library($, on, files, { s: 1 }, { installed: [] })
  await start()
  await run('theme-dump')

  expect(seen.builds).toBe(0)
  expect(dump(seen)).toContain('no Python found')
})

test('with HOME unset, the library is found under USERPROFILE', async ($, on) => {
  // A drive-letter path is relative on a POSIX test host, so the profile folder here is POSIX-shaped.
  const WIN = '/Users/u'
  const winFiles = {
    [`${WIN}/.claude/theme-cli/config.json`]: JSON.stringify({ theme: 'tall' }),
    [`${WIN}/.claude/theme-cli/themes/tall/theme.json`]: JSON.stringify(THEME),
  }
  const { seen, start } = library($, on, winFiles, { s: 1 }, { env: { USERPROFILE: WIN } })
  await start()

  expect(seen.builds).toBe(1)
  expect(seen.argv[seen.argv.indexOf('--home') + 1]).toBe(WIN)
})

test('theme.json paths: drive letters, UNC and ~\\ are handled as Windows paths', async () => {
  expect(resolvePath('C:\\art\\a.png', '/h', '/d')).toBe('C:\\art\\a.png')
  expect(resolvePath('D:/art/a.png', '/h', '/d')).toBe('D:/art/a.png')
  expect(resolvePath('\\\\server\\share\\a.png', '/h', '/d')).toBe('\\\\server\\share\\a.png')
  expect(resolvePath('~\\art\\a.png', '/h', '/d')).toBe('/h/art\\a.png')
  expect(resolvePath('assets/a.png', '/h', '/d')).toBe('/d/assets/a.png')
})
