// One subagent of this chat, from its SubagentStart until its SubagentStop.
export type Agent = {
  type: string
  status: 'running' | 'done'
  startedAt: number
  endedAt: number | null
  // Model requests the agent has made so far: its turn.step count.
  steps: number
  // The latest request's whole context (input, output and cache). Not a running sum.
  tokens: number
  model: string
  // The last two tool names the agent called.
  activity: string[]
}

// A running agent as the strip draws it: one companion each, in join order.
// `slot` is its colour: the lowest one free when it joined, kept until it stops.
export type Crew = { id: string; at: number; slot: number }

// Where the strip is mounted: the band's requestId and the Raster's size, as the last render drew it.
export type Band = { id: string; columns: number; rows: number }

// What the strip shows for the chat's main turn. Only `working` and `complete` draw a lead.
export type Beat = 'idle' | 'working' | 'complete' | 'aborted' | 'error'

declare module 'claude-code' {
  interface PluginState {
    'theme-cli': {
      agents: Shaped<Record<string, Agent>>
      crew: Shaped<Crew[]>
      beat: Beat
      isWorking: boolean
      turnStart: number
      turnEnd: number
      finaleStart: number
      cost: number
      isHidden: boolean
      band: Band | null
      // The theme on show; the band redraws when a switch changes it.
      themeName: string
      log: Shaped<string[]>
    }
  }
}
