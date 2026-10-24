// What the last reply left in the prompt cache, and what keeping it warm has spent.
export type Cache = {
  // When the cache lapses, in $.clock.now() milliseconds; 0 when there is none.
  expiresAt: number
  // The context the cache holds, in tokens.
  tokens: number
  // Pings sent since the last reply.
  pings: number
  isPinging: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'cache-warm': {
      cache: Shaped<Cache>
      // False once the person has stopped keeping warm.
      isOn: boolean
      // The clock as of the last tick: the band redraws from it.
      now: number
    }
  }
}
