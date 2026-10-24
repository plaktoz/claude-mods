import { atom, read, update } from 'claude-code'
import type { EngineInterfaceBuilt, Register } from 'claude-code'

import type { Inventory, Pending } from '../types'

const TOKEN_THRESHOLD = 250_000
// The default prompt-cache TTL. The engine exposes no cache-warm signal, so
// idle time since the last turn ended stands in for it.
const CACHE_TTL_MS = 5 * 60 * 1000
const LIST_LIMIT = 50

const EMPTY: Inventory = { goal: null, read: [], edited: [], urls: [], skills: [], tools: {} }

// Change the tag when Inventory's fields change: it declines older values.
const inventory = atom({ plugin: 'handoff', key: 'inventory' } as const, EMPTY, {
  shape: 'inventory-1',
})
const pending = atom({ plugin: 'handoff', key: 'pending' } as const, null as Pending)
const lastTurnEnd = atom({ plugin: 'handoff', key: 'lastTurnEnd' } as const, null as number | null)
const hasOfferedTokens = atom({ plugin: 'handoff', key: 'hasOfferedTokens' } as const, false)

const HANDOFF_PROMPT = `Write a handoff so a fresh Claude session can continue this work without the conversation.
Use these sections, each with its label, and keep it under 400 words:

Goal: what we are trying to achieve and why.
Progress: what is done, with the decisions made and their reasons.
Current state: what is in progress right now, and anything broken or unverified.
Next steps: the immediate next actions, in order.
Context: the files, skills, tools and links below that still matter, with a few words on each.

Use only what this conversation shows. Reply with the handoff only.`

const addUnique = (list: string[], item: string) =>
  list.includes(item) ? list : [...list, item].slice(-LIST_LIMIT)

const describe = (inv: Inventory) => {
  const section = (label: string, items: string[]) =>
    items.length ? `${label}:\n${items.map(item => `- ${item}`).join('\n')}` : `${label}: none`
  const tools = Object.entries(inv.tools)
    .sort(([, a], [, b]) => b - a)
    .map(([tool, count]) => `${tool} (${count})`)

  return [
    `First request: ${inv.goal ?? 'unknown'}`,
    section('Files edited', inv.edited),
    section('Files read', inv.read.filter(file => !inv.edited.includes(file))),
    section('Skills used', inv.skills),
    section('Links fetched', inv.urls),
    section('Tools used', tools),
  ].join('\n\n')
}

type Engine = EngineInterfaceBuilt

async function buildHandoff($: Engine, nextRequest?: string) {
  const inv = await read($, inventory)
  const facts = describe(inv)
  const reply = await $.model.fork({ prompt: `${HANDOFF_PROMPT}\n\n${facts}` })
  const body = reply.isAnswered ? reply.text.trim() : `Goal: ${inv.goal ?? 'unknown'}\n\n${facts}`

  return [
    'Continue the work described in this handoff from a previous session.',
    body,
    nextRequest ? `Next request:\n${nextRequest}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

async function deliver($: Engine, text: string) {
  const { isCopied } = await $.ui.copy({ text })
  await update($, pending, () => null)

  return isCopied
    ? 'Handoff copied to the clipboard. Start a fresh chat (/clear or a new session) and paste it.'
    : `Could not copy the handoff. Here it is:\n\n${text}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'handover',
      description: 'Package this session into a prompt for a fresh chat',
    })

    return next(e)
  })

  on('command.run', { command: 'handover' }, async $ => {
    const text = await buildHandoff($)

    return { text: await deliver($, text) }
  })

  on('tool.call', async ($, e, next) => {
    await update($, inventory, inv => {
      const tools = { ...inv.tools, [e.tool]: (inv.tools[e.tool] ?? 0) + 1 }
      if (e.tool === 'Read') return { ...inv, tools, read: addUnique(inv.read, e.file_path) }
      if (e.tool === 'Edit' || e.tool === 'Write') {
        return { ...inv, tools, edited: addUnique(inv.edited, e.file_path) }
      }
      if (e.tool === 'WebFetch') return { ...inv, tools, urls: addUnique(inv.urls, e.url) }
      if (e.tool === 'Skill') return { ...inv, tools, skills: addUnique(inv.skills, e.skill) }

      return { ...inv, tools }
    })

    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.measure', async ($, e, next) => {
    const tokens = e.context.tokens ?? 0
    if (tokens >= TOKEN_THRESHOLD && !(await read($, hasOfferedTokens))) {
      await update($, hasOfferedTokens, () => true)
      await update($, pending, () => 'tokens')
      $.ui.toast(`Context passed ${Math.round(tokens / 1000)}k tokens. Run /handover, or you'll be asked at your next prompt.`)
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const now = await $.clock.now()
      await update($, lastTurnEnd, () => now)
    }

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const isOwnPrompt = e.origin.kind === 'composer' && !e.command && !e.isMeta
    if (!isOwnPrompt) return next(e)

    if ((await read($, inventory)).goal === null) {
      await update($, inventory, inv => ({ ...inv, goal: e.text.slice(0, 2000) }))
      return next(e)
    }

    const ended = await read($, lastTurnEnd)
    const idleMs = ended === null ? 0 : (await $.clock.now()) - ended
    const reason = (await read($, pending)) === 'tokens'
      ? 'This session has passed 250k tokens.'
      : idleMs > CACHE_TTL_MS
        ? `This session was idle ${Math.round(idleMs / 60000)} minutes, so its cache has likely gone cold.`
        : null
    if (reason === null) return next(e)

    let choice = 'Continue here'
    try {
      choice = await $.ui.ask(`${reason} Move to a fresh chat with a handoff?`, {
        options: ['Make a handoff', 'Continue here'],
        header: 'Handoff',
      })
    } catch {
      // Dismissed: carry on in this session.
    }
    await update($, pending, () => null)
    if (choice !== 'Make a handoff') return next(e)

    try {
      const text = await buildHandoff($, e.text)
      return { drop: await deliver($, text) }
    } catch {
      $.ui.toast('Handoff failed; your prompt was sent here instead.')
      return next(e)
    }
  }).catch(($, e, next) => next(e))
}
