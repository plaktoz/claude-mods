import { expect, test } from 'claude-code/testing'

import { LABELS, SKIP, hasCue, isWatched, parseRule, settingsFrom } from './register'
import { ruleKey } from './save'

const RULE = 'Never use m-dashes in answers.'
const PROMPT = 'never use m-dashes in your answers, and fix the typo in the intro'
const composer = { kind: 'composer' }
const CUES = settingsFrom({ cues: "never,from now on,don't" }).cues

test('settings: destinations follow the switches, cues are split and lowercased', () => {
  const settings = settingsFrom({
    toAutoMemory: true,
    toProjectClaudeMd: true,
    toGlobalClaudeMd: false,
    cues: ' Always, from now on ,,Don’t ',
  })

  expect(settings.destinations).toEqual(['memory', 'project'])
  expect(settings.cues).toEqual(['always', 'from now on', "don't"])
  expect(settingsFrom({}).destinations).toEqual([])
})

test('only a short prompt the person typed is watched', () => {
  expect(isWatched({ text: PROMPT, origin: composer })).toBe(true)
  expect(isWatched({ text: PROMPT })).toBe(false)
  expect(isWatched({ text: PROMPT, origin: { kind: 'plugin' } })).toBe(false)
  expect(isWatched({ text: PROMPT, origin: { kind: 'peer' } })).toBe(false)
  expect(isWatched({ text: PROMPT, origin: composer, command: {} })).toBe(false)
  expect(isWatched({ text: PROMPT, origin: composer, isMeta: true })).toBe(false)
  expect(isWatched({ text: '   ', origin: composer })).toBe(false)
  expect(isWatched({ text: 'never '.repeat(300), origin: composer })).toBe(false)
})

test('a cue counts as whole words, in any case, with either apostrophe', () => {
  expect(hasCue('Never use m-dashes', CUES)).toBe(true)
  expect(hasCue('ok, from now on keep it short', CUES)).toBe(true)
  expect(hasCue('Don’t add comments', CUES)).toBe(true)
  expect(hasCue('whenever you can', CUES)).toBe(false)
  expect(hasCue('fix the typo', CUES)).toBe(false)
  expect(hasCue('anything', [])).toBe(false)
})

test('a rule is read from the first line of the reply; NONE and junk give nothing', () => {
  expect(parseRule(`"${RULE}"\nBecause...`)).toBe(RULE)
  expect(parseRule('  ' + RULE + '  ')).toBe(RULE)
  expect(parseRule('NONE')).toBeUndefined()
  expect(parseRule('none.')).toBeUndefined()
  expect(parseRule('')).toBeUndefined()
  expect(parseRule('x'.repeat(500))).toBeUndefined()
  expect(ruleKey('  Never   use M-dashes. ')).toBe('never use m-dashes.')
})

type Stubs = {
  reply?: string | ((prompt: string) => string)
  isFailing?: boolean
  throws?: boolean
  // The label to pick; undefined dismisses the dialog.
  choice?: string
  options?: Record<string, string | number | boolean>
}

// Stands for the engine beneath the mod: the mod's own `$.model.complete` and
// `$.ui.ask` calls are answered here and recorded.
const setup = ($: any, on: any, stubs: Stubs) => {
  const asked: { question: string; options: string[] }[] = []
  const prompts: string[] = []
  const sent: string[] = []

  on('model.complete', (_: unknown, e: { model: string; prompt: string }) => {
    prompts.push(e.prompt)
    if (stubs.throws) throw new Error('boom')
    if (stubs.isFailing) {
      return { value: { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: {} } }
    }
    const reply = typeof stubs.reply === 'function' ? stubs.reply(e.prompt) : stubs.reply ?? RULE

    return { value: { isAnswered: true, text: reply, usage: {} } }
  })
  on('tool.call', (_: unknown, e: { tool: string; questions?: { question: string; options: { label: string }[] }[] }) => {
    if (e.tool !== 'AskUserQuestion') return { result: {} }
    const q = e.questions![0]!
    asked.push({ question: q.question, options: q.options.map(o => o.label) })
    if (stubs.choice === undefined) return { deny: 'dismissed' }

    return { result: { questions: e.questions, answers: { [q.question]: stubs.choice } } }
  })
  on('prompt.submit', (_: unknown, e: { text: string }) => {
    sent.push(e.text)

    return { text: e.text }
  })
  on('turn.complete', (_: unknown, e: { answer: string }) => ({ text: e.answer }))
  on('ui.toast', () => ({ value: undefined }))

  return { asked, prompts, sent }
}

const submit = ($: any, text: string, origin: { kind: string } = composer, extra: object = {}) =>
  $.prompt.submit({ text, origin, wait: false, ...extra })

