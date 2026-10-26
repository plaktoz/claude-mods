// Base64 and 16-bit PCM WAV helpers. The module has no Node or DOM, so these are written out;
// they are pure, so the tests call them directly.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const CODES = new Int16Array(128).fill(-1)
for (let i = 0; i < ALPHABET.length; i++) CODES[ALPHABET.charCodeAt(i)] = i

export function decode(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '')
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  const at = (i: number) => (i < clean.length ? (CODES[clean.charCodeAt(i)] ?? 0) : 0)
  let o = 0
  for (let i = 0; i < clean.length; i += 4) {
    const n = (at(i) << 18) | (at(i + 1) << 12) | (at(i + 2) << 6) | at(i + 3)
    out[o++] = (n >> 16) & 255
    if (i + 2 < clean.length) out[o++] = (n >> 8) & 255
    if (i + 3 < clean.length) out[o++] = n & 255
  }

  return out.subarray(0, o)
}

export function encode(bytes: Uint8Array): string {
  const parts: string[] = []
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    parts.push(
      ALPHABET.charAt((n >> 18) & 63) +
        ALPHABET.charAt((n >> 12) & 63) +
        (i + 1 < bytes.length ? ALPHABET.charAt((n >> 6) & 63) : '=') +
        (i + 2 < bytes.length ? ALPHABET.charAt(n & 63) : '='),
    )
  }

  return parts.join('')
}

function ascii(bytes: Uint8Array, at: number) {
  return String.fromCharCode(...bytes.subarray(at, at + 4))
}

export function isWav(bytes: Uint8Array) {
  return bytes.length >= 12 && ascii(bytes, 0) === 'RIFF' && ascii(bytes, 8) === 'WAVE'
}

// SoundPlayer has no volume, so a gain is applied to the samples: 16-bit PCM only,
// clipped to range. Any other WAV plays at its own level.
export function withGain(wav: Uint8Array, gain: number): Uint8Array {
  if (gain === 1 || !isWav(wav)) return wav

  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  let format = 0
  let bits = 0
  for (let o = 12; o + 8 <= wav.length; ) {
    const id = ascii(wav, o)
    const size = view.getUint32(o + 4, true)
    const body = o + 8
    if (id === 'fmt ' && body + 16 <= wav.length) {
      format = view.getUint16(body, true)
      bits = view.getUint16(body + 14, true)
    }
    if (id === 'data') {
      if (format !== 1 || bits !== 16) return wav

      const out = wav.slice()
      const outView = new DataView(out.buffer)
      const end = Math.min(body + size, wav.length) - 1
      for (let s = body; s < end; s += 2) {
        const sample = Math.round(view.getInt16(s, true) * gain)
        outView.setInt16(s, Math.max(-32768, Math.min(32767, sample)), true)
      }

      return out
    }
    o = body + size + (size & 1)
  }

  return wav
}

// A mono 16-bit sine tone, for /theme-sound-test.
export function tone(hz: number, ms: number, rate = 22050): Uint8Array {
  const samples = Math.round((rate * ms) / 1000)
  const out = new Uint8Array(44 + samples * 2)
  const view = new DataView(out.buffer)
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i)
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples * 2, true)
  for (let i = 0; i < samples; i++) {
    view.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 8000), true)
  }

  return out
}
