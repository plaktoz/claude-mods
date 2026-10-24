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
const world = (on: any) => {
  const stored = new Map<string, unknown>()
  on('command.register', () => ({ value: { command: 'screen-share' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__screen-share__set_mode' } }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('store.get', (_: unknown, e: { key: string }) => ({ value: stored.get(e.key) }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => {
    stored.set(e.key, e.value)

    return { value: undefined }
  })
  on('session.messages', () => ({ value: [{ role: 'user', text: 'Call Jane Doe back.', toolUses: [] }] }))
  on('model.complete', () => ({ value: { isAnswered: true, text: '["Jane Doe"]', usage: USAGE } }))
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{typeof e.props.text === 'string' ? e.props.text : 'engine'}</Text>
  })

  return stored
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
  const stored = world(on)
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
