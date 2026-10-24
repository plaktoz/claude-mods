import { expect, mock, test } from 'claude-code/testing'

const composer = { kind: 'composer' }
const HANDOFF = 'Goal: ship the login fix.\nProgress: none.\nCurrent state: idle.\nNext steps: test.\nContext: none.'
const MAKE = 'Make a handoff'
const STAY = 'Continue here'
const MINUTE = 60_000

type Stubs = {
  // Answers any handoff question; left out, the question is dismissed.
  choice?: string
  isCopyFailing?: boolean
  isForkFailing?: boolean
}

// Stands for the engine beneath the mod. `$.ui.ask` is a tool.call of
// AskUserQuestion; the prompt that reaches the bottom is the event's `{ text }`.
const world = ($: any, on: any, stubs: Stubs = {}) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const seen = { asks: [] as string[], copied: [] as string[], toasts: [] as string[], sent: [] as string[], forks: [] as string[] }

  on('command.register', () => ({ value: undefined }))
  on('session.measure', (_: unknown, e: { changed: string[] }) => ({ changed: e.changed }))
  on('turn.complete', (_: unknown, e: { answer: string }) => ({ text: e.answer }))
  on('ui.toast', (_: unknown, e: { text: string }) => {
    seen.toasts.push(e.text)

    return { value: undefined }
  })
  on('ui.copy', (_: unknown, e: { text: string }) => {
    seen.copied.push(e.text)

    return { value: stubs.isCopyFailing ? { isCopied: false, reason: 'no-clipboard' } : { isCopied: true } }
  })
  on('model.fork', (_: unknown, e: { prompt: string }) => {
    seen.forks.push(e.prompt)
    if (stubs.isForkFailing) return { value: { isAnswered: false, reason: 'api-error', usage: {} } }

    return { value: { isAnswered: true, text: HANDOFF, usage: {} } }
  })
  on('tool.call', (_: unknown, e: { tool: string; questions?: { question: string }[] }) => {
    if (e.tool !== 'AskUserQuestion') return { result: {} }
    const question = e.questions?.[0]?.question ?? ''
    seen.asks.push(question)
    if (stubs.choice === undefined) return { deny: 'dismissed' }

    return { result: { questions: e.questions, answers: { [question]: stubs.choice } } }
  })
  on('prompt.submit', (_: unknown, e: { text: string }) => {
    seen.sent.push(e.text)

    return { text: e.text }
  })

  const submit = (text: string, origin: { kind: string } = composer) => $.prompt.submit({ text, origin, wait: false })
  const measure = (tokens: number) =>
    $.session.measure({ context: { tokens, window: 1_000_000 }, rateLimits: [], changed: ['context'] })
  const endTurn = () => $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, reason: 'answer', turnId: 't1' })

  return { clock, seen, submit, measure, endTurn }
}

test('the first prompt is recorded as the goal and sent untouched', async ($, on) => {
  const { seen, submit } = world($, on)

  await submit('fix the login flow')
  await $.command.run({ command: 'handover' })

  expect(seen.sent).toEqual(['fix the login flow'])
  expect(seen.forks[0]).toContain('First request: fix the login flow')
})

test('/handover copies a handoff built from the session, tools included', async ($, on) => {
  const { seen, submit } = world($, on)

  await submit('fix the login flow')
  await $.tool.call({ tool: 'Read', file_path: '/repo/login.ts' })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/login.ts', old_string: 'a', new_string: 'b' })
  const result = await $.command.run({ command: 'handover' })

  expect(seen.copied).toHaveLength(1)
  expect(seen.copied[0]).toContain(HANDOFF)
  expect(seen.copied[0]).not.toContain('Next request')
  // A file that was edited is listed once, as edited.
  expect(seen.forks[0]).toContain('Files edited:\n- /repo/login.ts')
  expect(seen.forks[0]).toContain('Files read: none')
  expect(result.text).toContain('copied to the clipboard')
})

test('/handover falls back to the facts when the fork fails, and prints the text if the copy fails', async ($, on) => {
  const { seen, submit } = world($, on, { isForkFailing: true, isCopyFailing: true })

  await submit('fix the login flow')
  const result = await $.command.run({ command: 'handover' })

  expect(seen.copied[0]).toContain('Goal: fix the login flow')
  expect(result.text).toContain('Could not copy')
  expect(result.text).toContain(seen.copied[0])
})

test('crossing 250k tokens toasts once and asks at the next prompt', async ($, on) => {
  const { seen, submit, measure } = world($, on, { choice: STAY })

  await submit('fix the login flow')
  await measure(100_000)
  expect(seen.toasts).toEqual([])

  await measure(260_000)
  await measure(270_000)
  expect(seen.toasts).toHaveLength(1)
  expect(seen.toasts[0]).toContain('260k')

  await submit('now the signup flow')
  expect(seen.asks).toHaveLength(1)
  expect(seen.asks[0]).toContain('passed 250k tokens')
  expect(seen.sent).toEqual(['fix the login flow', 'now the signup flow'])

  // Declining clears the offer: the next prompt is not asked again.
  await submit('and the logout flow')
  expect(seen.asks).toHaveLength(1)
})

test('accepting the offer copies a handoff that carries the prompt, and drops it here', async ($, on) => {
  const { seen, submit, measure } = world($, on, { choice: MAKE })

  await submit('fix the login flow')
  await measure(300_000)
  const result = await submit('now the signup flow')

  expect(seen.sent).toEqual(['fix the login flow'])
  expect(result.drop).toContain('copied to the clipboard')
  expect(seen.copied[0]).toContain(HANDOFF)
  expect(seen.copied[0]).toContain('Next request:\nnow the signup flow')
})

test('a dismissed question sends the prompt on as typed', async ($, on) => {
  const { seen, submit, measure } = world($, on)

  await submit('fix the login flow')
  await measure(300_000)
  await submit('now the signup flow')

  expect(seen.sent).toEqual(['fix the login flow', 'now the signup flow'])
  expect(seen.copied).toEqual([])
})

test('a prompt after a cold cache is asked about; a warm one is not', async ($, on) => {
  const { clock, seen, submit, endTurn } = world($, on, { choice: STAY })

  await submit('fix the login flow')
  await endTurn()

  await clock.advance(4 * MINUTE)
  await submit('warm follow-up')
  expect(seen.asks).toEqual([])

  await endTurn()
  await clock.advance(7 * MINUTE)
  await submit('cold follow-up')
  expect(seen.asks).toHaveLength(1)
  expect(seen.asks[0]).toContain('idle 7 minutes')
})

test('a subagent finishing does not reset the idle clock', async ($, on) => {
  const { clock, seen, submit, endTurn } = world($, on, { choice: STAY })

  await submit('fix the login flow')
  await endTurn()
  await clock.advance(7 * MINUTE)
  await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, reason: 'answer', turnId: 't2', agentId: 'a1' })
  await submit('follow-up')

  expect(seen.asks).toHaveLength(1)
})

test('prompts that are not the person\'s own are never asked about', async ($, on) => {
  const { clock, seen, submit, measure, endTurn } = world($, on, { choice: MAKE })

  await submit('fix the login flow')
  await endTurn()
  await measure(300_000)
  await clock.advance(10 * MINUTE)

  await submit('from a peer', { kind: 'peer' })
  await $.prompt.submit({ text: 'hidden', origin: composer, isMeta: true, wait: false })
  await $.prompt.submit({ text: '/compact', origin: composer, command: { name: 'compact', args: '' }, wait: false })

  expect(seen.asks).toEqual([])
  expect(seen.sent).toEqual(['fix the login flow', 'from a peer', 'hidden', '/compact'])
})
