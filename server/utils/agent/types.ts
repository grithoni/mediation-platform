// ============================================================
// Agent system type definitions
// Ported from GenericAgent (Python) → TypeScript
// ============================================================

/** A single tool definition in OpenAI function-calling format */
export interface ToolDefinition {
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

/** Arguments passed to a tool handler */
export interface ToolArgs {
  [key: string]: unknown
  _index?: number
  _toolNum?: number
}

/** Result of executing a single tool */
export interface StepOutcome {
  /** The data to pass back to the LLM */
  data: unknown
  /** Prompt to inject for the next turn (null/empty = task complete) */
  nextPrompt?: string | null
  /** Force exit the agent loop */
  shouldExit?: boolean
}

/** A tool call from the LLM response */
export interface ToolCall {
  toolName: string
  args: ToolArgs
  id?: string
}

/** A message in the agent conversation */
export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  name?: string
}

/** Progress event yielded during agent execution */
export interface AgentProgress {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'text' | 'done' | 'error'
  turn?: number
  content?: string
  toolName?: string
  toolArgs?: Record<string, unknown>
  toolResult?: string
  data?: unknown
}

/** The handler's context during agent execution */
export interface AgentContext {
  /** Current case ID */
  caseId: string
  /** Current working directory for file operations */
  workDir: string
  /** Max turns before forced stop */
  maxTurns: number
  /** Current turn number */
  currentTurn: number
  /** Working checkpoint (short-term memory notepad) */
  workingCheckpoint: string
  /** Accumulated text output from the agent */
  fullResponse: string
  /** Whether the agent should stop */
  stopRequested: boolean
}

/** LLM client interface (abstracted for different backends) */
export interface LLMClient {
  chat(params: {
    messages: AgentMessage[]
    tools: ToolDefinition[]
  }): AsyncGenerator<string, LLMResponse, unknown>
}

/** Parsed LLM response */
export interface LLMResponse {
  content: string
  toolCalls: ToolCall[]
  finishReason: string
}

/** Convert OpenAI-style tool call to internal format */
export interface OpenAIToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface OpenAIResponse {
  id: string
  object: string
  choices: {
    index: number
    message: {
      role: string
      content: string | null
      tool_calls?: OpenAIToolCall[]
    }
    finish_reason: string
    delta?: {
      content?: string
      tool_calls?: {
        index: number
        id?: string
        type?: 'function'
        function?: {
          name?: string
          arguments?: string
        }
      }[]
    }
  }[]
}
