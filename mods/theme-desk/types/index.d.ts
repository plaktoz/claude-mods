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

// What the strip and the desk show for the chat's main turn.
export type Beat = 'idle' | 'working' | 'complete' | 'aborted' | 'error'

declare module 'claude-code' {
  interface PluginState {
    'theme-desk': {
      agents: Shaped<Record<string, Agent>>
      order: string[]
      beat: Beat
      isWorking: boolean
      isDonePending: boolean
      turnStart: number
      turnEnd: number
      cost: number
      now: number
      frame: number
      isHidden: boolean
      log: Shaped<string[]>
    }
  }
}
