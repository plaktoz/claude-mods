import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Agent, Beat } from '../types'

// Each agent keeps one slot for as long as it is in the map, so its colour and place hold.
const COLOURS = ['#2e9d4f', '#d9402f', '#2f6bd9', '#e0a800', '#d93f8a', '#e0701f']
const FRAMES = 4

const agents = atom({ plugin: 'theme-desk', key: 'agents' } as const, {} as Record<string, Agent>, {
  shape: 'agents-1',
})
const order = atom({ plugin: 'theme-desk', key: 'order' } as const, [] as string[])
const beat = atom({ plugin: 'theme-desk', key: 'beat' } as const, 'idle' as Beat)
const isWorking = atom({ plugin: 'theme-desk', key: 'isWorking' } as const, false)
const turnStart = atom({ plugin: 'theme-desk', key: 'turnStart' } as const, 0)
const turnEnd = atom({ plugin: 'theme-desk', key: 'turnEnd' } as const, 0)
const cost = atom({ plugin: 'theme-desk', key: 'cost' } as const, 0)
const frame = atom({ plugin: 'theme-desk', key: 'frame' } as const, 0)
const isHidden = atom({ plugin: 'theme-desk', key: 'isHidden' } as const, false)
const log = atom({ plugin: 'theme-desk', key: 'log' } as const, [] as string[], { shape: 'log-1' })

const DESK = 'theme-desk'

// The strip's sprite for one agent: a coloured block with two leg poses.
function sprite(color: string, step: number) {
  const legs = step % 2 === 0 ? [[1, 6], [4, 6]] : [[2, 6], [5, 6]]
  const legRects = legs
    .map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="2" fill="#222"/>`)
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" shape-rendering="crispEdges">
    <rect x="2" y="0" width="4" height="3" fill="#f2c9a0"/>
    <rect x="2" y="3" width="4" height="3" fill="${color}"/>${legRects}
  </svg>`
}

function elapsed(from: number, to: number) {
  const seconds = Math.max(0, Math.round((to - from) / 1000))
  const m = Math.floor(seconds / 60)
  const s = String(seconds % 60).padStart(2, '0')

  return `${m}:${s}`
}

