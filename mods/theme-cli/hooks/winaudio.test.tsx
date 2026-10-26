import { expect, mock, test, type Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { decode, encode, isWav, tone, withGain } from './wav'

function sampleAt(wav: Uint8Array, i: number) {
  return new DataView(wav.buffer, wav.byteOffset).getInt16(44 + i * 2, true)
}

test('base64 round-trips bytes of every length', () => {
  for (const n of [0, 1, 2, 3, 4, 5, 255]) {
    const bytes = new Uint8Array(n).map((_, i) => (i * 37) & 255)
    expect(Array.from(decode(encode(bytes)))).toEqual(Array.from(bytes))
  }
  expect(encode(new Uint8Array([77, 97, 110]))).toBe('TWFu')
  expect(encode(new Uint8Array([77]))).toBe('TQ==')
})

test('a generated tone is a WAV, and gain scales and clips its samples', () => {
  const wav = tone(440, 50)
  expect(isWav(wav)).toBe(true)
  expect(isWav(new Uint8Array([1, 2, 3]))).toBe(false)

  const i = 10
  const quieter = withGain(wav, 0.5)
  expect(sampleAt(quieter, i)).toBe(Math.round(sampleAt(wav, i) * 0.5))
  expect(withGain(wav, 1)).toBe(wav)

  const loud = withGain(wav, 4)
  for (let s = 0; s < 200; s++) expect(Math.abs(sampleAt(loud, s))).toBeLessThanOrEqual(32768)
})

// The fake engine beneath the module: records each PowerShell spawn and each clip that
// reaches the engine's own player. `exitCode` makes PowerShell fail. `hang` makes the child
// run until the engine kills it, as a looping player does.
function engine(on: On, spawned: string[][], exitCode = 0, hang = false) {
  const reached = { audio: 0 }
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.run', () => ({ text: 'engine ran it' }))
  on('process.spawn', async function* (_, e, next) {
    spawned.push([...e.argv])
    if (hang) await new Promise<void>(done => next.signal.addEventListener('abort', () => done(), { once: true }))
    if (exitCode !== 0) yield { stream: 'stderr' as const, text: 'Exception calling "PlaySync"' }
    return { value: { code: exitCode, signal: null } }
  })
  on('audio.play', () => {
    reached.audio++
    return { value: undefined }
  })
  return reached
}

async function start($: Engine) {
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
}

const run = (args: string) => ({ command: 'play', args, origin: { kind: 'composer' } }) as never

// A mod that plays a clip the way theme-cli does: `$.audio.play` from a command, the
// clip named by the command's argument. Self-contained, as an inline plugin must be.
const CALLER = {
  name: 'caller',
  register(on: On) {
    const TONE =
      'UklGRmQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YUAAAAAAAOMSWSPmLlU0EjNMKw0emgsx+O7lFNdNzW7Jy8tq1EPiX/QBCJEaySnaM5o0sCyRIGwOO/vO6IHZnM5zyQ=='
    const CLIPS = {
      wav: { base64: TONE, mime: 'audio/wav' },
      mp3: { base64: 'AAAA', mime: 'audio/mpeg' },
      asset: { asset: 'sounds/a.wav' },
    } as const
    on('session.start', async ($, e, next) => {
      await $.command.register({ name: 'play', description: 'play a clip', argumentHint: '<wav|mp3|asset> [loop]' })
      return next(e)
    })
    on('command.run', { command: 'play' }, async ($, e) => {
      const [kind, loop] = e.args.split(' ') as [keyof typeof CLIPS, string | undefined]
      try {
        if (loop) {
          // Loops until its own signal aborts. The test stops it from outside, as a turn's end does.
          const stop = new AbortController()
          await $.audio.play(CLIPS[kind], { shouldLoop: true, signal: stop.signal })
        } else {
          await $.audio.play(CLIPS[kind], { gain: 0.4 })
        }
        return { text: 'played' }
      } catch (error) {
        return { text: `failed: ${String(error)}` }
      }
    })
  },
}

test('on Windows a WAV clip is played by PowerShell, not handed to the engine', { plugins: [CALLER] }, async ($, on) => {
  const spawned: string[][] = []
  mock.env(on, { OS: 'Windows_NT' })
  const reached = engine(on, spawned)
  await start($)

  const out = await $.command.run(run('wav'))

  expect((out as { text?: string }).text).toBe('played')
  expect(reached.audio).toBe(0)
  expect(spawned.length).toBe(1)
  expect(spawned[0]?.[0]).toBe('powershell.exe')
  expect(spawned[0]?.join(' ')).toContain('PlaySync')
})

test('a looped clip uses PlayLooping', { plugins: [CALLER] }, async ($, on) => {
  const spawned: string[][] = []
  mock.env(on, { OS: 'Windows_NT' })
  engine(on, spawned)
  await start($)

  await $.command.run(run('wav loop'))

  expect(spawned[0]?.join(' ')).toContain('PlayLooping')
})

test('off Windows, the clip goes on to the engine', { plugins: [CALLER] }, async ($, on) => {
  const spawned: string[][] = []
  mock.env(on, { OS: 'Darwin' })
  const reached = engine(on, spawned)
  await start($)

  await $.command.run(run('wav'))

  expect(reached.audio).toBe(1)
  expect(spawned.length).toBe(0)
})

test('a non-WAV or asset clip on Windows goes on to the engine', { plugins: [CALLER] }, async ($, on) => {
  const spawned: string[][] = []
  mock.env(on, { OS: 'Windows_NT' })
  const reached = engine(on, spawned)
  await start($)

  await $.command.run(run('mp3'))
  await $.command.run(run('asset'))

  expect(reached.audio).toBe(2)
  expect(spawned.length).toBe(0)
})

test('a PowerShell failure rejects, so the caller can log it', { plugins: [CALLER] }, async ($, on) => {
  mock.env(on, { OS: 'Windows_NT' })
  engine(on, [], 1)
  await start($)

  const out = await $.command.run(run('wav'))

  expect((out as { text?: string }).text).toContain('powershell exited 1')
})

// The real looped child never exits by itself: it ends when the engine kills it. The fake child
// does the same, so the call resolves only if the loop is stopped from outside the hook.
test('theme-cli stopping its loop ends the Windows loop', { plugins: [CALLER] }, async ($, on) => {
  mock.env(on, { OS: 'Windows_NT' })
  mock.clock(on, { now: 1_000_000 })
  const spawned: string[][] = []
  engine(on, spawned, 0, true)
  await start($)

  let done = false
  const playing = $.command.run(run('wav loop')).then(out => {
    done = true

    return out
  })
  // Wait until the child is up, so the loop is registered before the stop. The child never ends by itself.
  for (let turns = 0; spawned.length === 0 && turns < 1000; turns++) await Promise.resolve()
  expect(spawned.length).toBe(1)
  expect(done).toBe(false)

  // /theme-sound off ends the loop through theme-cli's own stopLoop(), in the plugin's copy of the module.
  await $.command.run({ command: 'theme-sound', args: 'off', origin: { kind: 'composer' } } as never)
  const out = await playing

  expect((out as { text?: string }).text).toBe('played')
})
