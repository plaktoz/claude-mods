import { expect, test } from 'claude-code/testing'

import { SKIP, LABELS } from './register'
import {
  addIndexLine,
  addRule,
  indexLine,
  join,
  memoryFile,
  memoryName,
  projectFolder,
} from './save'

const RULE = 'Never use m-dashes in answers.'
const composer = { kind: 'composer' }
const PROMPT = 'never use m-dashes in your answers'

test('a rule is added to a new file under a Rules heading', () => {
  expect(addRule('', RULE)).toBe(`## Rules\n\n- ${RULE}\n`)
})

test('a file with no Rules section gets one at the end, after a blank line', () => {
  expect(addRule('# Project\n\nSome text.\n', RULE)).toBe(`# Project\n\nSome text.\n\n## Rules\n\n- ${RULE}\n`)
})

test('a rule goes to the end of an existing Rules section, before the next heading', () => {
  const file = '# P\n\n## Rules\n\n- Keep it short.\n\n## Other\n\ntext\n'

  expect(addRule(file, RULE)).toBe(`# P\n\n## Rules\n\n- Keep it short.\n- ${RULE}\n\n## Other\n\ntext\n`)
})

test('an empty Rules section at the end of the file gets the bullet', () => {
  expect(addRule('## Rules\n', RULE)).toBe(`## Rules\n\n- ${RULE}\n`)
  expect(addRule('## Rules\n\n## Other\n', RULE)).toBe(`## Rules\n\n- ${RULE}\n\n## Other\n`)
})

test('a rule that is already there is a duplicate, however it is bulleted or cased', () => {
  expect(addRule(`## Rules\n\n- ${RULE}\n`, RULE)).toBeUndefined()
  expect(addRule(`* never  USE m-dashes in answers.\n`, RULE)).toBeUndefined()
  expect(addRule(RULE + '\n', RULE)).toBeUndefined()
})

test('CRLF stays CRLF and LF stays LF; the file has one closing newline', () => {
  const crlf = addRule('# P\r\n\r\n## Rules\r\n\r\n- A.\r\n', RULE)!

  expect(crlf).toBe(`# P\r\n\r\n## Rules\r\n\r\n- A.\r\n- ${RULE}\r\n`)
  expect(crlf.replace(/\r\n/g, '')).not.toContain('\n')
  expect(addRule('# P', RULE)).toBe(`# P\n\n## Rules\n\n- ${RULE}\n`)
})

test('non-ASCII text is kept', () => {
  expect(addRule('## Rules\n\n- 使用中文回答。\n', 'Réponds en français.')).toBe(
    '## Rules\n\n- 使用中文回答。\n- Réponds en français.\n',
  )
})

test('the memory index gets one line, once', () => {
  const line = indexLine(RULE)
  const file = `${memoryName(RULE)}.md`
  const once = addIndexLine('- [A](a.md) — a\n', file, line)!

  expect(once).toBe(`- [A](a.md) — a\n${line}\n`)
  expect(addIndexLine(once, file, line)).toBeUndefined()
  expect(addIndexLine('', file, line)).toBe(`${line}\n`)
})

test('a memory file is a feedback memory with a stable name', () => {
  expect(memoryName(RULE)).toMatch(/^feedback-never-use-m-dashes-in-answers-[0-9a-f]{6}$/)
  expect(memoryName(RULE)).toBe(memoryName('  NEVER use m-dashes   in answers. '))
  expect(memoryName(RULE)).not.toBe(memoryName('Never use m-dashes in comments.'))
  expect(memoryName('!!!')).toMatch(/^feedback-rule-[0-9a-f]{6}$/)

  const file = memoryFile(RULE)
  expect(file.startsWith(`---\nname: ${memoryName(RULE)}\n`)).toBe(true)
  expect(file).toContain('  type: feedback')
  expect(file).toContain(`\n${RULE}\n`)
  expect(file).not.toContain('\r')
})

