import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'theme-cli',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 40, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const COLUMNS = 40
const ROWS = 5
// A cell is three little-endian u32s, 12 bytes; base64 turns each 3 bytes into 4 characters.
const CELLS_LENGTH = (COLUMNS * ROWS * 12 * 4) / 3

const usage = { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'm' }

// Nothing sits beneath the plugin: each hook stands for the engine.
const world = ($: any, on: any) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const seen = { blits: [] as any[], denyBlits: false, written: '' }

  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.end', () => ({ sessionId: 's' }))
  on('command.register', () => ({ value: { command: 'x' } }))
  on('agent.list', () => ({ value: [] }))
  // No sprites file: the strip draws its placeholders.
  on('fs.read', () => ({ value: '{}' }))
  on('fs.write', (_: unknown, e: { text: string }) => {
    seen.written = e.text

    return { value: undefined }
  })
  on('ui.blit', (_: unknown, e: any) => {
    seen.blits.push(e)

    return { value: seen.denyBlits ? { deny: 'not mounted' } : {} }
  })
  on('turn.start', (_: unknown, e: { turnId: string }) => ({ turnId: e.turnId }))
  on('turn.complete', (_: unknown, e: { answer: string }) => ({ text: e.answer }))
  on('classic.SubagentStart', () => ({}))
  on('classic.SubagentStop', () => ({}))
  // Stands for the engine's own band, drawn when the mod yields.
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const start = () => $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const turnStart = () => $.turn.start({ text: 'go', turnId: 't1' })
  const turnEnd = (extra: object = {}) =>
    $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, reason: 'answer', turnId: 't1', usage, ...extra })
  const agentStart = (id: string) => $.classic.SubagentStart({ agent_id: id, agent_type: 'Explore' })
  const agentStop = (id: string) => $.classic.SubagentStop({ agent_id: id, agent_type: 'Explore', stop_hook_active: false })
  const strip = async () => {
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const raster = await ui.find({ type: 'Raster' })
    const engine = await ui.find({ type: 'Text', text: /engine/ })
    await ui.unmount()

    return { raster, engine }
  }

  return { clock, seen, start, turnStart, turnEnd, agentStart, agentStop, strip }
}

test('the strip stays out of the way until a turn starts', async ($, on) => {
  const { start, strip } = world($, on)
  await start()

  const { raster, engine } = await strip()

  expect(raster).toBeUndefined()
  expect(engine).toBeDefined()
})

test('a turn draws one Raster of the band width and repaints it with blit', async ($, on) => {
  const { clock, seen, start, turnStart, strip } = world($, on)
  await start()
  await turnStart()

  const { raster } = await strip()
  expect(raster?.props.columns).toBe(COLUMNS)
  expect(raster?.props.rows).toBe(ROWS)
  expect(String(raster?.props.cells)).toHaveLength(CELLS_LENGTH)

  await clock.advance(1_000)

  // About ten frames a second, each a blit to the band's own site and size.
  expect(seen.blits.length).toBeGreaterThanOrEqual(8)
  expect(seen.blits[0]).toMatchObject({ requestId: 'band', key: 'strip', columns: COLUMNS, rows: ROWS })
  expect(seen.blits[0].cells).toHaveLength(CELLS_LENGTH)
  expect(seen.blits[0].cells).not.toBe(seen.blits[seen.blits.length - 1].cells)
})

test('the sprites move: a later frame differs from an earlier one', async ($, on) => {
  const { clock, seen, start, turnStart, strip } = world($, on)
  await start()
  await turnStart()
  await strip()

  await clock.advance(500)
  const early = seen.blits[seen.blits.length - 1].cells
  await clock.advance(500)

  expect(seen.blits[seen.blits.length - 1].cells).not.toBe(early)
})

test('each running subagent adds one companion and its stop removes it', async ($, on) => {
  const { clock, start, turnStart, agentStart, agentStop, strip } = world($, on)
  await start()
  await turnStart()
  await clock.advance(1_000)
  const alone = (await strip()).raster?.props.cells

  await agentStart('a1')
  await agentStart('a1')
  await clock.advance(1_000)
  const withOne = (await strip()).raster?.props.cells
  expect(withOne).not.toBe(alone)

  await agentStart('a2')
  await clock.advance(1_000)
  const withTwo = (await strip()).raster?.props.cells
  expect(withTwo).not.toBe(withOne)

  // A stop for an id that never started is ignored.
  await agentStop('never-started')
  await agentStop('a1')
  await agentStop('a2')
  await clock.advance(1_000)

  expect((await strip()).raster?.props.cells).toBeDefined()
})

