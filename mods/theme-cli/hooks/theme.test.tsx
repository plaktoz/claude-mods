import { expect, mock, test } from 'claude-code/testing'

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
const library = ($: any, on: any, files: Record<string, string>, mtime = { s: 1 }) => {
  const seen = { builds: 0, argv: [] as string[], written: {} as Record<string, string> }
  mock.env(on, { HOME })
  mock.clock(on, { now: 1_000_000 })

  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.end', () => ({ sessionId: 's' }))
  on('command.register', () => ({ value: { command: 'x' } }))
  on('agent.list', () => ({ value: [] }))
  on('fs.read', (_: unknown, e: { path: string }) => {
    const text = seen.written[e.path] ?? files[e.path]
    if (text === undefined) throw new Error('ENOENT')

    return { value: text }
  })
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
  on('process.run', (_: unknown, e: { argv: string[] }) => {
    seen.builds += 1
    seen.argv = e.argv
    const stamp = e.argv[e.argv.indexOf('--stamp') + 1]!
    seen.written[`${ROOT}/themes/tall/.cache/frames.json`] = JSON.stringify({ stamp, frames: { a: FRAME } })

    return { value: { exitCode: 0, stdout: 'built 1 frames', stderr: '' } }
  })

  const start = () => $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const run = (command: string, args = '') => $.command.run({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

  return { seen, start, run }
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
