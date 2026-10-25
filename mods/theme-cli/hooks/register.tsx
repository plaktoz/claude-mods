import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Agent, Band, Beat, Crew } from '../types'
import { asText, cellsOf, draw, pack, rowsOf } from './draw'
import type { View } from './draw'
import { DEFAULT_THEME, isThemeName, listThemes, loadTheme, readChoice, rootOf, templateFor, writeChoice } from './library'
import { BUILT_IN, resolveScene } from './theme'
import type { Cue, Sounds } from './theme'
import { playWav, readPlatform, stopWindowsLoops, winAudio } from './winaudio'
import { tone } from './wav'

const FRAME_MS = 100
const FINALE_MS = 4200
const MIN_COLS = 32
const MAX_COLS = 240
const STRIP_KEY = 'strip'

const agents = atom({ plugin: 'theme-cli', key: 'agents' } as const, {} as Record<string, Agent>, {
  shape: 'agents-1',
})
const crew = atom({ plugin: 'theme-cli', key: 'crew' } as const, [] as Crew[], { shape: 'crew-2' })
const beat = atom({ plugin: 'theme-cli', key: 'beat' } as const, 'idle' as Beat)
const isWorking = atom({ plugin: 'theme-cli', key: 'isWorking' } as const, false)
const turnStart = atom({ plugin: 'theme-cli', key: 'turnStart' } as const, 0)
const turnEnd = atom({ plugin: 'theme-cli', key: 'turnEnd' } as const, 0)
const finaleStart = atom({ plugin: 'theme-cli', key: 'finaleStart' } as const, 0)
const cost = atom({ plugin: 'theme-cli', key: 'cost' } as const, 0)
const isHidden = atom({ plugin: 'theme-cli', key: 'isHidden' } as const, false)
const isMuted = atom({ plugin: 'theme-cli', key: 'isMuted' } as const, false)
const band = atom({ plugin: 'theme-cli', key: 'band' } as const, null as Band | null)
const themeName = atom({ plugin: 'theme-cli', key: 'themeName' } as const, DEFAULT_THEME)
const log = atom({ plugin: 'theme-cli', key: 'log' } as const, [] as string[], { shape: 'log-1' })

// Module variables start over on a reload; session.start and the next render refill them.
// The theme on show, loaded once; a frame only draws from it.
let scene = resolveScene(BUILT_IN, {}, DEFAULT_THEME)
// The theme's sounds, read with the theme; a cue plays from these, never from disk.
let sounds: Sounds = {}
// Stops the looped `working` clip. Null when it is not playing.
let loop: AbortController | null = null
let timer: Timer | null = null
let isTicking = false
const stats = { ticks: 0, blits: 0, denied: 0, lastDeny: '', ms: 0, maxMs: 0 }

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n))
}

function isActive(view: View) {
  const isFinale = view.beat === 'complete' && view.now < view.finaleStart + FINALE_MS

  return view.beat === 'working' || isFinale || view.crew.length > 0
}

async function readView($: EngineInterface): Promise<View> {
  return {
    beat: await read($, beat),
    crew: await read($, crew),
    turnStart: await read($, turnStart),
    finaleStart: await read($, finaleStart),
    now: await $.clock.now(),
  }
}

// A line for /theme-dump: what the hooks saw, with the engine's clock.
async function note($: EngineInterface, line: string) {
  const t = await $.clock.now()
  await update($, log, list => [...list, `${t}\t${line}`].slice(-300))
}

// Loads the theme the library names, and tells the band to redraw if it changed.
async function useTheme($: EngineInterface, name: string, force = false) {
  const loaded = await loadTheme($, name, force)
  scene = loaded.scene
  sounds = loaded.sounds
  await update($, themeName, () => scene.name)
  await note($, `theme ${name}: ${loaded.status}`)

  // A switch mid-turn swaps the loop for the new theme's.
  stopLoop()
  if ((await read($, beat)) === 'working') await startLoop($)

  return loaded.status
}

// Plays a cue once. A clip that cannot play (no player, a bad file) is logged, never thrown.
async function play($: EngineInterface, cue: Cue): Promise<void> {
  const sound = sounds[cue]
  if (!sound || (await read($, isMuted))) return

  return $.audio
    .play({ base64: sound.base64, mime: sound.mime }, { gain: sound.gain })
    .catch(error => note($, `sound ${cue}: ${String(error)}`))
}

