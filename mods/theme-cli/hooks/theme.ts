// Themes: what a theme.json says, and the scene the strip draws from it.
// Pure: no `$`. register.tsx reads the files and hands their text here.

// One built frame, as scripts/build-theme.py writes it: `rows` index `palette` by glyph, '.' is clear.
export type Frame = { w: number; h: number; palette: string[]; rows: string[] }
// A frame decoded: colours 0xRRGGBB row-major, -1 for clear.
export type Pix = { w: number; h: number; px: number[] }

// The moments a theme can play a sound for: a turn starting, a turn in progress (looped),
// a turn answered, and a turn that failed.
export const CUES = ['start', 'working', 'success', 'error'] as const
export type Cue = (typeof CUES)[number]
// A sound ready to play: the file's bytes as base64, its MIME type, and its gain.
export type Sound = { base64: string; mime: string; gain: number }
export type Sounds = Partial<Record<Cue, Sound>>

// A theme folder's theme.json. Every field is optional; what is left out is drawn as a placeholder.
export type ThemeSpec = {
  name?: string
  // Sprite height in pixels; two pixels of ground go under it, two pixels to a terminal row.
  height?: number
  // `key` is a background colour [r, g, b] made clear.
  sheets?: Record<string, { file: string; key?: number[] }>
  frames?: Record<string, { sheet?: string; file?: string; box?: number[]; key?: number[]; height?: number }>
  cast?: {
    lead?: { run?: string[]; jump?: string }
    partner?: { run?: string[] }
    companion?: { frame?: string; frames?: string[]; recolor?: { hue: number; to: number[]; range?: number } }
    goal?: { frame?: string }
  }
  colors?: { ground?: string[]; dirt?: string; pole?: string; flag?: string }
  // One audio file per cue. `gain` is linear, 0 to 4 (default 1).
  sounds?: Partial<Record<Cue, { file: string; gain?: number }>>
}

// A theme ready to draw: every sprite decoded, every companion colour made.
export type Scene = {
  name: string
  height: number
  lead: { run: Pix[]; jump: Pix }
  partner: { run: Pix[] } | null
  // One sprite per colour slot; a companion draws the one at its slot, cycling.
  companions: Pix[]
  goal: Pix
  colors: { ground: [number, number]; dirt: number; pole: number; flag: number }
  // Names the cast asks for that the built sprites lack, drawn as placeholders.
  missing: string[]
}

const GLYPHS = '0123456789abcdefghijklmnopqrstuvwxyz'
// Each companion's body hue, by slot: green, red, yellow, blue, pink, cyan.
const HUES = [130, 0, 50, 240, 320, 185]
const LEAD = 0xd9402f
const PARTNER = 0x2e9d4f

export const NONE: Pix = { w: 0, h: 0, px: [] }

// The theme with no files: placeholders only, so the strip works before any theme is set up.
export const BUILT_IN: ThemeSpec = {
  name: 'default',
  height: 8,
  cast: {
    lead: { run: ['lead-1', 'lead-2'], jump: 'lead-1' },
    partner: { run: ['partner-1', 'partner-2'] },
    companion: { frame: 'companion', recolor: { hue: 240, to: HUES } },
    goal: { frame: 'goal' },
  },
}

// Sprite heights round up to even, so the sprite and the ground fill whole rows.
export function heightOf(spec: ThemeSpec) {
  const h = Math.round(spec.height ?? 8)

  return clamp(h + (h % 2), 4, 32)
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n))
}

function hex(text: string | undefined, fallback: number) {
  return text && /^#[0-9a-f]{6}$/i.test(text) ? parseInt(text.slice(1), 16) : fallback
}

// A runner placeholder `h` pixels square: head, body, and legs that swap on odd steps.
function runner(color: number, step: number, h: number): Pix {
  const head = Math.round((h * 3) / 8)
  const body = Math.round((h * 6) / 8)
  const leg = Math.max(1, Math.round(h / 4))
  const left = step % 2 === 0 ? Math.round(h / 8) : Math.round(h / 4)
  const right = h - left - leg
  const px: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < h; x++) {
      const isHead = y < head && x >= h / 4 && x < (3 * h) / 4
      const isBody = y >= head && y < body && x >= h / 8 && x < (7 * h) / 8
      const isLeg = y >= body && ((x >= left && x < left + leg) || (x >= right && x < right + leg))
      px.push(isHead ? 0xf2c9a0 : isBody ? color : isLeg ? 0x222222 : -1)
    }
  }

  return { w: h, h, px }
}

function slab(w: number, h: number, color: number, hasDoor: boolean): Pix {
  const px: number[] = []
  const door = Math.max(1, Math.round(h / 2))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const isDoor = hasDoor && y >= h - door && x >= w / 2 - door / 2 && x < w / 2 + door / 2
      px.push(isDoor ? -1 : color)
    }
  }

  return { w, h, px }
}

function isFrame(value: unknown): value is Frame {
  const f = value as Frame
  return (
    typeof f === 'object' &&
    f !== null &&
    typeof f.w === 'number' &&
    typeof f.h === 'number' &&
    Array.isArray(f.palette) &&
    Array.isArray(f.rows)
  )
}

export function decode(frame: Frame): Pix {
  const px: number[] = []
  for (let y = 0; y < frame.h; y++) {
    const row = frame.rows[y] ?? ''
    for (let x = 0; x < frame.w; x++) {
      const ch = row[x] ?? '.'
      const color = ch === '.' ? undefined : frame.palette[GLYPHS.indexOf(ch)]
      px.push(color ? hex(color, -1) : -1)
    }
  }

  return { w: frame.w, h: frame.h, px }
}

