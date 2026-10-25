import { expect, mock, test } from 'claude-code/testing'

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

// The CLI answer a test hands to `$.process.run`.
const cli = (exitCode: number, stdout = '', stderr = '') => ({
  value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
})

const settle = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms))

test('the next press works after a switch failed', async ($, on) => {
  const row = { id: 'demo@market', name: 'demo', marketplace: 'market', version: '1.0.0', scope: 'user', isEnabled: true }
  const commands: string[][] = []
  let writes = 0
  on('state.get', (_, e) => ({
    value: { value: e.key === 'rows' ? { shape: 'rows-1', value: [row] } : '', version: 1 },
  }))
  // The first write is refused, so `toggle` throws after it has set `isBusy`.
  on('state.set', () => {
    writes += 1
    if (writes === 1) return { deny: 'state is down' }

    return { value: { isSet: true, version: writes } }
  })
  on('process.run', (_, e) => {
    commands.push([...e.argv])

    return cli(1, '', 'refused')
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const target = { plugin: 'switchboard', key: 'demo@market:user', requestId: 'mods' }

  await ui.press(target)
  await settle()
  expect(commands).toEqual([])

  await ui.press(target)
  await settle()
  expect(commands).toEqual([['claude', 'plugin', 'disable', 'demo@market', '--scope', 'user']])
  await ui.unmount()
})

test('output that is not a list shows a note and does not throw', async ($, on) => {
  mock.env(on, { HOME: '/home/demo' })
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'mods' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.cwd', () => ({ value: '/work' }))
  on('process.run', () => cli(0, '{"plugins":[]}'))

  await $.command.run({ command: 'mods' })
  await settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const shown = await ui.find({ type: 'Text', text: /Could not list mods: / })

  expect(shown?.text).toBe('Could not list mods: the output is not a list')
  await ui.unmount()
})

test('a refresh that rejects raises no unhandled rejection', async ($, on) => {
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'mods' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  // `refresh` reads the home folder first, so a failed read makes it reject.
  // The kit fails the file ("the file ran to its end") for any rejection nothing handled.
  on('env.get', () => ({ deny: 'environment is down' }))

  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'mods' })
  await settle()
})
