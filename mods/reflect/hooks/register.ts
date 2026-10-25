import { atom, read, update } from 'claude-code'
import type { EngineInterfaceBuilt, PluginOptions, Register } from 'claude-code'

import type { Pending } from '../types'
import { ruleKey, saveRule } from './save'
import type { Destination, SaveResult } from './save'

// A rule is a short sentence. A long prompt is a task, and it would match a
// cue word by chance.
const MAX_PROMPT_CHARS = 1000
const MAX_PENDING = 5
const MAX_HANDLED = 200
const MAX_RULE_CHARS = 200

const RULE_SYSTEM = `You look for a lasting rule in a message a person typed to an AI assistant.
A lasting rule is an instruction about how to work that applies to every later task, not only to this one: a style, a format, a limit, a habit or a way of doing the work.
Not a rule: a request for one task, a question, a fix for the current file, a preference for this answer only.

If the message holds a lasting rule, reply with that rule in one short imperative sentence, with no quotes and no extra words.
If it holds more than one, reply with the most important one.
If it holds none, reply NONE.`

export const SKIP = 'Skip'

export type { Destination }

export const LABELS: Record<Destination, string> = {
  memory: 'Auto memory',
  project: 'Project CLAUDE.md',
  global: 'Global CLAUDE.md',
}

export type Settings = { destinations: Destination[]; cues: string[] }

type Submission = { text: string; origin?: { kind: string }; command?: unknown; isMeta?: boolean }
type Engine = EngineInterfaceBuilt

// Change the tags when the contract's fields change: they decline older values.
const pending = atom({ plugin: 'reflect', key: 'pending' } as const, [] as Pending)
const handled = atom({ plugin: 'reflect', key: 'handled' } as const, [] as string[])

// Straight quotes and one case, so "Don't" and "don’t" meet the cue "don't".
const plain = (text: string) => text.replace(/[‘’]/g, "'").toLowerCase()

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const settingsFrom = (options: PluginOptions): Settings => {
  const destinations: Destination[] = []
  if (options.toAutoMemory === true) destinations.push('memory')
  if (options.toProjectClaudeMd === true) destinations.push('project')
  if (options.toGlobalClaudeMd === true) destinations.push('global')

  const cues = String(options.cues ?? '')
    .split(',')
    .map(cue => plain(cue.trim()))
    .filter(cue => cue !== '')

  return { destinations, cues }
}

// Only the person's own typed prompts are watched: not commands, not
// engine-made messages, not notifications or peers, and not long prompts.
export const isWatched = (e: Submission) =>
  e.origin?.kind === 'composer' &&
  !e.command &&
  !e.isMeta &&
  e.text.trim() !== '' &&
  e.text.length <= MAX_PROMPT_CHARS

// True when the text holds one of the cues as whole words.
export const hasCue = (text: string, cues: readonly string[]) => {
  if (cues.length === 0) return false
  const edge = '[^\\p{L}\\p{N}]'
  const found = new RegExp(`(?:^|${edge})(?:${cues.map(escape).join('|')})(?:$|${edge})`, 'u')

  return found.test(plain(text))
}

// The one-line rule in a reply, or undefined for NONE or an unusable reply.
export const parseRule = (reply: string): string | undefined => {
  const line = reply
    .trim()
    .split('\n')[0]!
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim()
  if (line === '' || /^none\b/i.test(line) || line.length > MAX_RULE_CHARS) return undefined

  return line
}

// Returns the rule the prompt holds, or undefined. A failed request is silent.
const ruleFrom = async ($: Engine, text: string): Promise<string | undefined> => {
  try {
    const reply = await $.model.complete({
      model: 'haiku',
      system: RULE_SYSTEM,
      prompt: text,
      maxTokens: 120,
      effort: 'low',
      timeoutMs: 20000,
    })

    return reply.isAnswered ? parseRule(reply.text) : undefined
  } catch {
    return undefined
  }
}

// Asks where to save the rule. Undefined means skip: a skip, free text under
// "Other" or a dismissed dialog.
const chooseDestination = async ($: Engine, rule: string, destinations: Destination[]) => {
  try {
    const choice = await $.ui.ask(`Save this rule for later?\n${rule}`, {
      options: [...destinations.map(d => LABELS[d]), SKIP],
      header: 'Reflect',
    })

    return destinations.find(d => LABELS[d] === choice)
  } catch {
    return undefined
  }
}

// Saves the rule and says so. A failed write saves nothing and stays silent.
const keep = async ($: Engine, destination: Destination, rule: string) => {
  let result: SaveResult
  try {
    result = await saveRule($, destination, rule)
  } catch {
    return
  }

  try {
    $.ui.toast(result === 'saved' ? `Saved to ${LABELS[destination]}.` : `Already in ${LABELS[destination]}.`)
  } catch {
    // The rule is saved; the notice is only a courtesy.
  }
}

// Looks at each prompt recorded this turn, and asks about the rule it holds.
const offerRules = async ($: Engine, settings: Settings) => {
  const prompts = await read($, pending)
  if (prompts.length === 0) return
  await update($, pending, () => [])

  for (const prompt of prompts) {
    const rule = await ruleFrom($, prompt)
    if (rule === undefined) continue

    const key = ruleKey(rule)
    if ((await read($, handled)).includes(key)) continue
    await update($, handled, list => [...list, key].slice(-MAX_HANDLED))

    const destination = await chooseDestination($, rule, settings.destinations)
    if (destination !== undefined) await keep($, destination, rule)
  }
}

export const register: Register = (on, options) => {
  const settings = settingsFrom(options)

  // With no destination there is nothing to offer, so nothing is checked.
  if (settings.destinations.length === 0) return

  on('prompt.submit', async ($, e, next) => {
    if (isWatched(e) && hasCue(e.text, settings.cues)) {
      await update($, pending, list => [...list, e.text].slice(-MAX_PENDING))
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)

    // A subagent's turn is not the person's. An interrupted or failed turn
    // drops what was recorded: the person is not waiting on a reply.
    if (e.agentId !== undefined) return result
    if (e.reason !== 'answer') {
      await update($, pending, () => [])
      return result
    }

    try {
      await offerRules($, settings)
    } catch {
      // A failed state read or write saves nothing and stays silent.
    }

    return result
  })
}
