import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'switchboard',
  component: 'Pane',
  requestId: 'mods',
  props: {
    title: 'Mods',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('the pane says when no mod is installed', async ($, on) => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect((await ui.find({ type: 'Text', text: /No mods installed/ }))?.text).toBe('No mods installed.')
  await ui.unmount()
})

test('a stored row is drawn with its switch', async ($, on) => {
  // A shaped value is kept as { shape, value }; the row list is stored under rows-1.
  const row = { id: 'demo@market', name: 'demo', marketplace: 'market', version: '1.0.0', scope: 'user', isEnabled: true }
  on('state.get', (_, e) => ({
    value: { value: e.key === 'rows' ? { shape: 'rows-1', value: [row] } : '', version: 1 },
  }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect(await ui.find({ type: 'Button', text: /\[x\] demo/ })).toBeTruthy()
  await ui.unmount()
})
