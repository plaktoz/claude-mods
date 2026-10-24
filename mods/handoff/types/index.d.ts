export type Inventory = {
  goal: string | null
  read: string[]
  edited: string[]
  urls: string[]
  skills: string[]
  tools: Record<string, number>
}

// Why a handoff is waiting to be offered at the next prompt.
export type Pending = 'tokens' | null

declare module 'claude-code' {
  interface PluginState {
    handoff: {
      inventory: Shaped<Inventory>
      pending: Pending
      lastTurnEnd: number | null
      hasOfferedTokens: boolean
    }
  }
}
