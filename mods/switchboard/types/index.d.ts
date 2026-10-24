// One installed plugin as `claude plugin list --json` reports it.
export type SwitchboardRow = {
  id: string
  name: string
  marketplace: string
  version: string
  scope: string
  isEnabled: boolean
}

declare module 'claude-code' {
  interface PluginState {
    switchboard: {
      rows: Shaped<SwitchboardRow[]>
      // A one-line result of the last toggle; '' for none.
      note: string
    }
  }
}
