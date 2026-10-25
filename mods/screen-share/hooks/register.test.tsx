import { expect, test } from 'claude-code/testing'

const USAGE = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

// The person typing /screen-share on, at the prompt.
const ON = {
  command: 'screen-share',
  args: 'on',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 100 },
} as const

const BAND = {
  plugin: 'screen-share',
  component: 'AbovePrompt',
  requestId: 'band',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
  },
} as const

// Stands for the engine beneath the mod: a store, a history, a small model
// that finds "Jane Doe", and a transcript that draws a row's text as given.
// `fail.on` makes the store refuse every write. `drawn` keeps the props the
// engine receives for each component, after every hook above it has run.
// `options.stored` is the store a later session shares; `options.id` is this session's id.
const world = (on: any, fail = { on: false }, options: { id?: string; stored?: Map<string, unknown> } = {}) => {
  const stored = options.stored ?? new Map<string, unknown>()
  const drawn = new Map<string, any>()
  on('command.register', () => ({ value: { command: 'screen-share' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__screen-share__set_mode' } }))
  on('session.id', () => ({ value: options.id ?? 'session-a' }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('store.get', (_: unknown, e: { key: string }) => ({ value: stored.get(e.key) }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => {
    // A refused write rejects $.store.set, as the engine does for a value it will not keep.
    if (fail.on) return { deny: 'the store refused the write' }
    stored.set(e.key, e.value)

    return { value: undefined }
  })
  on('session.messages', () => ({ value: [{ role: 'user', text: 'Call Jane Doe back.', toolUses: [] }] }))
  on('model.complete', () => ({ value: { isAnswered: true, text: '["Jane Doe"]', usage: USAGE } }))
  on('ui.render', ($: any, e: any) => {
    drawn.set(e.component, e.props)
    // An ask dialog holds the engine's own node once; it draws its props from there.
    if (e.component === 'AskUserQuestion') return { type: 'engine', ref: 0 }
    const { Text } = $.ui.resolve(e)
    const p = e.props
    const shown =
      typeof p.text === 'string'
        ? p.text
        : e.component === 'ToolUse'
          ? JSON.stringify({ input: p.input, output: p.output })
          : 'engine'

    return <Text>{shown}</Text>
  })

  return { stored, drawn }
}

test('a prompt row is drawn masked once the mode is on', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ran = await $.command.run(ON)
  expect(ran.text).toContain('Screen-share is on')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'screen-share',
      surface,
      component: 'UserMessage',
      requestId: 'm1',
      props: {
        text: 'Jane Doe (jane@acme.com) asked for a call back on +1 415 555 0134 about $12,000. Jane agreed.',
        origin: { kind: 'composer' },
        isExpanded: false,
      },
    })
    const row = await ui.find({ type: 'Text' })
    expect(row?.text).toBe(
      '░░░░ ░░░ (░░░░░░░░░░░░░) asked for a call back on ░░ ░░░ ░░░ ░░░░ about ░░░░░░░. ░░░░ agreed.',
    )
    await ui.unmount()
  }
})

test('the mode leaves dates, versions and plain words alone', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(ON)

  const ui = await $.ui.mount({
    plugin: 'screen-share',
    surface: 'desktop',
    component: 'AssistantMessage',
    requestId: 'a1',
    props: { text: 'Released 2.1.310 on 2026-10-24 for Northvale.', isFirstOfReply: true },
  })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('Released 2.1.310 on 2026-10-24 for Northvale.')
  await ui.unmount()
})

test('the band shows while on and Turn off ends the mode', async ($, on) => {
  const { stored } = world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(ON)

  for (const surface of ['terminal', 'desktop'] as const) {
    await $.command.run(ON)
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /hidden on screen/ })).toBeDefined()
    await ui.press({ key: 'off' })
    expect(stored.get('isOn')).toBe(false)
    expect(await ui.find({ type: 'Text', text: /hidden on screen/ })).toBeUndefined()
    await ui.unmount()
  }
})

// A call whose input and output hold a learned name and an email.
const NAMED_CALL = {
  tool: 'Bash',
  input: { command: 'mail jane@acme.com "Jane Doe is confirmed"' },
  isRunning: false,
  isErrored: false,
  isInterrupted: false,
  output: { stdout: 'sent to Jane Doe', stderr: '', interrupted: false },
}

test('a tool group with a name or an email unfolds, and its rows draw masked', async ($, on) => {
  const { drawn } = world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(ON)

  for (const surface of ['terminal', 'desktop'] as const) {
    const group = await $.ui.mount({
      plugin: 'screen-share',
      surface,
      component: 'ToolGroup',
      requestId: 'g1',
      props: { calls: [NAMED_CALL], isActive: false, isExpanded: false, isCallsOnly: true },
    })
    // The group holds a name, so the mod unfolds it: its rows then draw through ToolUse.
    expect(drawn.get('ToolGroup').isExpanded).toBe(true)
    await group.unmount()

    const row = await $.ui.mount({
      plugin: 'screen-share',
      surface,
      component: 'ToolUse',
      requestId: 't1',
      props: { ...NAMED_CALL, tool_use_id: 't1' },
    })
    expect((await row.find({ type: 'Text' }))?.text).toBe(
      '{"input":{"command":"mail ░░░░░░░░░░░░░ \\"░░░░ ░░░ is confirmed\\""},"output":{"stdout":"sent to ░░░░ ░░░","stderr":"","interrupted":false}}',
    )
    await row.unmount()
  }
})