// Loops the `working` clip until the turn leaves `working`.
async function startLoop($: EngineInterface) {
  const sound = sounds.working
  if (!sound || (await read($, isMuted)) || loop) return

  const stop = new AbortController()
  loop = stop
  void $.audio
    .play({ base64: sound.base64, mime: sound.mime }, { shouldLoop: true, gain: sound.gain, signal: stop.signal })
    .catch(error => note($, `sound working: ${String(error)}`))
}

function stopLoop() {
  loop?.abort()
  loop = null
  // The engine does not hand the hook this signal, so the Windows player is stopped by name.
  stopWindowsLoops()
}

// The turn's closing cue: ends the loop, then plays the finish.
function finish($: EngineInterface, cue: 'success' | 'error') {
  stopLoop()

  return play($, cue)
}

// Repaints the strip in place. A draw would restart the Raster; a blit only swaps its cells.
async function tick($: EngineInterface) {
  if (isTicking) return

  isTicking = true
  try {
    let view = await readView($)
    if (view.beat === 'complete' && view.now >= view.finaleStart + FINALE_MS) {
      await update($, beat, () => 'idle')
      view = { ...view, beat: 'idle' }
    }

    if (!isActive(view)) {
      stopTimer()

      return
    }

    const where = await read($, band)
    if (!where) return

    const { columns, rows } = where
    const cells = pack(cellsOf(draw(scene, view, columns), columns))
    const result = await $.ui.blit({ requestId: where.id, key: STRIP_KEY, cells, columns, rows })
    const spent = (await $.clock.now()) - view.now
    stats.ticks += 1
    stats.ms += spent
    stats.maxMs = Math.max(stats.maxMs, spent)
    if (result.deny) {
      stats.denied += 1
      stats.lastDeny = result.deny
    } else {
      stats.blits += 1
    }
  } finally {
    isTicking = false
  }
}

function startTimer($: EngineInterface) {
  if (timer) return

  timer = $.clock.every(FRAME_MS, () => void tick($))
}

function stopTimer() {
  timer?.cancel()
  timer = null
}

// Writes an agent's slot and gives it one companion, once.
async function addAgent($: EngineInterface, id: string, next: Agent) {
  await update($, agents, map => ({ ...map, [id]: next }))
  await update($, crew, list => (list.some(c => c.id === id) ? list : [...list, { id, at: next.startedAt, slot: freeSlot(list) }]))
}

// The lowest colour slot no running companion holds, so a stop frees its colour for the next join.
function freeSlot(list: Crew[]) {
  let slot = 0
  while (list.some(c => c.slot === slot)) slot += 1

  return slot
}

// Drops the ids the engine no longer lists, so the map follows `$.agent.list()`.
async function reconcile($: EngineInterface) {
  // Under `claude -p` no session is bound, so the list is not there to read: leave the map as it is.
  const listed = await $.agent.list().catch(() => undefined)
  if (!listed) return note($, 'agent list unavailable; crew left as it was')

  const live = new Set(listed.map(a => a.id))
  await update($, crew, list => list.filter(c => live.has(c.id)))
  await update($, agents, map => {
    const kept: Record<string, Agent> = {}
    for (const [id, agent] of Object.entries(map)) {
      if (live.has(id) || agent.status === 'running') kept[id] = agent
    }

    return kept
  })
}

