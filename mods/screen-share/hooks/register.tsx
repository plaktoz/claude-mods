import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ScreenShareNames } from '../types'

// Screen-share mode masks what the transcript draws, never what it stores:
// every rewrite below is a ui.render rewrite, so the model reads the real data.

const isOn = atom({ plugin: 'screen-share', key: 'isOn' } as const, false)
// Change the tag when the list's meaning changes: it declines what an earlier version stored.
const names = atom({ plugin: 'screen-share', key: 'names' } as const, [] as ScreenShareNames, {
  shape: 'names-1',
})

const STORE_KEY = 'isOn'
const TOOL_PREFIX = 'mcp__screen-share__'
const HIDE_NAMES = `${TOOL_PREFIX}hide_names`
const MAX_NAMES = 500
// How much text one name scan reads, and how many of those the history scan runs.
const SCAN_CHARS = 20_000
const HISTORY_CHUNKS = 3

const BAR = '░'
const bar = (s: string) => s.replace(/\S/g, BAR)

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu
// Prefixed forms come first so `S$5` is masked whole, not left as `S` and a bar.
const MONEY_BEFORE =
  /(?:\b(?:US|S|A|C|NZ|HK)\$|[$€£¥₹]|\b(?:USD|EUR|GBP|SGD|AUD|CAD|JPY|INR|CHF)\s?)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:[kKmMbB]|mn|bn|thousand|million|billion))?(?![\p{L}\p{N}])/gu
const MONEY_AFTER =
  /(?<![\p{L}\p{N}])\d[\d,]*(?:\.\d+)?\s?(?:USD|EUR|GBP|SGD|AUD|CAD|JPY|INR|CHF|dollars|euros|pounds)(?!\p{L})/giu
