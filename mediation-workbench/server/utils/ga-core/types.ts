export interface GaToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, {
        type: string
        description?: string
        enum?: string[]
        default?: unknown
        items?: { type: string }
      }>
      required?: string[]
    }
  }
}

export interface GaToolArgs {
  [key: string]: unknown
  _index?: number
  _toolNum?: number
}

export interface GaStepOutcome {
  data: unknown
  nextPrompt?: string | null
  shouldExit?: boolean
}

export interface GaToolCall {
  toolName: string
  args: GaToolArgs
  id?: string
}

export interface GaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  name?: string
}

export interface GaProgress {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'text' | 'done' | 'error'
  turn?: number
  content?: string
  toolName?: string
  toolArgs?: Record<string, unknown>
  data?: unknown
}

export interface GaContext {
  caseId: string
  workDir: string
  maxTurns: number
  currentTurn: number
  workingCheckpoint: string
  fullResponse: string
  stopRequested: boolean
}

export type GaToolHandler = (
  args: GaToolArgs,
  ctx: GaContext,
) => AsyncGenerator<string, GaStepOutcome> | Promise<GaStepOutcome> | GaStepOutcome