test('a tool group with no name or email stays folded', async ($, on) => {
  const { drawn } = world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(ON)

  const calls = [{ ...NAMED_CALL, input: { command: 'ls -la' }, output: { stdout: 'a.txt' } }]
  const group = await $.ui.mount({
    plugin: 'screen-share',
    surface: 'desktop',
    component: 'ToolGroup',
    requestId: 'g2',
    props: { calls, isActive: false, isExpanded: false, isCallsOnly: true },
  })
  expect(drawn.get('ToolGroup').isExpanded).toBe(false)
  expect(drawn.get('ToolGroup').calls).toEqual(calls)
  await group.unmount()
})

test('an ask dialog masks its header, descriptions and previews, and keeps the question and labels', async ($, on) => {
  const { drawn } = world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(ON)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ask = await $.ui.mount({
      plugin: 'screen-share',
      surface,
      component: 'AskUserQuestion',
      requestId: 'q1',
      props: {
        tool: 'AskUserQuestion',
        questions: [
          {
            question: 'Which refund should we use?',
            header: 'Jane Doe',
            multiSelect: false,
            options: [
              { label: 'Yes', description: 'Email jane@acme.com', preview: 'Refund Jane Doe $12,000' },
              { label: 'No', description: 'Keep the $12,000' },
            ],
          },
        ],
      },
    })
    const [q] = drawn.get('AskUserQuestion').questions
    expect(q.question).toBe('Which refund should we use?')
    expect(q.header).toBe('░░░░ ░░░')
    expect(q.options[0].label).toBe('Yes')
    expect(q.options[0].description).toBe('Email ░░░░░░░░░░░░░')
    expect(q.options[0].preview).toBe('Refund ░░░░ ░░░ ░░░░░░░')
    expect(q.options[1].label).toBe('No')
    expect(q.options[1].description).toBe('Keep the ░░░░░░░')
    await ask.unmount()
  }
})

test('an info notice draws its text masked', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(ON)

  const notice = await $.ui.mount({
    plugin: 'screen-share',
    surface: 'terminal',
    component: 'InfoNotice',
    requestId: 'n1',
    props: { text: 'Signed in as Jane Doe (jane@acme.com) on the Pro plan.', command: '/login' },
  })
  expect((await notice.find({ type: 'Text' }))?.text).toBe(
    'Signed in as ░░░░ ░░░ (░░░░░░░░░░░░░) on the Pro plan.',
  )
  await notice.unmount()
})

test('a failed Turn off is caught: the press still resolves', async ($, on) => {
  const fail = { on: false }
  const { stored } = world(on, fail)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(ON)
  fail.on = true

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  // A rejected onPress would reject this press, which the test awaits.
  await ui.press({ key: 'off' })
  // The mode is off for this session, the store kept the old value, and the band is gone.
  expect(stored.get('isOn')).toBe(true)
  expect(await ui.find({ type: 'Text', text: /hidden on screen/ })).toBeUndefined()
  await ui.unmount()
})

const HIDE = 'mcp__screen-share__hide_names'

// A UserMessage row that names Ada Lovelace, drawn after the session starts.
const adaRow = async ($: any, requestId: string) => {
  const ui = await $.ui.mount({
    plugin: 'screen-share',
    surface: 'terminal',
    component: 'UserMessage',
    requestId,
    props: { text: 'Ada Lovelace wrote it.', origin: { kind: 'composer' }, isExpanded: false },
  })
  const text = (await ui.find({ type: 'Text' }))?.text
  await ui.unmount()

  return text
}

test('names that hide_names adds are saved under the session id', async ($, on) => {
  const { stored } = world(on, { on: false }, { id: 'session-a' })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: HIDE, names: ['Ada Lovelace'] })

  expect(stored.get('names')).toEqual({ 'session-a': expect.arrayContaining(['Ada Lovelace']) })
})

test('a resumed session gets its saved names back and draws them masked', async ($, on) => {
  const stored = new Map<string, unknown>([['names', { 'session-a': ['Ada Lovelace', 'Ada', 'Lovelace'] }]])
  world(on, { on: false }, { id: 'session-a', stored })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(ON)

  expect(await adaRow($, 'm2')).toBe('░░░ ░░░░░░░░ wrote it.')
})

test('a session does not get the names another session saved', async ($, on) => {
  const stored = new Map<string, unknown>([['names', { 'session-a': ['Ada Lovelace', 'Ada', 'Lovelace'] }]])
  world(on, { on: false }, { id: 'session-b', stored })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(ON)

  // The stand-in model finds only Jane Doe, so Ada Lovelace stays readable.
  expect(await adaRow($, 'm3')).toBe('Ada Lovelace wrote it.')
})

test('only the last 20 sessions keep their names', async ($, on) => {
  const old = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`session-${i}`, [`Person ${i}`]]))
  const stored = new Map<string, unknown>([['names', old]])
  world(on, { on: false }, { id: 'session-new', stored })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: HIDE, names: ['Ada Lovelace'] })

  const saved = stored.get('names') as Record<string, unknown>
  expect(Object.keys(saved)).toHaveLength(20)
  expect(saved['session-0']).toBeUndefined()
  expect(saved['session-1']).toEqual(['Person 1'])
  expect(saved['session-new']).toEqual(expect.arrayContaining(['Ada Lovelace']))
})

test('a refused save does not stop the names from masking', async ($, on) => {
  const fail = { on: true }
  world(on, fail, { id: 'session-a' })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const result = await $.tool.call({ tool: HIDE, names: ['Ada Lovelace'] })

  expect(JSON.stringify(result)).toContain('Masking')
})
