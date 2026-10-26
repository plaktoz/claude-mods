import type { EngineInterface, On } from 'claude-code'
import { decode, encode, isWav, tone, withGain } from './wav'

// The engine's $.audio.play has no player on Windows (its doc: "a Linux or Windows terminal,
// having no player, plays nothing") and resolves as if it played. theme-cli's cues are answered
// here with PowerShell's SoundPlayer. A clip it can't play (not a WAV, an asset or a URL, not
// Windows) goes on to the engine.
//
// Remove this file, and the call in register.tsx, once the engine ships a Windows player.

const WAV_MIME = /^audio\/(wav|wave|x-wav|vnd\.wave)$/i

// Both read the clip as base64 on stdin. The loop plays until the child is killed.
const READ = '$ErrorActionPreference="Stop";$b=[Convert]::FromBase64String([Console]::In.ReadToEnd());$p=New-Object System.Media.SoundPlayer (New-Object System.IO.MemoryStream (,$b));'
const PLAY_ONCE = `${READ}$p.PlaySync()`
const PLAY_LOOP = `${READ}$p.PlayLooping();[System.Threading.Thread]::Sleep(-1)`

// The looped clips now playing, each with the stop that ends it. The engine does not pass a
// plugin's own signal to a hook, so theme-cli ends its loop through `stopWindowsLoops()`.
const loops = new Set<AbortController>()

export function stopWindowsLoops() {
  for (const stop of loops) stop.abort()
  loops.clear()
}

// Resolves when the clip has played, or once it is stopped by `signal` or by `stopWindowsLoops()`.
// A stop ends the wait at once and asks the child to end. Rejects with PowerShell's error when it
// could not play.
export async function playWav($: EngineInterface, wav: Uint8Array, shouldLoop: boolean, signal: AbortSignal) {
  const child = $.process.spawn({
    argv: ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', shouldLoop ? PLAY_LOOP : PLAY_ONCE],
    input: encode(wav),
  })
  const stop = new AbortController()
  const stopped = new Promise<'stopped'>(done => stop.signal.addEventListener('abort', () => done('stopped'), { once: true }))
  if (signal.aborted) stop.abort()
  else signal.addEventListener('abort', () => stop.abort(), { once: true })
  if (shouldLoop) loops.add(stop)

  const ended = (async () => {
    let stderr = ''
    for await (const piece of child) if (piece.stream === 'stderr') stderr += piece.text
    const { code } = await child.result

    return { code, stderr }
  })()

  try {
    const outcome = await Promise.race([ended, stopped])
    if (outcome === 'stopped') {
      // The child is asked to end. Its own result no longer matters.
      ended.catch(() => {})
      void child.return(undefined as never).catch(() => {})

      return
    }
    if (outcome.code !== 0) throw new Error(`powershell exited ${outcome.code}: ${outcome.stderr.trim().split('\n')[0] ?? ''}`)
  } finally {
    loops.delete(stop)
  }
}

// Whether this is Windows. Read once, at session.start: reading it for every clip would add an
// engine call before each cue.
let windows = false

export async function readPlatform($: EngineInterface) {
  windows = (await $.env.get('OS')) === 'Windows_NT'

  return windows
}

// Adds the Windows player to theme-cli's hooks. Called from `register`, so the mod keeps one
// hooks module.
export function winAudio(on: On) {
  on('audio.play', async ($, e, next) => {
    const { clip } = e
    if (!windows || clip.base64 === undefined || !WAV_MIME.test(clip.mime)) return next(e)

    const wav = decode(clip.base64)
    if (!isWav(wav)) return next(e)

    // A clip that cannot play is refused with its cause. A thrown error would be skipped, and the
    // engine's own (silent) player would then answer the call as if it had played.
    try {
      await playWav($, withGain(wav, e.gain ?? 1), e.shouldLoop, next.signal)
    } catch (error) {
      return { deny: `${$.plugin.name}: ${String(error)}` }
    }

    return { value: undefined }
  })
}
