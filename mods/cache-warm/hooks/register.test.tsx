import { expect, mock, test } from 'claude-code/testing'

const MIN = 60_000
const BAND = {
  plugin: 'cache-warm',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const usage = { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 200_000, cache_creation_input_tokens: 0 }

const world = ($: any, on: any, reply: any = { isAnswered: true, text: 'ok', usage }, hold: Promise<void> = Promise.resolve()) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const seen = { forks: 0, logs: [] as { text: string; to?: string }[], toasts: [] as string[] }

  on('turn.start', (_: unknown, e: { turnId: string }) => ({ turnId: e.turnId }))
  on('turn.complete', (_: unknown, e: { answer: string }) => ({ text: e.answer }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.end', () => ({ sessionId: 's' }))
  on('ui.toast', (_: unknown, e: { text: string }) => {
    seen.toasts.push(e.text)

    return { value: undefined }
  })
  // Stands for the engine's own band, drawn when the mod yields.
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  on('ui.log', (_: unknown, e: { text: string; to?: string }) => {
    seen.logs.push(e)

    return { value: undefined }
  })
  on('model.fork', async () => {
    seen.forks += 1
    await hold

    return { value: reply }
  })

  const endTurn = () =>
    $.turn.complete({
      answer: 'done',
      durationMs: 1,
      isAborted: false,
      reason: 'answer',
      turnId: 't1',
      usage: { ...usage, cache_read_input_tokens: 0, cache_creation_input_tokens: 214_000, model: 'm' },
    })
  const text = async () => {
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const all = await ui.findAll({ type: 'Text' })
    await ui.unmount()

    return all.map((t: { text: string }) => t.text).join(' | ')
  }

  return { clock, seen, endTurn, text }
}

test('a finished turn shows the countdown and the first ping', async ($, on) => {
  const { endTurn, text } = world($, on)

  await endTurn()
  const shown = await text()

  expect(shown).toContain('Cache warm')
  expect(shown).toContain('5:00')
  expect(shown).toContain('214k tokens')
  expect(shown).toContain('first ping in 4:15')
})

test('a ping is sent before the cache lapses and the countdown restarts', async ($, on) => {
  const { clock, seen, endTurn, text } = world($, on)

  await endTurn()
  await clock.advance(4 * MIN + 14_000)
  expect(seen.forks).toBe(0)

  await clock.advance(2_000)
  expect(seen.forks).toBe(1)
  expect(await text()).toContain('next ping in')
})

test('pings stop after the limit and the band disappears when the cache lapses', async ($, on) => {
  const { clock, seen, endTurn, text } = world($, on)

  await endTurn()
  for (let i = 0; i < 10; i += 1) await clock.advance(5 * MIN)

  expect(seen.forks).toBe(6)
  expect(await text()).toBe('engine')
})

test('a failed ping stops keeping warm and says so', async ($, on) => {
  const { clock, seen, endTurn, text } = world($, on, { isAnswered: false, reason: 'api-error', usage })

  await endTurn()
  await clock.advance(5 * MIN)

  expect(seen.toasts[0]).toContain('stopped')
  expect(await text()).toBe('engine')
})

const PINGING = 'Pinging to keep the cache warm'

test('a turn that starts during a ping and ends without usage clears isPinging', async ($, on) => {
  let release = () => {}
  const hold = new Promise<void>(resolve => {
    release = resolve
  })
  const { clock, endTurn, text } = world($, on, undefined, hold)

  await endTurn()
  await clock.advance(4 * MIN + 15_000)
  expect(await text()).toContain(PINGING)

  await $.turn.start({ text: 'next', turnId: 't2' })
  release()
  await clock.settle()
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, reason: 'answer', turnId: 't2' })

  const shown = await text()
  expect(shown).toContain('Cache warm')
  expect(shown).toContain('Keeping warm ·')
  expect(shown).not.toContain(PINGING)
})

test('a ping that rejects clears isPinging, logs to the debug log and raises no rejection', async ($, on) => {
  // The reply has no usage. ModelCompleteResult does not allow that, so this
  // forces the one rejection ping() can raise after it sets isPinging. The
  // kit fails the file on any unhandled rejection, so a missing catch fails it.
  const { clock, seen, endTurn, text } = world($, on, { isAnswered: true, text: 'ok' })

  await endTurn()
  await clock.advance(4 * MIN + 15_000)
  await clock.settle()

  expect(seen.forks).toBe(1)
  const shown = await text()
  expect(shown).toBe('engine')
  expect(shown).not.toContain(PINGING)
  expect(seen.logs.some(l => l.to === 'debug' && l.text.includes('ping'))).toBe(true)
})

