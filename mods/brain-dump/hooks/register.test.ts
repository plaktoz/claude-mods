import { expect, test } from 'claude-code/testing'

import { SEND_IT, SEND_ORIGINAL, isRefinable, parseQuestions } from './register'

const LONG = 'so um yeah i think we should maybe look at the thing with the login and also '.repeat(8)
const QUESTION = 'Which login flow?'
const QUESTIONS = JSON.stringify([{ question: QUESTION, options: ['OAuth', 'Password'] }])
const DRAFT = 'Task: fix the login flow.\nWhy: Unspecified.\nGuardrails: Unspecified.\nDefinition of done: Unspecified.'

const composer = { kind: 'composer' }

test('only a long prompt the person typed is refined', () => {
  expect(isRefinable({ text: LONG, origin: composer })).toBe(true)
  expect(isRefinable({ text: 'fix the typo', origin: composer })).toBe(false)
  expect(isRefinable({ text: LONG })).toBe(false)
  expect(isRefinable({ text: LONG, origin: { kind: 'plugin' } })).toBe(false)
  expect(isRefinable({ text: LONG, origin: composer, command: {} })).toBe(false)
  expect(isRefinable({ text: LONG, origin: composer, isMeta: true })).toBe(false)
})

test('questions come out of a reply, capped at three, junk dropped', () => {
  expect(parseQuestions(`Sure:\n${QUESTIONS}`)).toEqual([{ question: QUESTION, options: ['OAuth', 'Password'] }])
  expect(parseQuestions('not json')).toEqual([])
  expect(parseQuestions('[1, "x", {"question": 2}]')).toEqual([])

  const many = JSON.stringify(Array.from({ length: 5 }, (_, i) => ({ question: `q${i}?`, options: ['a', 'b'] })))
  expect(parseQuestions(many)).toHaveLength(3)
})

const CONFIRM = 'Send the structured prompt?'

type Stubs = {
  verdict?: string
  questions?: string
  isRewriteFailing?: boolean
  // Answers by question text; a question left out is dismissed.
  answers?: Record<string, string>
}

// Stands for the engine beneath the mod. The mod's own calls (`$.model.*`,
// `$.ui.log`) are answered `{ value }`; `$.ui.ask` is a tool.call of
// AskUserQuestion; the prompt that reaches the bottom is the event's `{ text }`.
const run = async ($: any, on: any, stubs: Stubs, text = LONG, origin: { kind: string } = composer) => {
  const calls: string[] = []
  const sent: string[] = []

  on('model.classify', () => {
    calls.push('classify')

    return { value: stubs.verdict ?? 'messy' }
  })
  on('model.complete', (_: unknown, e: { model: string }) => {
    calls.push(`complete:${e.model}`)
    if (e.model !== 'haiku' && stubs.isRewriteFailing) {
      return { value: { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: {} } }
    }

    return { value: { isAnswered: true, text: e.model === 'haiku' ? stubs.questions ?? '[]' : DRAFT, usage: {} } }
  })
  on('tool.call', (_: unknown, e: { tool: string; questions?: { question: string }[] }) => {
    if (e.tool !== 'AskUserQuestion') return { result: {} }
    const question = e.questions?.[0]?.question ?? ''
    calls.push(`ask:${question}`)
    const answer = stubs.answers?.[question]
    if (answer === undefined) return { deny: 'dismissed' }

    return { result: { questions: e.questions, answers: { [question]: answer } } }
  })
  on('ui.log', () => ({ value: undefined }))
  on('prompt.submit', (_: unknown, e: { text: string }) => {
    sent.push(e.text)

    return { text: e.text }
  })

  await $.prompt.submit({ text, origin, wait: false })

  return { calls, sent }
}

test('a short prompt is sent as typed, with no model call', async ($, on) => {
  const { calls, sent } = await run($, on, {}, 'fix the typo in README')

  expect(calls).toEqual([])
  expect(sent).toEqual(['fix the typo in README'])
})

test('a prompt that is not the person\'s own is left alone', async ($, on) => {
  const { calls, sent } = await run($, on, {}, LONG, { kind: 'peer' })

  expect(calls).toEqual([])
  expect(sent).toEqual([LONG])
})

test('a clear prompt is sent as typed, with no question', async ($, on) => {
  const { calls, sent } = await run($, on, { verdict: 'clear' })

  expect(calls).toEqual(['classify'])
  expect(sent).toEqual([LONG])
})

test('a messy prompt asks its questions, then sends the draft on "Send it"', async ($, on) => {
  const { calls, sent } = await run($, on, {
    questions: QUESTIONS,
    answers: { [QUESTION]: 'OAuth', [CONFIRM]: SEND_IT },
  })

  expect(calls).toEqual(['classify', 'complete:haiku', `ask:${QUESTION}`, 'complete:sonnet', `ask:${CONFIRM}`])
  expect(sent).toEqual([DRAFT])
})

test('"Send my original" sends the prompt as typed', async ($, on) => {
  const { sent } = await run($, on, {
    questions: QUESTIONS,
    answers: { [QUESTION]: 'Password', [CONFIRM]: SEND_ORIGINAL },
  })

  expect(sent).toEqual([LONG])
})

test('dismissing the final choice sends the prompt as typed', async ($, on) => {
  const { sent } = await run($, on, { questions: QUESTIONS, answers: { [QUESTION]: 'OAuth' } })

  expect(sent).toEqual([LONG])
})

test('a dismissed question sends the prompt as typed, with no rewrite', async ($, on) => {
  const { calls, sent } = await run($, on, { questions: QUESTIONS })

  expect(calls).not.toContain('complete:sonnet')
  expect(sent).toEqual([LONG])
})

test('a failed rewrite sends the prompt as typed', async ($, on) => {
  const { sent } = await run($, on, { isRewriteFailing: true })

  expect(sent).toEqual([LONG])
})
