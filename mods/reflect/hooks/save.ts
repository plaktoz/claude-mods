import type { EngineInterfaceBuilt } from 'claude-code'

export type Destination = 'memory' | 'project' | 'global'
export type SaveResult = 'saved' | 'duplicate'

type Engine = EngineInterfaceBuilt

const RULES_HEADING = '## Rules'
const SLUG_CHARS = 40
const TITLE_CHARS = 60

export const ruleKey = (rule: string) => rule.toLowerCase().replace(/\s+/g, ' ').trim()

const eolOf = (content: string) => (content.includes('\r\n') ? '\r\n' : '\n')

// The lines of a file, without the empty one a closing newline leaves.
const linesOf = (content: string) => {
  const lines = content === '' ? [] : content.split(/\r?\n/)
  if (lines.at(-1) === '') lines.pop()

  return lines
}

const isRuleLine = (line: string, rule: string) =>
  ruleKey(line.replace(/^\s*[-*+]\s+/, '')) === ruleKey(rule)

// The file with the rule added as a bullet at the end of its `## Rules`
// section (made when missing), keeping the file's line ending; undefined
// when the file already holds the rule.
export const addRule = (content: string, rule: string): string | undefined => {
  const eol = eolOf(content)
  const lines = linesOf(content)
  if (lines.some(line => isRuleLine(line, rule))) return undefined

  const bullet = `- ${rule}`
  const start = lines.findIndex(line => line.trim() === RULES_HEADING)

  if (start === -1) {
    if (lines.length > 0) lines.push('')
    lines.push(RULES_HEADING, '', bullet)
  } else {
    let end = lines.findIndex((line, i) => i > start && /^#{1,2}\s/.test(line))
    if (end === -1) end = lines.length

    // After the last line of the section that has text.
    let at = end
    while (at > start + 1 && lines[at - 1]!.trim() === '') at--

    const before = at === start + 1 ? [''] : []
    const after = at === end && end < lines.length ? [''] : []
    lines.splice(at, 0, ...before, bullet, ...after)
  }

  return lines.join(eol) + eol
}

// The memory index with one line added; undefined when `file` is listed.
export const addIndexLine = (content: string, file: string, line: string): string | undefined => {
  if (content.includes(`(${file})`)) return undefined
  const eol = eolOf(content)

  return [...linesOf(content), line].join(eol) + eol
}

// A short stable tag, so two rules with the same first words keep apart.
const hashOf = (text: string) => {
  let hash = 5381
  for (const char of text) hash = (Math.imul(hash, 33) + char.codePointAt(0)!) >>> 0

  return hash.toString(16).padStart(8, '0').slice(0, 6)
}

// `never-use-m-dashes-in-answers-1a2b3c`: a name for a memory file.
export const memoryName = (rule: string) => {
  const slug = ruleKey(rule)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_CHARS)
    .replace(/-+$/, '')

  return `feedback-${slug === '' ? 'rule' : slug}-${hashOf(ruleKey(rule))}`
}

const oneLine = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, ' ').trim()

  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

export const memoryFile = (rule: string) => {
  const name = memoryName(rule)

  return [
    '---',
    `name: ${name}`,
    `description: ${JSON.stringify(oneLine(rule, 200))}`,
    'metadata:',
    '  type: feedback',
    '---',
    '',
    rule,
    '',
    '**Why:** The user stated it as a lasting rule in a prompt, and chose to save it.',
    '**How to apply:** Follow it in every later task, not only the one it came with.',
    '',
  ].join('\n')
}

export const indexLine = (rule: string) =>
  `- [${oneLine(rule, TITLE_CHARS)}](${memoryName(rule)}.md) — saved from a prompt`

// The folder name Claude Code gives a project: every character that is not a
// letter or a digit becomes "-". Windows `C:\Users\me` gives `C--Users-me`.
export const projectFolder = (root: string) => root.replace(/[^a-zA-Z0-9]/g, '-')

// Joins with the separator the base path already uses: a Windows path has
// backslashes and no slash.
export const join = (base: string, ...parts: string[]) => {
  const sep = base.includes('\\') && !base.includes('/') ? '\\' : '/'

  return [base.replace(/[\\/]+$/, ''), ...parts].join(sep)
}

// Claude Code's own folder: CLAUDE_CONFIG_DIR, else `.claude` in the home
// folder (native Windows sets USERPROFILE, not HOME).
async function configDir($: Engine): Promise<string> {
  const set = await $.env.get('CLAUDE_CONFIG_DIR')
  if (set) return set

  const home = (await $.env.get('HOME')) || (await $.env.get('USERPROFILE'))
  if (!home) throw new Error('no home folder')

  return join(home, '.claude')
}

// The file's text, '' when it is not there. A read that fails on a file that
// is there throws, so the caller never writes over what it could not read.
async function textOf($: Engine, path: string): Promise<string> {
  return (await $.fs.exists(path)) ? $.fs.read(path) : ''
}

async function saveToMarkdown($: Engine, path: string, rule: string): Promise<SaveResult> {
  const next = addRule(await textOf($, path), rule)
  if (next === undefined) return 'duplicate'
  await $.fs.write(path, next)

  return 'saved'
}

async function saveToMemory($: Engine, rule: string): Promise<SaveResult> {
  const folder = join(await configDir($), 'projects', projectFolder(await $.session.root()), 'memory')
  const file = `${memoryName(rule)}.md`
  const path = join(folder, file)
  const indexPath = join(folder, 'MEMORY.md')

  const hasFile = await $.fs.exists(path)
  if (!hasFile) await $.fs.write(path, memoryFile(rule))

  // A file left without its index line by an earlier failed save gets it now.
  const index = addIndexLine(await textOf($, indexPath), file, indexLine(rule))
  if (index !== undefined) await $.fs.write(indexPath, index)

  return hasFile && index === undefined ? 'duplicate' : 'saved'
}

// Saves the rule to the destination. Throws when it cannot, and saves nothing
// it could not read first.
export async function saveRule($: Engine, destination: Destination, rule: string): Promise<SaveResult> {
  if (destination === 'memory') return saveToMemory($, rule)
  if (destination === 'project') return saveToMarkdown($, join(await $.session.root(), 'CLAUDE.md'), rule)

  return saveToMarkdown($, join(await configDir($), 'CLAUDE.md'), rule)
}
