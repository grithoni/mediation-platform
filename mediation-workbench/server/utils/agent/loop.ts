// ============================================================
// Agent Execution Loop — delegates to extracted GenericAgent-style core
// ============================================================
import { runGaAgentLoop } from '../ga-core/loop'
import { AGENT_TOOLS, TOOL_HANDLERS } from './tools'
import type { ToolCall, AgentMessage, AgentProgress, StepOutcome, ToolDefinition } from './types'

interface AgentLoopOptions {
  systemPrompt: string
  userInput: string
  caseId: string
  workDir: string
  maxTurns?: number
  sessionId?: string
  tools?: ToolDefinition[]
  handlers?: Record<string, (args: Record<string, unknown>, ctx: any) => AsyncGenerator<string, StepOutcome> | Promise<StepOutcome> | StepOutcome>
  llmCall: (
    messages: AgentMessage[],
    tools: ToolDefinition[],
  ) => AsyncGenerator<string, { content: string; toolCalls: ToolCall[] }, unknown>
}

export async function* runAgentLoop(options: AgentLoopOptions): AsyncGenerator<AgentProgress> {
  const {
    systemPrompt,
    userInput,
    caseId,
    workDir,
    maxTurns,
    sessionId,
    tools,
    handlers,
    llmCall,
  } = options

  yield* runGaAgentLoop({
    systemPrompt,
    userInput,
    caseId,
    workDir,
    maxTurns,
    sessionId,
    tools: (tools || AGENT_TOOLS) as any,
    handlers: (handlers || TOOL_HANDLERS) as any,
    llmCall: llmCall as any,
  }) as AsyncGenerator<AgentProgress>
}
