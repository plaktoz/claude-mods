// The strip's compositor: a scene and a moment in, Raster cells out. Pure: no `$`.

import type { Beat, Crew } from '../types'
import { NONE } from './theme'
import type { Pix, Scene } from './theme'

// The lead's speed along the strip, in pixels per millisecond.
const SPEED = 0.03
const GROUND = 2
const DEFAULT = 0x01000000

export type View = { beat: Beat; crew: Crew[]; turnStart: number; finaleStart: number; now: number }
type Canvas = { buf: number[]; width: number; tall: number }

// Terminal rows for a scene: its sprites over two pixels of ground, two pixels to a row.
export function rowsOf(scene: Scene) {
  return Math.ceil((scene.height + GROUND) / 2)
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * clamp(t, 0, 1)
}

// Keeps a sprite's left edge in the strip plus `margin` pixels off each side, so it runs on and off.
function wrap(p: number, width: number, margin: number) {
  const span = width + 2 * margin

  return ((((p + margin) % span) + span) % span) - margin
}

// The frame a cycle shows at `t` ms, 110 ms each.
function frameAt(frames: Pix[], t: number): Pix {
  return frames[Math.floor(t / 110) % frames.length] ?? NONE
}

function put(c: Canvas, x: number, y: number, color: number) {
  if (x < 0 || x >= c.width || y < 0 || y >= c.tall) return

  c.buf[y * c.width + x] = color
}

// Draws `s` with its bottom edge on row `floor`, `lift` pixels up.
function stamp(c: Canvas, s: Pix, x: number, floor: number, lift = 0) {
  const ox = Math.round(x)
  const oy = Math.round(floor - s.h - lift)
  for (let j = 0; j < s.h; j++) {
    for (let i = 0; i < s.w; i++) {
      const color = s.px[j * s.w + i] ?? -1
      if (color >= 0) put(c, ox + i, oy + j, color)
    }
  }
}

function drawGround(c: Canvas, scene: Scene, floor: number, scroll: number) {
  const brick = Math.max(2, scene.height / 2)
  for (let x = 0; x < c.width; x++) {
    const isLight = Math.floor((x + scroll) / brick) % 2 === 0
    put(c, x, floor, scene.colors.ground[isLight ? 0 : 1])
    put(c, x, floor + 1, scene.colors.dirt)
  }
}

// One companion per running agent, trailing the lead and sliding in when it joins.
function drawCrew(c: Canvas, scene: Scene, view: View, floor: number) {
  const t = view.now - view.turnStart
  const h = scene.height
  view.crew.forEach((member, i) => {
    const sprite = scene.companions[member.slot % scene.companions.length] ?? NONE
    const slide = clamp((view.now - member.at) / 600, 0, 1)
    const x = wrap(t * SPEED - (2 * h + 4) - (h + 1) * i, c.width, h) - Math.round((1 - slide) * 1.5 * h)
    const bob = h >= 8 && Math.floor(t / 180 + i) % 2 === 1 ? 1 : 0
    stamp(c, sprite, x, floor, bob)
  })
}

// The end of the stage: run to the pole, slide down it, walk into the goal.
function drawFinale(c: Canvas, scene: Scene, view: View, floor: number) {
  const t = view.now - view.finaleStart
  const h = scene.height
  const poleX = Math.max(h + 1, c.width - (2 * h - 1))
  const goalX = c.width - scene.goal.w
  const reach = poleX - Math.round(0.75 * h)
  stamp(c, scene.goal, goalX, floor)

  for (let y = 0; y < floor; y++) put(c, poleX, y, scene.colors.pole)
  const slide = clamp((t - 1500) / 1100, 0, 1)
  const flagH = Math.max(2, h / 2)
  const flagY = Math.round(slide * (floor - flagH))
  for (let j = 0; j < flagH; j++) {
    for (let i = 0; i < flagH - 1; i++) put(c, poleX - 1 - i, flagY + j, scene.colors.flag)
  }

  const { run, jump } = scene.lead
  if (t < 1500) {
    stamp(c, frameAt(run, t), lerp(-h, reach, t / 1500), floor)
  } else if (t < 2600) {
    stamp(c, jump, reach, jump.h + 1 + lerp(0, floor - jump.h - 1, slide))
  } else if (t < 3700) {
    stamp(c, frameAt(run, t), lerp(reach, goalX + 1, (t - 2600) / 1100), floor)
  }
}

// The whole scene as pixel colours (0xRRGGBB, or -1 for clear), row-major, `width` across.
export function draw(scene: Scene, view: View, width: number): number[] {
  const tall = rowsOf(scene) * 2
  const c: Canvas = { buf: new Array(width * tall).fill(-1), width, tall }
  const floor = tall - GROUND
  const t = view.now - view.turnStart
  drawGround(c, scene, floor, view.beat === 'working' ? Math.floor(t * SPEED) : 0)

  if (view.beat === 'complete') {
    drawFinale(c, scene, view, floor)
  } else if (view.beat === 'working') {
    const lead = t * SPEED
    if (scene.partner) stamp(c, frameAt(scene.partner.run, t), wrap(lead - (scene.height + 1), width, scene.height), floor)
    stamp(c, frameAt(scene.lead.run, t), wrap(lead, width, scene.height), floor)
  }

  drawCrew(c, scene, view, floor)

  return c.buf
}

// A cell packs two pixels: the top one as a '▀' foreground, the bottom as its background.
function cell(top: number, bottom: number): number[] {
  if (top < 0 && bottom < 0) return [0x20, DEFAULT, DEFAULT]
  if (bottom < 0) return [0x2580, top, DEFAULT]
  if (top < 0) return [0x2584, bottom, DEFAULT]

  return [0x2580, top, bottom]
}

export function cellsOf(buf: number[], width: number): number[][] {
  const out: number[][] = []
  const rows = buf.length / width / 2
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < width; cx++) {
      out.push(cell(buf[2 * cy * width + cx] ?? -1, buf[(2 * cy + 1) * width + cx] ?? -1))
    }
  }

  return out
}

// Standard padded base64 of little-endian u32 triplets, as Raster's `cells` asks.
export function pack(cells: number[][]): string {
  let binary = ''
  for (const triplet of cells) {
    for (const v of triplet) {
      binary += String.fromCharCode(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255)
    }
  }

  return btoa(binary)
}

export function asText(cells: number[][], width: number): string[] {
  const rows: string[] = []
  for (let i = 0; i < cells.length; i += width) {
    rows.push(
      cells
        .slice(i, i + width)
        .map(c => String.fromCodePoint(c[0] ?? 0x20))
        .join(''),
    )
  }

  return rows
}