const PHONE = /(?<![\p{L}\p{N}_./:-])\+?\(?\d[\d ().-]{5,}\d(?![\p{L}\p{N}_])/gu

// A phone number has 7 to 15 digits in groups (or a leading +); dates and IPs are not one.
function isPhone(m: string) {
  const digits = m.replace(/\D/g, '').length
  if (digits < 7 || digits > 15) return false
  if (/^\d{4}-\d{2}-\d{2}/.test(m) || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(m)) return false

  return m.startsWith('+') || /[ ().-]/.test(m)
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The names pattern is rebuilt only when the list changes.
let namesKey = ''
let namesPattern: RegExp | null = null

function namePattern(list: readonly string[]) {
  const key = list.join('\n')
  if (key !== namesKey) {
    namesKey = key
    const alts = [...list].sort((a, b) => b.length - a.length).map(escape)
    namesPattern =
      alts.length === 0 ? null : new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join('|')})(?![\\p{L}\\p{N}])`, 'gu')
  }

  return namesPattern
}

export function mask(text: string, list: readonly string[]) {
  let out = text
    .replace(EMAIL, bar)
    .replace(MONEY_BEFORE, bar)
    .replace(MONEY_AFTER, bar)
    .replace(PHONE, m => (isPhone(m) ? bar(m) : m))
  const pattern = namePattern(list)
  if (pattern) out = out.replace(pattern, bar)

  return out
}

// Masks every string inside a tool's input or output, keeping its shape.
function deepMask(value: unknown, fn: (s: string) => string): unknown {
  if (typeof value === 'string') return fn(value)
  if (Array.isArray(value)) return value.map(v => deepMask(v, fn))
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = deepMask(v, fn)

    return out
  }

  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// True when masking would change any string inside the value.
function masks(value: unknown, list: readonly string[]) {
  return JSON.stringify(deepMask(value, s => mask(s, list))) !== JSON.stringify(value)
}

// Masks every string of an object except the keys in `keep`, which stay as they are.
function maskExcept(value: Record<string, unknown>, keep: readonly string[], fn: (s: string) => string) {
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, keep.includes(k) ? v : deepMask(v, fn)]))
}

// The header, option descriptions and previews are masked. The question and the option
// labels stay: the answer the person gives is the label they chose, keyed by the question.
function maskAsk(questions: unknown[], list: readonly string[]) {
  const fn = (s: string) => mask(s, list)

  return questions.map(q => {
    if (!isRecord(q)) return q
    const out = maskExcept(q, ['question', 'options'], fn)
    if (!Array.isArray(q.options)) return out

    return { ...out, options: q.options.map(o => (isRecord(o) ? maskExcept(o, ['label'], fn) : o)) }
  })
}

// A full name and each capitalised part of it, so "Jane" alone is masked too.
function expand(found: readonly string[]) {
  const out: string[] = []
  for (const name of found) {
    const trimmed = name.trim()
    if (trimmed.length < 2 || trimmed.length > 60) continue
    out.push(trimmed)
    for (const part of trimmed.split(/\s+/)) {
      if (part.length >= 2 && /^\p{Lu}/u.test(part)) out.push(part)
    }
  }

  return out.filter(n => n !== 'Claude')
}

export async function addNames($: EngineInterface, found: readonly string[]) {
  const more = expand(found)
  if (more.length === 0) return
  await update($, names, list => [...new Set([...list, ...more])].slice(-MAX_NAMES))
}

const NAME_SYSTEM = `You find people's names in text for a screen-share privacy filter.
Return a JSON array of every person's name as it is written in the text: full names, and first or last names that appear alone.
Leave out company, product, place, brand and software names.
Return [] when there are none. Output only the JSON array.`

function parseNames(text: string) {
  const json = text.match(/\[[\s\S]*\]/)?.[0]
  if (json === undefined) return []
  try {
    const parsed: unknown = JSON.parse(json)

    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string') : []
  } catch {
    return []
  }
}

// Asks a small model which words are people's names; a failed call finds none.
async function learnNames($: EngineInterface, text: string) {
  const sample = text.slice(-SCAN_CHARS)
  if (!/\p{Lu}\p{Ll}/u.test(sample)) return
  const reply = await $.model.complete({
    model: 'haiku',
    system: NAME_SYSTEM,
    prompt: `<text>\n${sample}\n</text>`,
    maxTokens: 600,
    timeoutMs: 8000,
  })
  if (reply.isAnswered) await addNames($, parseNames(reply.text))
}

// Scans the recent conversation for names, in a few chunks at once.
async function learnHistory($: EngineInterface) {
  const rows = await $.session.messages()
  const text = rows
    .map(row => [row.text, ...row.toolUses.map(use => `${JSON.stringify(use.input)}\n${use.text ?? ''}`)].join('\n'))
    .join('\n')
    .slice(-SCAN_CHARS * HISTORY_CHUNKS)
  const chunks: string[] = []
  for (let at = 0; at < text.length; at += SCAN_CHARS) chunks.push(text.slice(at, at + SCAN_CHARS))
  await Promise.all(chunks.map(chunk => learnNames($, chunk)))
}

async function setMode($: EngineInterface, value: boolean) {
  await update($, isOn, () => value)
  await $.store.set(STORE_KEY, value)
  if (value) await learnHistory($)
}

const ON_TEXT =
  'Screen-share is on. Names, emails, phone numbers and amounts now show as shaded bars. Claude still reads the real data.'
const OFF_TEXT = 'Screen-share is off. Everything shows as normal again.'

const MODE_PROMPT = `Screen-share mode is on: the person is showing this session to others.
Names, emails, phone numbers and money amounts are masked on screen automatically; you still read the real data, so keep working as normal and do not avoid or reword them.
Before you write a person's name that has not appeared earlier in this conversation, call ${HIDE_NAMES} with it so it is masked before it shows.`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'screen-share',
      description: 'Toggle screen-share mode: hide names, emails, phones and amounts on screen',
      argumentHint: '[on|off]',
      immediate: true,
    })
    await $.tool.register({
      name: 'set_mode',
      description:
        'Turns screen-share mode on or off. While on, names, emails, phone numbers and amounts are masked on screen (you still read them). Call it when the person is about to share or record their screen, or asks to leave that mode.',
      inputSchema: { type: 'object', properties: { on: { type: 'boolean' } }, required: ['on'] },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'hide_names',
      description:
        'In screen-share mode, masks these people\'s names on screen from now on. Call it before writing a name that has not appeared in the conversation yet.',
      inputSchema: {
        type: 'object',
        properties: { names: { type: 'array', items: { type: 'string' } } },
        required: ['names'],
      },
      isDeferred: false,
    })
    // The mode outlives the session, so a new session mid-call starts masked.
    if ((await $.store.get(STORE_KEY)) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'screen-share' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const value = arg === 'on' ? true : arg === 'off' ? false : !(await read($, isOn))
    await setMode($, value)

    return { text: value ? ON_TEXT : OFF_TEXT }
  })

  on('tool.call', { tool: 'mcp__screen-share__set_mode' }, async ($, e) => {
    const value = (e as unknown as { on?: unknown }).on === true
    await setMode($, value)

    return { result: value ? ON_TEXT : OFF_TEXT }
  }).catch(() => ({ deny: 'screen-share: the mode could not be changed.' }))

  on('tool.call', { tool: 'mcp__screen-share__hide_names' }, async ($, e) => {
    const given = (e as unknown as { names?: unknown }).names
    const list = Array.isArray(given) ? given.filter((n): n is string => typeof n === 'string') : []
    await addNames($, list)

    return { result: `Masking ${list.length} name${list.length === 1 ? '' : 's'} on screen.` }
  }).catch(() => ({ deny: 'screen-share: the names could not be added.' }))

  // Learns the names in what a tool returned before its row is drawn.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.tool.startsWith(TOOL_PREFIX) || !(await read($, isOn))) return ran
    const { tool: _tool, tool_use_id: _id, ...input } = e as unknown as Record<string, unknown>
    await learnNames($, `${JSON.stringify(input)}\n${ran.text ?? ''}`)

    return ran
  }).catch(($, e, next) => next(e))

  on('prompt.submit', async ($, e, next) => {
    if (e.command === undefined && (await read($, isOn))) await learnNames($, e.text)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (await read($, isOn)) await learnNames($, e.answer)

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!(await read($, isOn))) return composed

    return { sections: [...composed.sections, { id: 'screen-share:mode', text: MODE_PROMPT, scope: 'session' }] }
  })

  // The transcript's rows: each drawn masked, each stored as it was.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)
    const text = mask(e.props.text, await read($, names))

    return text === e.props.text ? next(e) : next({ ...e, props: { ...e.props, text } })
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)
    const text = mask(e.props.text, await read($, names))

    return text === e.props.text ? next(e) : next({ ...e, props: { ...e.props, text } })
  })

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)
    const text = mask(e.props.text, await read($, names))

    return text === e.props.text ? next(e) : next({ ...e, props: { ...e.props, text } })
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)
    const list = await read($, names)
    const fn = (s: string) => mask(s, list)
    // hide_names carries names not yet on the list: its own input is always barred.
    const input = e.props.tool === HIDE_NAMES ? deepMask(e.props.input, bar) : deepMask(e.props.input, fn)
    const output = e.props.output === undefined ? undefined : deepMask(e.props.output, fn)

    return next({ ...e, props: { ...e.props, input, output } })
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)
    const list = await read($, names)

    return next({ ...e, props: { ...e.props, output: deepMask(e.props.output, s => mask(s, list)) } })
  })

  // A folded group shows a count, and a rewrite of its calls is not drawn. So a group whose
  // calls hold a match unfolds, and each row it unfolds into draws masked through ToolUse.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)
    const list = await read($, names)
    const hit = e.props.calls.some(c => masks({ input: c.input, output: c.output }, list))

    return hit && !e.props.isExpanded ? next({ ...e, props: { ...e.props, isExpanded: true } }) : next(e)
  })

  // The ask dialog: the question and the option labels stay, since the answer is keyed on them.
  on('ui.render', { component: 'AskUserQuestion' }, async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)
    const questions = maskAsk(e.props.questions, await read($, names))

    return next({ ...e, props: { ...e.props, questions } })
  })

  on('ui.render', { component: 'InfoNotice' }, async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)
    const text = mask(e.props.text, await read($, names))

    return text === e.props.text ? next(e) : next({ ...e, props: { ...e.props, text } })
  })

  // The band sits under any other plugin's band, so theirs still shows.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isOn))) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {await next(e)}
        <Box flexDirection="row" justifyContent="space-between">
          <Text>
            <Text color="claude">● </Text>
            <Text bold>Screen-share mode: </Text>
            <Text dimColor>emails, phones, amounts and names hidden on screen</Text>
          </Text>
          <Button
            key="off"
            label="Turn off"
            onPress={() =>
              setMode($, false).catch(() =>
                $.ui.toast('Screen-share is off now, but the change was not saved. It may return in a new session.'),
              )
            }
          />
        </Box>
      </Box>
    )
  })
}