test('the project folder name follows the path; a Windows path and a path with spaces work', () => {
  expect(projectFolder('/Users/me/Developer/claude-mods')).toBe('-Users-me-Developer-claude-mods')
  expect(projectFolder('C:\\Users\\me\\My Project')).toBe('C--Users-me-My-Project')
})

test('join keeps the separator of the base path', () => {
  expect(join('/home/me/', '.claude', 'x')).toBe('/home/me/.claude/x')
  expect(join('C:\\Users\\me', '.claude', 'x')).toBe('C:\\Users\\me\\.claude\\x')
  expect(join('/Users/me/My Files', 'CLAUDE.md')).toBe('/Users/me/My Files/CLAUDE.md')
})

type World = {
  files?: Record<string, string>
  root?: string
  env?: Record<string, string>
  // Paths whose read or write fails.
  unreadable?: string[]
  unwritable?: string[]
  choice?: string
  options?: Record<string, string | number | boolean>
}

// Stands for the engine beneath the mod, with a file system in a map.
const setup = ($: any, on: any, world: World) => {
  const files = { ...(world.files ?? {}) }
  const writes: string[] = []
  const toasts: string[] = []

  on('model.complete', () => ({ value: { isAnswered: true, text: RULE, usage: {} } }))
  on('tool.call', (_: unknown, e: { tool: string; questions?: { question: string }[] }) => {
    if (e.tool !== 'AskUserQuestion') return { result: {} }
    const q = e.questions![0]!
    if (world.choice === undefined) return { deny: 'dismissed' }

    return { result: { questions: e.questions, answers: { [q.question]: world.choice } } }
  })
  on('prompt.submit', (_: unknown, e: { text: string }) => ({ text: e.text }))
  on('turn.complete', (_: unknown, e: { answer: string }) => ({ text: e.answer }))
  on('session.root', () => ({ value: world.root ?? '/work/app' }))
  on('env.get', (_: unknown, e: { name: string }) => ({ value: (world.env ?? { HOME: '/home/me' })[e.name] }))
  on('fs.exists', (_: unknown, e: { path: string }) => ({ value: e.path in files }))
  on('fs.read', (_: unknown, e: { path: string }) => {
    if (world.unreadable?.includes(e.path)) throw new Error('EACCES')

    return { value: files[e.path] }
  })
  on('fs.write', (_: unknown, e: { path: string; text: string }) => {
    if (world.unwritable?.includes(e.path)) throw new Error('EACCES')
    files[e.path] = e.text
    writes.push(e.path)

    return { value: undefined }
  })
  on('ui.toast', (_: unknown, e: { text: string }) => {
    toasts.push(e.text)

    return { value: undefined }
  })

  const run = async () => {
    await $.prompt.submit({ text: PROMPT, origin: composer, wait: false })
    await $.turn.complete({ answer: 'done', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' })
  }

  return { files, writes, toasts, run }
}

const OPTIONS = { toGlobalClaudeMd: true }
const MEMORY = '/home/me/.claude/projects/-work-app/memory'

test('the project CLAUDE.md is created when it is missing', async ($, on) => {
  const w = setup($, on, { choice: LABELS.project })
  await w.run()

  expect(w.files['/work/app/CLAUDE.md']).toBe(`## Rules\n\n- ${RULE}\n`)
  expect(w.toasts).toEqual(['Saved to Project CLAUDE.md.'])
})

test('the project CLAUDE.md keeps its content and its CRLF', async ($, on) => {
  const w = setup($, on, { choice: LABELS.project, files: { '/work/app/CLAUDE.md': '# App\r\n\r\nNotes.\r\n' } })
  await w.run()

  expect(w.files['/work/app/CLAUDE.md']).toBe(`# App\r\n\r\nNotes.\r\n\r\n## Rules\r\n\r\n- ${RULE}\r\n`)
})

test('a rule already in the file is not written twice', async ($, on) => {
  const content = `## Rules\n\n- ${RULE}\n`
  const w = setup($, on, { choice: LABELS.project, files: { '/work/app/CLAUDE.md': content } })
  await w.run()

  expect(w.writes).toEqual([])
  expect(w.toasts).toEqual(['Already in Project CLAUDE.md.'])
})

test('auto memory gets a feedback file and one index line', async ($, on) => {
  const w = setup($, on, { choice: LABELS.memory, files: { [`${MEMORY}/MEMORY.md`]: '- [Old](old.md) — old\n' } })
  await w.run()

  const name = memoryName(RULE)
  expect(w.files[`${MEMORY}/${name}.md`]).toBe(memoryFile(RULE))
  expect(w.files[`${MEMORY}/MEMORY.md`]).toBe(`- [Old](old.md) — old\n${indexLine(RULE)}\n`)
  expect(w.toasts).toEqual(['Saved to Auto memory.'])
})

test('auto memory creates the index when there is none, and honours CLAUDE_CONFIG_DIR', async ($, on) => {
  const w = setup($, on, { choice: LABELS.memory, env: { CLAUDE_CONFIG_DIR: '/cfg' }, root: '/work/my app' })
  await w.run()

  expect(w.files['/cfg/projects/-work-my-app/memory/MEMORY.md']).toBe(`${indexLine(RULE)}\n`)
})

test('auto memory is not written twice', async ($, on) => {
  const name = memoryName(RULE)
  const w = setup($, on, {
    choice: LABELS.memory,
    files: { [`${MEMORY}/${name}.md`]: memoryFile(RULE), [`${MEMORY}/MEMORY.md`]: `${indexLine(RULE)}\n` },
  })
  await w.run()

  expect(w.writes).toEqual([])
  expect(w.toasts).toEqual(['Already in Auto memory.'])
})

test('a memory file whose index line is missing gets the line', async ($, on) => {
  const w = setup($, on, { choice: LABELS.memory, files: { [`${MEMORY}/${memoryName(RULE)}.md`]: memoryFile(RULE) } })
  await w.run()

  expect(w.writes).toEqual([`${MEMORY}/MEMORY.md`])
})

test('the global CLAUDE.md is in the home folder, found by USERPROFILE on Windows', { options: OPTIONS }, async ($, on) => {
  const w = setup($, on, { choice: LABELS.global, env: { USERPROFILE: 'C:\\Users\\me' }, root: 'C:\\Work\\App' })
  await w.run()

  // The kit runs on this machine's rules, where `C:\\...` is not absolute, so it
  // puts the working directory before the path the mod built.
  const [path] = w.writes
  expect(path).toMatch(/C:\\Users\\me\\\.claude\\CLAUDE\.md$/)
  expect(w.files[path!]).toBe(`## Rules\n\n- ${RULE}\n`)
})

test('Skip writes nothing', async ($, on) => {
  const w = setup($, on, { choice: SKIP })
  await w.run()

  expect(w.writes).toEqual([])
  expect(w.toasts).toEqual([])
})

test('a dismissed dialog writes nothing', async ($, on) => {
  const w = setup($, on, {})
  await w.run()

  expect(w.writes).toEqual([])
})

test('free text under "Other" writes nothing', async ($, on) => {
  const w = setup($, on, { choice: 'somewhere else' })
  await w.run()

  expect(w.writes).toEqual([])
})

test('a file that cannot be read is never overwritten', async ($, on) => {
  const path = '/work/app/CLAUDE.md'
  const w = setup($, on, { choice: LABELS.project, files: { [path]: '# Keep me\n' }, unreadable: [path] })
  await w.run()

  expect(w.writes).toEqual([])
  expect(w.files[path]).toBe('# Keep me\n')
  expect(w.toasts).toEqual([])
})

test('a failed write is silent', async ($, on) => {
  const w = setup($, on, { choice: LABELS.project, unwritable: ['/work/app/CLAUDE.md'] })
  await w.run()

  expect(w.writes).toEqual([])
  expect(w.toasts).toEqual([])
})

test('no home folder: the global file is not written', { options: OPTIONS }, async ($, on) => {
  const w = setup($, on, { choice: LABELS.global, env: {} })
  await w.run()

  expect(w.writes).toEqual([])
})