const endTurn = ($: any, extra: object = {}) =>
  $.turn.complete({ answer: 'done', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer', ...extra })

test('a prompt with a rule is offered after the reply, not before', async ($, on) => {
  const { asked } = setup($, on, { choice: SKIP })

  await submit($, PROMPT)
  expect(asked).toEqual([])

  await endTurn($)
  expect(asked).toHaveLength(1)
  expect(asked[0]!.question).toContain(RULE)
  expect(asked[0]!.options).toEqual([LABELS.memory, LABELS.project, SKIP])
})

test('the prompt itself is never held or changed', async ($, on) => {
  const { sent } = setup($, on, {})

  await submit($, PROMPT)

  expect(sent).toEqual([PROMPT])
})

test('a one-off task, with no cue word, makes no model call', async ($, on) => {
  const { asked, prompts } = setup($, on, { choice: SKIP })

  await submit($, 'fix the typo in the intro')
  await endTurn($)

  expect(prompts).toEqual([])
  expect(asked).toEqual([])
})

test('a cue word in a one-off task is dropped when haiku says NONE', async ($, on) => {
  const { asked, prompts } = setup($, on, { reply: 'NONE', choice: SKIP })

  await submit($, 'never mind, rename it to index.ts')
  await endTurn($)

  expect(prompts).toHaveLength(1)
  expect(asked).toEqual([])
})

test('a command, a meta message, a plugin, a peer and a long prompt are ignored', async ($, on) => {
  const { asked, prompts } = setup($, on, { choice: SKIP })

  await submit($, PROMPT, { kind: 'plugin' })
  await submit($, PROMPT, { kind: 'peer' })
  await submit($, PROMPT, composer, { isMeta: true })
  await submit($, PROMPT, composer, { command: { name: 'x' } })
  await submit($, PROMPT + ' ' + 'word '.repeat(300))
  await endTurn($)

  expect(prompts).toEqual([])
  expect(asked).toEqual([])
})

test('a rule already handled is not asked about again', async ($, on) => {
  const { asked } = setup($, on, { choice: SKIP })

  await submit($, PROMPT)
  await endTurn($)
  await submit($, PROMPT)
  await endTurn($)

  expect(asked).toHaveLength(1)
})

test('the prompt is asked about once: a second turn end has nothing recorded', async ($, on) => {
  const { prompts } = setup($, on, { choice: SKIP })

  await submit($, PROMPT)
  await endTurn($)
  await endTurn($)

  expect(prompts).toHaveLength(1)
})

test('a failed or throwing model call is silent and asks nothing', async ($, on) => {
  const failing = setup($, on, { isFailing: true, choice: SKIP })

  await submit($, PROMPT)
  await endTurn($)

  expect(failing.prompts).toHaveLength(1)
  expect(failing.asked).toEqual([])
})

test('a throwing model call is silent', async ($, on) => {
  const { asked } = setup($, on, { throws: true, choice: SKIP })

  await submit($, PROMPT)
  await endTurn($)

  expect(asked).toEqual([])
})

test('a dismissed dialog does not fail the turn', async ($, on) => {
  const { asked } = setup($, on, {})

  await submit($, PROMPT)
  await endTurn($)

  expect(asked).toHaveLength(1)
})

test('an interrupted turn drops the recorded prompt', async ($, on) => {
  const { asked, prompts } = setup($, on, { choice: SKIP })

  await submit($, PROMPT)
  await endTurn($, { reason: 'aborted', isAborted: true })
  await endTurn($)

  expect(prompts).toEqual([])
  expect(asked).toEqual([])
})

test('a subagent\'s turn end does not use up the recorded prompt', async ($, on) => {
  const { asked } = setup($, on, { choice: SKIP })

  await submit($, PROMPT)
  await endTurn($, { agentId: 'a1' })
  expect(asked).toEqual([])

  await endTurn($)
  expect(asked).toHaveLength(1)
})

test('the global file is not offered by default', async ($, on) => {
  const { asked } = setup($, on, { choice: SKIP })

  await submit($, PROMPT)
  await endTurn($)

  expect(asked[0]!.options).not.toContain(LABELS.global)
})

test('with every destination off the mod does nothing', { options: { toAutoMemory: false, toProjectClaudeMd: false } }, async ($, on) => {
  const { asked, prompts } = setup($, on, { choice: SKIP })

  await submit($, PROMPT)
  await endTurn($)

  expect(prompts).toEqual([])
  expect(asked).toEqual([])
})

test('with the global file on, all three destinations and Skip are offered', { options: { toGlobalClaudeMd: true } }, async ($, on) => {
  const { asked } = setup($, on, { choice: SKIP })

  await submit($, PROMPT)
  await endTurn($)

  expect(asked[0]!.options).toEqual([LABELS.memory, LABELS.project, LABELS.global, SKIP])
})

test('two prompts typed in one turn are each checked', async ($, on) => {
  const { asked } = setup($, on, {
    choice: SKIP,
    reply: prompt => (prompt.includes('dashes') ? RULE : 'Keep hooks under 12 words.'),
  })

  await submit($, PROMPT)
  await submit($, 'also keep LinkedIn hooks under 12 words')
  await endTurn($)

  expect(asked).toHaveLength(2)
})
