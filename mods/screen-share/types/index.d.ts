// What a scan found: people's names to mask, as they appear in the conversation.
export type ScreenShareNames = string[]

declare module 'claude-code' {
  interface PluginState {
    'screen-share': {
      isOn: boolean
      names: Shaped<ScreenShareNames>
    }
  }
}
