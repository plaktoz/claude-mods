import { atom, read, update } from 'claude-code'
import type { EngineInterfaceBuilt, Register, Timer } from 'claude-code'

import type { Cache } from '../types'

// Ping this long before the cache lapses, so the request lands in time.
const LEAD_MS = 45_000
const TICK_MS = 1000
const BAR_CELLS = 16
const PING_PROMPT = 'Cache keep-alive ping. Reply with the single word "ok" and nothing else.'

const EMPTY: Cache = { expiresAt: 0, tokens: 0, pings: 0, isPinging: false }

// Change the tag when Cache's fields change: it declines older values.
const cache = atom({ plugin: 'cache-warm', key: 'cache' } as const, EMPTY, { shape: 'cache-1' })
const isOn = atom({ plugin: 'cache-warm', key: 'isOn' } as const, true)
const now = atom({ plugin: 'cache-warm', key: 'now' } as const, 0)

type Engine = EngineInterfaceBuilt

const clockText = (ms: number) => {
  const seconds = Math.max(0, Math.round(ms / 1000))

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

// Set by register from the options. The timers and the turn flag are the
// module's own: a reload drops them and session.start arms again from the
// stored cache.
let ttlMs = 300_000
let maxPings = 6
let pingTimer: Timer | null = null
let tickTimer: Timer | null = null
let isTurnRunning = false

const disarm = () => {
  pingTimer?.cancel()
  tickTimer?.cancel()
  pingTimer = null
  tickTimer = null
}

const tick = async ($: Engine) => {
  const t = await $.clock.now()
  const c = await read($, cache)
  if (t >= c.expiresAt && !c.isPinging) {
    disarm()
    await update($, cache, () => EMPTY)
    return
  }
  await update($, now, () => t)
}

async function ping($: Engine) {
  pingTimer = null
  await update($, cache, c => ({ ...c, isPinging: true }))

  let reply: Awaited<ReturnType<Engine['model']['fork']>> | null = null
  try {
    reply = await $.model.fork({ prompt: PING_PROMPT })
  } catch {
    // Treated as a failed ping below.
  }
  // A turn that began meanwhile has refreshed the cache itself.
  if (isTurnRunning) return

  if (reply === null || !reply.isAnswered) {
    disarm()
    await update($, cache, () => EMPTY)
    $.ui.toast('Cache keep-warm stopped: the ping got no reply.')
    return
  }

  const { usage } = reply
  const tokens = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
  const t = await $.clock.now()
  if (usage.cache_read_input_tokens < tokens / 2) {
    $.ui.toast('The cache had already gone cold, so that ping rewrote the context at full price.')
  }
  await update($, now, () => t)
  await update($, cache, c => ({ expiresAt: t + ttlMs, tokens, pings: c.pings + 1, isPinging: false }))
  await arm($)
}

async function arm($: Engine) {
  disarm()
  const c = await read($, cache)
  const t = await $.clock.now()
  if (c.expiresAt <= t) {
    if (c.expiresAt !== 0) await update($, cache, () => EMPTY)
    return
  }

  await update($, now, () => t)
  tickTimer = $.clock.every(TICK_MS, () => void tick($))
  if ((await read($, isOn)) && c.pings < maxPings) {
    pingTimer = $.clock.after(Math.max(0, c.expiresAt - LEAD_MS - t), () => void ping($))
  }
}

export const register: Register = (on, options) => {
  ttlMs = options.ttl === '1h' ? 3_600_000 : 300_000
  maxPings = Math.max(0, Number(options.maxPings ?? 6))
  const ttlLabel = options.ttl === '1h' ? '1 hour' : '5 minute'

  on('session.start', async ($, e, next) => {
    await arm($)

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    disarm()
    await update($, cache, () => EMPTY)

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      isTurnRunning = true
      disarm()
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      isTurnRunning = false
      if (e.usage) {
        const { usage } = e
        const tokens = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
        const t = await $.clock.now()
        await update($, now, () => t)
        await update($, cache, () => ({ expiresAt: t + ttlMs, tokens, pings: 0, isPinging: false }))
      }
      await arm($)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const c = await read($, cache)
    const t = await read($, now)
    if (e.props.hasSurvey || e.props.isWorking || c.expiresAt <= t) return next(e)

    const isKeeping = await read($, isOn)
    const { Box, Button, Text } = $.ui.resolve(e)
    const remaining = c.expiresAt - t
    const filled = Math.min(BAR_CELLS, Math.max(0, Math.round((remaining / ttlMs) * BAR_CELLS)))
    const isPinging = isKeeping && c.pings < maxPings
    const pingIn = clockText(c.expiresAt - LEAD_MS - t)
    const status = c.isPinging
      ? 'Pinging to keep the cache warm…'
      : isPinging
        ? `Keeping warm · ${c.pings === 0 ? 'first' : 'next'} ping in ${pingIn}`
        : 'Not keeping warm · the cache goes cold when the timer ends'

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="row" gap={1}>
            <Text color="warning">◔ Cache warm</Text>
            <Text color="warning" bold>
              {clockText(remaining)}
            </Text>
            <Text color="warning">{'█'.repeat(filled)}</Text>
            <Text dimColor>{'░'.repeat(BAR_CELLS - filled)}</Text>
          </Box>
          <Button
            key="toggle"
            label={isKeeping ? 'Stop keeping warm' : 'Keep warm'}
            onPress={async () => {
              await update($, isOn, v => !v)
              if (!isKeeping) await update($, cache, c => ({ ...c, pings: 0 }))
              await arm($)
            }}
          />
        </Box>
        <Text dimColor>
          {ttlLabel} cache, as the last reply set it. Reply now and {Math.round(c.tokens / 1000)}k tokens cost 5 to
          10% as much.
        </Text>
        <Text color="suggestion">{status}</Text>
      </Box>
    )
  })
}