function fromHsv(h: number, s: number, v: number) {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  const sector = Math.floor((((h % 360) + 360) % 360) / 60)
  const [r = 0, g = 0, b = 0] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][sector] ?? []
  const byte = (n: number) => Math.round((n + m) * 255)

  return (byte(r) << 16) | (byte(g) << 8) | byte(b)
}

function hueOf(r: number, g: number, b: number) {
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  if (d === 0) return { h: 0, s: 0, v: max / 255 }

  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4

  return { h: (h * 60 + 360) % 360, s: d / max, v: max / 255 }
}

// Turns every pixel within `range` degrees of hue `from` to hue `to`; greys and other hues stay.
export function recolor(p: Pix, from: number, to: number, range = 20): Pix {
  if (from === to) return p

  const px = p.px.map(c => {
    if (c < 0) return c

    const { h, s, v } = hueOf((c >> 16) & 255, (c >> 8) & 255, c & 255)
    const off = Math.abs(((h - from + 540) % 360) - 180)
    if (s < 0.3 || off > range) return c

    return fromHsv(to, s, v)
  })

  return { ...p, px }
}

// A path in theme.json: `~/` is the home folder, a relative path is the theme folder's.
export function resolvePath(text: string, home: string, dir: string) {
  if (text.startsWith('~/')) return `${home}/${text.slice(2)}`

  return text.startsWith('/') ? text : `${dir}/${text}`
}

// The image files and folders a theme draws from: each sheet, and each frame that names its own file.
export function sourcesOf(spec: ThemeSpec, home: string, dir: string) {
  const out = Object.values(spec.sheets ?? {}).map(s => resolvePath(s.file, home, dir))
  for (const frame of Object.values(spec.frames ?? {})) {
    if (frame.file && !frame.sheet) out.push(resolvePath(frame.file, home, dir))
  }

  return [...new Set(out)]
}

function isStringList(value: unknown) {
  return Array.isArray(value) && value.every(v => typeof v === 'string')
}

// Parses theme.json, naming the first field that is the wrong kind of value.
export function parseSpec(text: string): ThemeSpec {
  const spec = JSON.parse(text) as ThemeSpec
  if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) throw new Error('theme.json is not an object')
  if (spec.height !== undefined && typeof spec.height !== 'number') throw new Error('"height" is not a number')

  const cast = spec.cast ?? {}
  if (cast.lead?.run !== undefined && !isStringList(cast.lead.run)) throw new Error('"cast.lead.run" is not a list of frame names')
  if (cast.partner?.run !== undefined && !isStringList(cast.partner.run)) {
    throw new Error('"cast.partner.run" is not a list of frame names')
  }
  if (cast.companion?.frames !== undefined && !isStringList(cast.companion.frames)) {
    throw new Error('"cast.companion.frames" is not a list of frame names')
  }
  const recolorSpec = cast.companion?.recolor
  if (recolorSpec && (typeof recolorSpec.hue !== 'number' || !Array.isArray(recolorSpec.to))) {
    throw new Error('"cast.companion.recolor" needs a "hue" number and a "to" list of hues')
  }

  for (const cue of CUES) {
    const sound = spec.sounds?.[cue]
    if (sound === undefined) continue
    if (typeof sound !== 'object' || sound === null || typeof sound.file !== 'string') {
      throw new Error(`"sounds.${cue}" needs a "file" path`)
    }
    if (sound.gain !== undefined && (typeof sound.gain !== 'number' || sound.gain < 0 || sound.gain > 4)) {
      throw new Error(`"sounds.${cue}.gain" is not a number from 0 to 4`)
    }
  }

  return spec
}

// Decodes the theme's cast from its built frames; any name the frames lack becomes a placeholder.
export function resolveScene(spec: ThemeSpec, built: Record<string, unknown>, name: string): Scene {
  const height = heightOf(spec)
  const missing: string[] = []
  const pick = (ref: string | undefined, fallback: Pix): Pix => {
    if (!ref) return fallback

    const frame = built[ref]
    if (!isFrame(frame)) {
      missing.push(ref)

      return fallback
    }

    return decode(frame)
  }
  const cast = spec.cast ?? {}

  const leadNames = cast.lead?.run?.length ? cast.lead.run : ['', '']
  const leadRun = leadNames.map((ref, i) => pick(ref, runner(LEAD, i, height)))
  const jump = pick(cast.lead?.jump, leadRun[0] ?? runner(LEAD, 0, height))
  const partner = cast.partner?.run?.length
    ? { run: cast.partner.run.map((ref, i) => pick(ref, runner(PARTNER, i, height))) }
    : null

  const mate = cast.companion ?? {}
  const body = slab(Math.round(height * 0.75), Math.round(height * 0.75), 0x4040d8, false)
  let companions: Pix[]
  if (mate.frames?.length) {
    companions = mate.frames.map(ref => pick(ref, body))
  } else {
    const base = pick(mate.frame, body)
    const shift = mate.recolor ?? (mate.frame ? undefined : { hue: 240, to: HUES })
    companions = shift ? shift.to.map(to => recolor(base, shift.hue, to, shift.range)) : [base]
  }

  const goal = pick(cast.goal?.frame, slab(height, height, 0x8a8a8a, true))
  const c = spec.colors ?? {}
  const colors = {
    ground: [hex(c.ground?.[0], 0xe69c3c), hex(c.ground?.[1], 0xc84c0c)] as [number, number],
    dirt: hex(c.dirt, 0x7c2c00),
    pole: hex(c.pole, 0xcfcfcf),
    flag: hex(c.flag, PARTNER),
  }

  return {
    name,
    height,
    lead: { run: leadRun, jump },
    partner,
    companions: companions.length ? companions : [body],
    goal,
    colors,
    missing,
  }
}
