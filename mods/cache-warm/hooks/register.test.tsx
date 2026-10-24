import { expect, mock, test } from 'claude-code/testing'

const MIN = 60_000
const BAND = {
  plugin: 'cache-warm',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const usage = { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 200_000, cache_creation_input_tokens: 0 }

const world = ($: any, on: any, reply: any = { isAnswered: true, text: 'ok', usage }) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const seen = { forks: 0, toasts: [] as string[] }

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
  on('model.fork', () => {
    seen.forks += 1

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
