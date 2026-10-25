// Typed prompts that had a cue word, kept until the turn ends.
export type Pending = string[]

declare module 'claude-code' {
  interface PluginState {
    reflect: {
      pending: Pending
      // Rules already offered or saved in this session, lowercased.
      handled: string[]
    }
  }
}