export const register: Register = on => {
  winAudio(on)

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'theme-dump', description: 'Write the theme-cli log to a file' })
    await $.command.register({ name: 'theme-hide', description: 'Hide the strip above the prompt' })
    await $.command.register({ name: 'theme-show', description: 'Show the strip above the prompt' })
    await $.command.register({ name: 'theme-mute', description: 'Silence the theme sounds' })
    await $.command.register({ name: 'theme-unmute', description: 'Play the theme sounds again' })
    await $.command.register({ name: 'theme-list', description: 'List the themes in ~/.claude/theme-cli/themes' })
    await $.command.register({
      name: 'theme-use',
      description: 'Switch the strip to a theme',
      argumentHint: '<name>',
    })
    await $.command.register({ name: 'theme-build', description: 'Rebuild the current theme from its images' })
    await $.command.register({ name: 'theme-new', description: 'Make a theme folder to fill in', argumentHint: '<name>' })
    await $.command.register({ name: 'theme-sound-test', description: 'Play a short test tone through the Windows player' })
    await readPlatform($)
    await useTheme($, await readChoice($))
    await reconcile($)
    await note($, `session.start surface=${e.surface}`)

    // A reload drops the timer; pick the strip up again if it is still on.
    if (isActive(await readView($))) startTimer($)

    return next(e)
  })

  on('command.run', { command: 'theme-hide' }, async $ => {
    await update($, isHidden, () => true)

    return { text: 'Strip hidden. /theme-show shows it again.' }
  })

  on('command.run', { command: 'theme-show' }, async $ => {
    await update($, isHidden, () => false)

    return { text: 'Strip shown.' }
  })

  on('command.run', { command: 'theme-mute' }, async $ => {
    await update($, isMuted, () => true)
    stopLoop()

    return { text: 'Sounds muted. /theme-unmute plays them again.' }
  })

  on('command.run', { command: 'theme-unmute' }, async $ => {
    await update($, isMuted, () => false)
    // A turn already under way gets its loop back.
    if ((await read($, beat)) === 'working') await startLoop($)

    return { text: 'Sounds on.' }
  })

  on('command.run', { command: 'theme-list' }, async $ => {
    const names = await listThemes($)
    const now = scene.name
    const root = await rootOf($)

    return {
      text: [
        ...names.map(n => `${n === now ? '*' : ' '} ${n}`),
        '',
        `Themes live in ${root || '~/.claude/theme-cli'}/themes/<name>/theme.json. /theme-use <name> switches; /theme-new <name> starts one.`,
      ].join('\n'),
    }
  })

  on('command.run', { command: 'theme-use' }, async ($, e) => {
    const name = e.args.trim()
    const names = await listThemes($)
    if (!names.includes(name)) return { text: `No theme "${name || ''}". Themes: ${names.join(', ')}.` }

    const status = await useTheme($, name)
    await writeChoice($, name)

    return { text: `Theme: ${name} (${status}). It stays your choice in new sessions.` }
  })

  on('command.run', { command: 'theme-build' }, async $ => {
    const name = await readChoice($)
    if (name === DEFAULT_THEME) return { text: 'The built-in theme has no images to build. /theme-new <name> starts one.' }

    return { text: `Theme ${name}: ${await useTheme($, name, true)}` }
  })

  on('command.run', { command: 'theme-new' }, async ($, e) => {
    const name = e.args.trim()
    const root = await rootOf($)
    if (!isThemeName(name) || name === DEFAULT_THEME) return { text: 'Give a name of letters, digits, - or _, such as /theme-new castle.' }
    if (!root) return { text: 'HOME (or USERPROFILE) is not set, so there is no library folder.' }

    const file = `${root}/themes/${name}/theme.json`
    if (await $.fs.exists(file)) return { text: `Theme "${name}" already exists: ${file}` }

    await $.fs.write(file, templateFor(name))

    return { text: `Wrote ${file}. Put your images beside it, edit it, then /theme-use ${name}.` }
  })

  on('command.run', { command: 'theme-sound-test' }, async ($, _e, next) => {
    if (!(await readPlatform($))) return { text: 'Not Windows: the engine plays sound itself here.' }

    try {
      await playWav($, tone(880, 300), false, next.signal)

      return { text: 'Played a 0.3 s test tone. Heard nothing? Check the volume mixer for this terminal.' }
    } catch (error) {
      return { text: `Could not play the tone: ${String(error)}` }
    }
  })

  on('command.run', { command: 'theme-dump' }, async $ => {
    const view = await readView($)
    const lines = await read($, log)
    const seen = Object.entries(await read($, agents)).map(
      ([id, a]) => `${id}\t${a.type}\t${a.status}\tsteps=${a.steps}\ttokens=${a.tokens}\t${a.model}`,
    )
    const where = await read($, band)
    const width = where?.columns ?? MIN_COLS
    const frame = asText(cellsOf(draw(scene, view, width), width), width)
    const avg = stats.ticks ? (stats.ms / stats.ticks).toFixed(1) : 'n/a'
    const usd = await read($, cost)
    const out = [
      ...lines,
      '--- state ---',
      `theme=${scene.name} ${scene.height}px sprites, ${rowsOf(scene)} rows, companions=${scene.companions.length}, missing=[${scene.missing.join(' ')}]`,
      `sounds=${Object.keys(sounds).join(' ') || 'none'} muted=${await read($, isMuted)} loop=${loop ? 'on' : 'off'}`,
      `session cost=$${usd.toFixed(4)} (engine's session.measure, all turns and agents)`,
      `beat=${view.beat} crew=${view.crew.length} [${view.crew.map(c => `${c.id}:${c.slot}`).join(' ')}] isActive=${isActive(view)} timer=${timer ? 'on' : 'off'}`,
      `band requestId=${where?.id ?? 'unknown'} mounted=${where ? `${where.columns}x${where.rows}` : 'none'}`,
      `ticks=${stats.ticks} blits=${stats.blits} denied=${stats.denied} lastDeny=${stats.lastDeny || '-'}`,
      `ms per tick: avg=${avg} max=${stats.maxMs}`,
      '--- agents ---',
      ...seen,
      '--- strip now ---',
      ...frame,
      '',
    ]
    await $.fs.write('theme-cli-log.txt', out.join('\n'))

    return { text: `Wrote ${lines.length} log lines and the strip to theme-cli-log.txt.` }
  })

  // The main loop's turn has no agentId; subagents send turn.start too.
  on('turn.start', async ($, e, next) => {
    if (e.agentId) return next(e)

    const started = await $.clock.now()
    await note($, 'turn.start')
    await update($, isWorking, () => true)
    await update($, turnStart, () => started)
    await update($, beat, () => 'working')
    startTimer($)

    // The loop waits for the start clip, so the two do not play over each other.
    stopLoop()
    void play($, 'start').then(async () => {
      if ((await read($, beat)) === 'working') await startLoop($)
    })

    return next(e)
  })

  // Subagent turns also send turn.complete.
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
    } else if (e.reason === 'answer') {
      await update($, finaleStart, () => ended)
      await update($, beat, () => 'complete')
      void finish($, 'success')
    } else {
      await update($, beat, () => (e.reason === 'aborted' ? 'aborted' : 'error'))
      if (e.reason === 'aborted') stopLoop()
      else void finish($, 'error')
    }

    return next(e)
  })

  on('classic.SubagentStart', async ($, e, next) => {
    const id = e.agent_id
    const startedAt = await $.clock.now()
    await addAgent($, id, {
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
    startTimer($)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.SubagentStop', async ($, e, next) => {
    const id = e.agent_id
    const endedAt = await $.clock.now()
    const known = (await read($, agents))[id]
    // A stop with no matching start is ignored: the strip never showed that agent.
    if (!known) return next(e)

    await update($, agents, map => ({ ...map, [id]: { ...known, status: 'done' as const, endedAt } }))
    await update($, crew, list => list.filter(c => c.id !== id))
    await note($, `SubagentStop ${id}`)

    // The last running agent finishing completes a turn the main loop already ended.
    const stillRunning = Object.values(await read($, agents)).some(a => a.status === 'running')
    if (!stillRunning && !(await read($, isWorking)) && (await read($, beat)) === 'working') {
      await update($, finaleStart, () => endedAt)
      await update($, beat, () => 'complete')
      void finish($, 'success')
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    if (!e.agentId) return next(e)

    const id = e.agentId
    await update($, agents, map => {
      const agent = map[id]
      if (!agent) return map

      return { ...map, [id]: { ...agent, activity: [...agent.activity, e.tool].slice(-2) } }
    })

    return next(e)
  }).catch(($, e, next) => next(e))

  // Per request: the stop chunk carries the request's whole usage, not a delta.
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
    stopTimer()
    stopLoop()
    await reconcile($)

    return next(e)
  })

  // The strip above the prompt: one wide Raster the timer repaints with blit.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey || (await read($, isHidden))) return next(e)

    // Read, so that a switch of theme draws the band again.
    await read($, themeName)
    const view = await readView($)
    if (!isActive(view)) return next(e)

    const columns = clamp(e.props.bodyColumns, MIN_COLS, MAX_COLS)
    const rows = rowsOf(scene)
    // A render must not write state. The timer blits where `band` says, so a changed
    // site or size is recorded once the draw is over.
    const where = await read($, band)
    if (where?.id !== e.requestId || where.columns !== columns || where.rows !== rows) {
      const placed: Band = { id: e.requestId, columns, rows }
      $.clock.after(0, () => void update($, band, () => placed))
    }

    const { Raster } = $.ui.resolve(e)

    return <Raster key={STRIP_KEY} columns={columns} rows={rows} cells={pack(cellsOf(draw(scene, view, columns), columns))} />
  })
}