test('each companion holds its own colour slot, and a stop frees the lowest one', async ($, on) => {
  const { seen, start, turnStart, agentStart, agentStop, strip } = world($, on)
  await start()
  await turnStart()
  await strip()
  const slots = async () => {
    await $.command.run({ command: 'theme-dump', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

    return /crew=\d+ \[([^\]]*)\]/.exec(seen.written)?.[1]
  }

  await agentStart('a1')
  await agentStart('a2')
  await agentStart('a3')
  expect(await slots()).toBe('a1:0 a2:1 a3:2')

  await agentStop('a2')
  await agentStart('a4')
  expect(await slots()).toBe('a1:0 a3:2 a4:1')
})

test('a subagent turn does not end the main turn', async ($, on) => {
  const { clock, seen, start, turnStart, turnEnd, strip } = world($, on)
  await start()
  await turnStart()
  // A blit needs a mounted Raster, which the band's first render gives.
  await strip()
  await turnEnd({ agentId: 'a1' })
  const before = seen.blits.length
  await clock.advance(1_000)

  expect(seen.blits.length).toBeGreaterThan(before)
  expect((await strip()).raster).toBeDefined()
})

test('the finale plays once the turn is answered, then the strip clears and the timer stops', async ($, on) => {
  const { clock, seen, start, turnStart, turnEnd, strip } = world($, on)
  await start()
  await turnStart()
  await clock.advance(1_000)
  await turnEnd()

  await clock.advance(2_000)
  expect((await strip()).raster).toBeDefined()

  await clock.advance(3_000)
  expect((await strip()).raster).toBeUndefined()

  const settled = seen.blits.length
  await clock.advance(2_000)
  expect(seen.blits.length).toBe(settled)
})

test('the finale waits for the last subagent when the main turn ends first', async ($, on) => {
  const { clock, start, turnStart, turnEnd, agentStart, agentStop, strip } = world($, on)
  await start()
  await turnStart()
  await agentStart('a1')
  await turnEnd()

  // Past the finale's length: still working, because a1 is running.
  await clock.advance(6_000)
  expect((await strip()).raster).toBeDefined()

  await agentStop('a1')
  await clock.advance(6_000)
  expect((await strip()).raster).toBeUndefined()
})

test('an aborted turn clears the strip with no finale', async ($, on) => {
  const { clock, start, turnStart, turnEnd, strip } = world($, on)
  await start()
  await turnStart()
  await clock.advance(500)
  await turnEnd({ reason: 'aborted', isAborted: true })
  await clock.advance(200)

  expect((await strip()).raster).toBeUndefined()
})

test('denied blits are counted, not thrown', async ($, on) => {
  const { clock, seen, start, turnStart, strip } = world($, on)
  seen.denyBlits = true
  await start()
  await turnStart()
  await strip()
  await clock.advance(500)
  await $.command.run({ command: 'theme-dump', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

  expect(seen.blits.length).toBeGreaterThan(0)
  expect(seen.written).toContain('blits=0 denied=')
  expect(seen.written).toContain('lastDeny=not mounted')
})

test('/theme-dump writes the log, the blit counts and the strip as text', async ($, on) => {
  const { clock, seen, start, turnStart, agentStart, strip } = world($, on)
  await start()
  await turnStart()
  await agentStart('a1')
  await strip()
  await clock.advance(500)

  const out = await $.command.run({ command: 'theme-dump', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

  expect(out.text).toContain('theme-cli-log.txt')
  expect(seen.written).toContain('turn.start')
  expect(seen.written).toContain('SubagentStart a1')
  expect(seen.written).toContain('band requestId=band')
  expect(seen.written).toContain(`mounted=${COLUMNS}x${ROWS}`)
  expect(seen.written).toContain('--- strip now ---')
  expect(seen.written).toContain('▀')
})

test('the strip is a terminal Raster only: desktop is left to the engine', async ($, on) => {
  const { start, turnStart } = world($, on)
  await start()
  await turnStart()

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /engine/ })).toBeDefined()
  await ui.unmount()
})