function tokensText(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

// A line for /desk-dump: what the hooks saw, with the engine's clock.
async function note($: EngineInterface, line: string) {
  const t = await $.clock.now()
  await update($, log, list => [...list, `${t}\t${line}`].slice(-300))
}

// Writes an agent's slot, keeping the order of its first appearance.
async function setAgent($: EngineInterface, id: string, next: Agent) {
  await update($, agents, map => ({ ...map, [id]: next }))
  await update($, order, list => (list.includes(id) ? list : [...list, id]))
}

// Drops the ids the engine no longer lists, so the map follows `$.agent.list()`.
async function reconcile($: EngineInterface) {
  const live = new Set((await $.agent.list()).map(a => a.id))
  await update($, order, list => list.filter(id => live.has(id)))
  await update($, agents, map => {
    const kept: Record<string, Agent> = {}
    for (const [id, agent] of Object.entries(map)) {
      if (live.has(id) || agent.status === 'running') kept[id] = agent
    }

    return kept
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'desk', description: 'Open the Helper Desk pane' })
    await $.command.register({ name: 'desk-hide', description: 'Hide the strip above the prompt' })
    await $.command.register({ name: 'desk-dump', description: 'Write the Helper Desk log to a file' })
    await note($, `session.start surface=${e.surface}`)

    return next(e)
  })

  on('command.run', { command: 'desk-dump' }, async $ => {
    const lines = await read($, log)
    const agentsSeen = Object.entries(await read($, agents)).map(
      ([id, a]) => `${id}\t${a.type}\t${a.status}\tsteps=${a.steps}\ttokens=${a.tokens}\t${a.model}`,
    )
    await $.fs.write('theme-desk-log.txt', [...lines, '--- agents ---', ...agentsSeen, ''].join('\n'))

    return { text: `Wrote ${lines.length} log lines to theme-desk-log.txt.` }
  })

  on('command.run', { command: 'desk' }, async $ => {
    await update($, isHidden, () => false)
    await $.ui.open({ id: DESK, title: 'Helper Desk' })

    return { text: 'Helper Desk opened.' }
  })

  on('command.run', { command: 'desk-hide' }, async $ => {
    await update($, isHidden, () => true)

    return { text: 'Strip hidden. /desk shows it again.' }
  })

  on('prompt.submit', async ($, e, next) => {
    const started = await $.clock.now()
    await note($, 'prompt.submit')
    await update($, isWorking, () => true)
    await update($, turnStart, () => started)
    await update($, beat, () => 'working')

    return next(e)
  }).catch(($, e, next) => next(e))

  // The main loop's turn: no agentId. Subagent turns also send turn.complete.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId) return next(e)

    const running = Object.values(await read($, agents)).some(a => a.status === 'running')
    await note($, `turn.complete reason=${e.reason} running=${running}`)
    await update($, isWorking, () => false)
    const ended = await $.clock.now()
    await update($, turnEnd, () => ended)

    if (running) {
      // The complete beat waits for the last SubagentStop.
      await update($, beat, () => 'working')
    } else {
      await update($, beat, () => (e.reason === 'answer' ? 'complete' : 'aborted'))
    }

    return next(e)
  })

  on('classic.SubagentStart', async ($, e, next) => {
    const id = e.agent_id
    const startedAt = await $.clock.now()
    await setAgent($, id, {
      type: e.agent_type,
      status: 'running',
      startedAt,
      endedAt: null,
      steps: 0,
      tokens: 0,
      model: '',
      activity: [],
    })
    await note($, `SubagentStart ${id} ${e.agent_type}`)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.SubagentStop', async ($, e, next) => {
    const id = e.agent_id
    const endedAt = await $.clock.now()
    await update($, agents, map => {
      const agent = map[id]
      // A stop with no matching start is ignored: the engine never showed that agent.
      if (!agent) return map

      return { ...map, [id]: { ...agent, status: 'done' as const, endedAt } }
    })

    await note($, `SubagentStop ${id}`)
    // The last running agent finishing completes a turn the main loop already ended.
    const stillRunning = Object.values(await read($, agents)).some(a => a.status === 'running')
    if (!stillRunning && !(await read($, isWorking))) {
      await update($, beat, () => 'complete')
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    if (!e.agentId) return next(e)

    const id = e.agentId
    await update($, agents, map => {
      const agent = map[id]
      if (!agent) return map

      const activity = [...agent.activity, e.tool].slice(-2)

      return { ...map, [id]: { ...agent, activity } }
    })

    return next(e)
  }).catch(($, e, next) => next(e))

  // Per request: the stop chunk carries the request's whole usage.
  on('turn.step', async function* ($, e, next) {
    for await (const chunk of next(e)) {
      if (chunk.kind === 'stop' && e.agentId && chunk.usage) {
        const u = chunk.usage
        const tokens = u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
        const id = e.agentId
        await update($, agents, map => {
          const agent = map[id]
          if (!agent) return map

          return { ...map, [id]: { ...agent, steps: agent.steps + 1, tokens, model: u.model } }
        })
      }
      yield chunk
    }
  })

  on('session.measure', async ($, e, next) => {
    if (e.cost) await update($, cost, () => e.cost!.usd)

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await reconcile($)

    return next(e)
  })

  // The strip above the prompt: one sprite per agent, drawn from the atoms.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (await read($, isHidden)) return next(e)

    const slots = await read($, order)
    const map = await read($, agents)
    if (slots.length === 0) return next(e)

    // Svg is desktop-only, so the strip falls through to the engine elsewhere.
    if (e.surface !== 'desktop') return next(e)

    const { Box, Svg, Text } = $.ui.resolve(e)
    const step = await read($, frame)

    return (
      <Box flexDirection="row">
        {slots.map((id, i) => {
          const agent = map[id]
          if (!agent) return null

          return (
            <Svg
              key={id}
              source={sprite(COLOURS[i % COLOURS.length], step)}
              alt={`${agent.type} agent ${agent.status}`}
              width={24}
              height={24}
            />
          )
        })}
        <Text dimColor>{` ${slots.length} subagent(s)`}</Text>
      </Box>
    )
  })

  // The Helper Desk: the header, three tiles, and a card per agent.
  on('ui.render', { component: 'Pane', requestId: DESK }, async ($, e) => {
    if (e.surface !== 'desktop') {
      const { Box, Text } = $.ui.resolve(e)

      return (
        <Box flexDirection="column">
          <Text>Helper Desk needs the desktop app for its sprites.</Text>
        </Box>
      )
    }

    const { Box, Text, Svg } = $.ui.resolve(e)
    const slots = await read($, order)
    const map = await read($, agents)
    const now = await $.clock.now()
    const start = await read($, turnStart)
    const end = await read($, turnEnd)
    const usd = await read($, cost)
    const working = await read($, isWorking)
    const step = await read($, frame)
    const subagentTokens = Object.values(map).reduce((sum, a) => sum + a.tokens, 0)
    const running = slots.filter(id => map[id]?.status === 'running')
    const finished = slots.filter(id => map[id]?.status === 'done')

    return (
      <Box flexDirection="column">
        <Text>{`${running.length} subagents in this chat`}</Text>
        <Box flexDirection="row">
          <Text>{`Total chat cost $${usd.toFixed(2)}`}</Text>
          <Text>{`  Subagent tokens ${tokensText(subagentTokens)}`}</Text>
          <Text>{`  Time ${elapsed(start, working ? now : end)}`}</Text>
        </Box>
        <Text dimColor>{`Running (${running.length})`}</Text>
        {running.map(id => {
          const a = map[id]!
          const colour = COLOURS[slots.indexOf(id) % COLOURS.length]

          return (
            <Box key={id} flexDirection="row">
              <Svg source={sprite(colour, step)} alt={`${a.type} sprite`} width={24} height={24} />
              <Text>{`${a.type} · ${a.model || 'pending'}`}</Text>
              <Text dimColor>{`  ${tokensText(a.tokens)} · ${elapsed(a.startedAt, now)}`}</Text>
              <Text>{`  Step ${a.steps}${a.activity.length ? ` · ${a.activity.join(', ')}` : ''}`}</Text>
            </Box>
          )
        })}
        <Text dimColor>{`Finished (${finished.length})`}</Text>
        {finished.map(id => {
          const a = map[id]!
          const colour = COLOURS[slots.indexOf(id) % COLOURS.length]

          return (
            <Box key={id} flexDirection="row">
              <Svg source={sprite(colour, 0)} alt={`${a.type} sprite`} width={24} height={24} />
              <Text>{`${a.type} · ${a.model || 'pending'}`}</Text>
              <Text dimColor>{`  ${tokensText(a.tokens)} · ${elapsed(a.startedAt, a.endedAt ?? now)}`}</Text>
              <Text>{`  ✓ Done · ${a.steps} steps`}</Text>
            </Box>
          )
        })}
        {slots.length === 0 && <Text dimColor>No subagents yet.</Text>}
      </Box>
    )
  })
}
