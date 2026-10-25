import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { SwitchboardRow } from '../types'

const PANE = 'mods'
const POLL_MS = 3000

// Change the tag when a row's fields change: it declines what an earlier
// version stored, which outlives a reload.
const rows = atom({ plugin: 'switchboard', key: 'rows' } as const, [] as SwitchboardRow[], {
  shape: 'rows-1',
})
const note = atom({ plugin: 'switchboard', key: 'note' } as const, '')

// The files whose change means a plugin was installed, removed or switched.
const WATCHED = [
  ['.claude', 'plugins', 'installed_plugins.json'],
  ['.claude', 'settings.json'],
]
const LIST_FAILED = 'Could not list mods: '

let seen = ''
let isBusy = false

type ListedPlugin = {
  id: string
  version?: string
  scope: string
  enabled: boolean
  projectPath?: string
}

// A Windows path (drive letter or UNC): either slash, any letter case, no trailing slash.
const isWindowsPath = (p: string) => /^[a-z]:[\\/]/i.test(p) || p.startsWith('\\\\')
const normalized = (p: string) => {
  if (!isWindowsPath(p)) return p

  return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

const isHere = (p: ListedPlugin, cwd: string) => {
  if (p.scope === 'user') return true
  if (p.projectPath === undefined) return false

  const here = normalized(cwd)
  const project = normalized(p.projectPath)

  return here === project || here.startsWith(project + '/')
}

// The home folder: native Windows sets USERPROFILE, not HOME.
async function homeOf($: EngineInterface) {
  return (await $.env.get('HOME')) || (await $.env.get('USERPROFILE'))
}

// Joins with the separator the home path already uses.
const under = (home: string, parts: string[]) => {
  const sep = home.includes('\\') && !home.includes('/') ? '\\' : '/'

  return [home.replace(/[\\/]+$/, ''), ...parts].join(sep)
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error))

async function fingerprint($: EngineInterface, home: string) {
  const parts = await Promise.all(
    WATCHED.map(async file => {
      const stat = await $.fs.stat(under(home, file)).catch(() => undefined)

      return stat === undefined ? '-' : `${stat.mtimeMs}:${stat.size}`
    }),
  )

  return parts.join('|')
}

// Reads the installed plugins through the CLI and stores the ones that apply here.
async function refresh($: EngineInterface) {
  const home = await homeOf($)
  if (!home) return

  const print = await fingerprint($, home)
  seen = print

  let ran
  try {
    ran = await $.process.run(['claude', 'plugin', 'list', '--json'], { timeoutMs: 20000 })
  } catch (error) {
    await update($, note, () => `${LIST_FAILED}${reason(error)}`)

    return
  }
  if (ran.exitCode !== 0) {
    const why = (ran.stderr || ran.stdout || `exit code ${ran.exitCode}`).trim().split(/\r?\n/)[0]
    await update($, note, () => `${LIST_FAILED}${why}`)

    return
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(ran.stdout)
  } catch {
    return
  }
  if (!Array.isArray(parsed)) {
    await update($, note, () => `${LIST_FAILED}the output is not a list`)

    return
  }
  const listed: ListedPlugin[] = parsed
  // The list worked, so an earlier failure notice is out of date.
  await update($, note, old => (old.startsWith(LIST_FAILED) ? '' : old))

  const cwd = await $.session.cwd()
  const next: SwitchboardRow[] = listed
    .filter(p => isHere(p, cwd))
    .map(p => {
      const at = p.id.lastIndexOf('@')

      return {
        id: p.id,
        name: at < 0 ? p.id : p.id.slice(0, at),
        marketplace: at < 0 ? '' : p.id.slice(at + 1),
        version: p.version ?? '',
        scope: p.scope,
        isEnabled: p.enabled,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.scope.localeCompare(b.scope))

  // Writing an equal list would redraw the pane for nothing.
  await update($, rows, old => (JSON.stringify(old) === JSON.stringify(next) ? old : next))
}

// For a hook that cannot await the list: a failure becomes the list note.
const refreshOrNote = ($: EngineInterface) =>
  refresh($).catch(error => update($, note, () => `${LIST_FAILED}${reason(error)}`))

const detail = (row: SwitchboardRow) =>
  [row.version.slice(0, 12), row.scope, row.marketplace].filter(part => part !== '').join(' · ')

async function toggle($: EngineInterface, row: SwitchboardRow) {
  if (isBusy) return
  isBusy = true
  const verb = row.isEnabled ? 'disable' : 'enable'
  try {
    await update($, note, () => `${verb === 'enable' ? 'Enabling' : 'Disabling'} ${row.name}...`)

    let spawnError: string | undefined
    const ran = await $.process
      .run(['claude', 'plugin', verb, row.id, '--scope', row.scope], { timeoutMs: 60000 })
      .catch(error => {
        spawnError = reason(error)

        return undefined
      })

    if (ran === undefined || ran.exitCode !== 0) {
      const why = (ran?.stderr || ran?.stdout || spawnError || 'the command did not run').trim().split(/\r?\n/)[0]
      await update($, note, () => `Could not ${verb} ${row.name}: ${why}`)

      return
    }

    await refresh($)
    // A switch applies to the running session on a reload; ask for it, and say so if it cannot be.
    const reloaded = await $.command.run({ command: 'reload-plugins' }).then(
      () => true,
      () => false,
    )
    await update(
      $,
      note,
      () => `${row.name} ${verb}d.${reloaded ? '' : ' Run /reload-plugins to apply it to this session.'}`,
    )
  } finally {
    isBusy = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'mods',
      description: 'Open the switchboard: every installed mod, with an on/off toggle',
    })
    void refreshOrNote($)
    // Installs show up on their own: a cheap file check each period, the CLI only on a change.
    $.clock.every(POLL_MS, async () => {
      const home = await homeOf($)
      if (!home || isBusy) return
      if ((await fingerprint($, home)) !== seen) await refresh($)
    })

    return next(e)
  })

  on('command.run', { command: 'mods' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Mods', focus: true, closeOnEscape: true })
    void refreshOrNote($)

    return { text: 'Switchboard opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, rows)
    const message = await read($, note)
    const active = list.filter(r => r.isEnabled).length

    return (
      <Box flexDirection="column">
        <Text dimColor>
          {list.length === 0 ? 'No mods installed.' : `${active} of ${list.length} on. Press a mod to switch it.`}
        </Text>
        {list.map(row => (
          <Button
            key={`${row.id}:${row.scope}`}
            label={`${row.isEnabled ? '[x]' : '[ ]'} ${row.name}  ${detail(row)}`}
            onPress={() => {
              void toggle($, row).catch(error => update($, note, () => `Could not switch ${row.name}: ${reason(error)}`))
            }}
          />
        ))}
        {message !== '' && <Text>{message}</Text>}
      </Box>
    )
  })
}