const never = new Promise<void>(() => {})

test('a ping that never answers stops after 30 seconds and the band drops the pinging text', async ($, on) => {
  const { clock, seen, endTurn, text } = world($, on, undefined, never)

  await endTurn()
  await clock.advance(4 * MIN + 15_000)
  expect(await text()).toContain(PINGING)

  await clock.advance(29_000)
  expect(await text()).toContain(PINGING)

  await clock.advance(1_000)
  await clock.settle()

  const shown = await text()
  expect(seen.forks).toBe(1)
  expect(shown).toBe('engine')
  expect(shown).not.toContain(PINGING)
  expect(seen.logs.filter(l => l.to === 'debug' && l.text.includes('ping failed'))).toHaveLength(1)
})

test('a reply after the timeout changes no expiry, token count or ping count', async ($, on) => {
  let release = () => {}
  const hold = new Promise<void>(resolve => {
    release = resolve
  })
  const late = { isAnswered: true, text: 'ok', usage: { ...usage, cache_read_input_tokens: 999_000 } }
  const { clock, endTurn, text } = world($, on, late, hold)

  await endTurn()
  await clock.advance(4 * MIN + 15_000)
  await clock.advance(30_000)
  await clock.settle()
  expect(await text()).toBe('engine')

  // A turn ends after the timeout: 214k tokens, 0 pings, expiry 5:00 from now.
  await endTurn()
  await clock.advance(MIN)
  const before = await text()
  expect(before).toContain('4:00')
  expect(before).toContain('214k tokens')
  expect(before).toContain('first ping in 3:15')

  // The old reply arrives one minute later. It must leave the band as it was.
  release()
  await clock.settle()

  expect(await text()).toBe(before)
})

test('a turn that ends during a hung ping keeps its cache when the timeout fires', async ($, on) => {
  let release = () => {}
  const hold = new Promise<void>(resolve => {
    release = resolve
  })
  const { clock, endTurn, text } = world($, on, undefined, hold)

  await endTurn()
  await clock.advance(4 * MIN + 15_000)
  await $.turn.start({ text: 'next', turnId: 't2' })
  await $.turn.complete({
    answer: 'done',
    durationMs: 1,
    isAborted: false,
    reason: 'answer',
    turnId: 't2',
    usage: { ...usage, cache_read_input_tokens: 0, cache_creation_input_tokens: 214_000, model: 'm' },
  })
  await clock.advance(30_000)
  await clock.settle()

  const shown = await text()
  expect(shown).toContain('Cache warm')
  expect(shown).toContain('Keeping warm ·')
  expect(shown).not.toContain(PINGING)
  release()
})

test('Stop keeping warm during a hung ping still clears the ping when the timeout fires', async ($, on) => {
  const { clock, endTurn, text } = world($, on, undefined, never)

  await endTurn()
  await clock.advance(4 * MIN + 15_000)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'toggle' })
  await ui.unmount()
  await clock.advance(30_000)
  await clock.settle()

  const shown = await text()
  expect(shown).toBe('engine')
  expect(shown).not.toContain(PINGING)
})

test('the timeout of an older ping does not end a newer ping', async ($, on) => {
  const { clock, seen, endTurn, text } = world($, on, undefined, never)
  const press = async () => {
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'toggle' })
    await ui.unmount()
  }

  await endTurn()
  await clock.advance(4 * MIN + 15_000)
  await clock.advance(10_000)
  // Stop, then Keep warm: arm() sends a second ping at once.
  await press()
  await press()
  await clock.settle()
  expect(seen.forks).toBe(2)

  // The first ping times out here. The second is still waiting.
  await clock.advance(20_000)
  expect(await text()).toContain(PINGING)

  await clock.advance(10_000)
  await clock.settle()
  expect(await text()).not.toContain(PINGING)
})

test('Stop keeping warm cancels the pings and the cache is left to expire', async ($, on) => {
  const { clock, seen, endTurn, text } = world($, on)

  await endTurn()
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'toggle' })
  await ui.unmount()
  await clock.advance(4 * MIN + 50_000)

  expect(seen.forks).toBe(0)
  expect(await text()).toContain('Not keeping warm')
})
