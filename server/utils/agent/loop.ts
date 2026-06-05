// ============================================================
// Agent Execution Loop — Multi-turn autonomous agent
// Ported from GenericAgent agent_loop.py (agent_runner_loop)
// ============================================================
import type { ToolCall, AgentMessage, AgentProgress, StepOutcome } from './types'
import { AGENT_TOOLS, TOOL_HANDLERS } from './tools'
import { buildMemoryContext, setWorkingCheckpoint } from './memory'

interface AgentLoopOptions {
  systemPrompt: string
  userInput: string
  caseId: string
  workDir: string
  maxTurns?: number
  sessionId?: string
  llmCall: (
    messages: AgentMessage[],
    tools: typeof AGENT_TOOLS
  ) => AsyncGenerator<string, { content: string; toolCalls: ToolCall[] }, unknown>
}

type LLMResult = { content: string; toolCalls: ToolCall[] }

/**
 * Run the autonomous agent execution loop.
 * Yields AgentProgress events for streaming to frontend.
 */
export async function* runAgentLoop(options: AgentLoopOptions): AsyncGenerator<AgentProgress> {
  const {
    systemPrompt,
    userInput,
    caseId,
    workDir,
    maxTurns = 40,
    sessionId = `agent-${caseId}-${Date.now()}`,
    llmCall,
  } = options

  let checkpoint = ''

  const messages: AgentMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userInput },
  ]

  let turn = 0
  let fullResponse = ''
  let exitReason: string | null = null

  while (turn < maxTurns) {
    turn++

    yield { type: 'thinking', turn, content: `思考中... (第 ${turn} 轮)` }

    // Inject working checkpoint into system prompt each turn
    const memoryContext = buildMemoryContext(sessionId)
    if (memoryContext && messages[0]) {
      messages[0].content = systemPrompt + '\n' + memoryContext
    }

    // Call LLM
    let llmContent = ''
    let toolCalls: ToolCall[] = []

    try {
      const gen = llmCall(messages, AGENT_TOOLS)

      // Manual iteration to properly type the return value
      const iterResult = await advanceGenerator<LLMResult>(gen)

      llmContent = iterResult.content
      toolCalls = iterResult.toolCalls
    } catch (err: any) {
      yield { type: 'error', content: `LLM 调用失败: ${err.message}` }
      exitReason = `LLM_ERROR: ${err.message}`
      break
    }

    if (llmContent) {
      fullResponse += llmContent
    }

    // If no tool calls, task is complete
    if (toolCalls.length === 0) {
      exitReason = 'TASK_DONE'
      break
    }

    // Process tool calls
    const toolResults: Array<{ tool_call_id: string; content: string }> = []
    const nextPrompts: string[] = []

    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i]!
      const { toolName, args, id } = tc

      const handler = TOOL_HANDLERS[toolName]
      if (!handler) {
        yield {
          type: 'error',
          content: `未知工具: ${toolName}`,
          toolName,
          toolArgs: args,
        }
        nextPrompts.push(`未知工具 ${toolName}，请使用可用工具列表中的工具。`)
        continue
      }

      yield {
        type: 'tool_call',
        turn,
        toolName,
        toolArgs: args,
      }

      const ctx = {
        caseId,
        workDir,
        maxTurns,
        currentTurn: turn,
        workingCheckpoint: checkpoint,
        fullResponse,
        stopRequested: false,
      }

      let outcome: StepOutcome
      try {
        const handlerGen = handler(args, ctx)
        outcome = await exhaustGenerator(handlerGen)
      } catch (err: any) {
        outcome = {
          data: `工具执行错误: ${err.message}`,
          nextPrompt: `工具 ${toolName} 执行失败 (${err.message})。请检查参数或尝试其他方式。`,
        }
      }

      // Update working checkpoint from handler side effects
      if (ctx.workingCheckpoint !== checkpoint) {
        checkpoint = ctx.workingCheckpoint
        setWorkingCheckpoint(sessionId, checkpoint)
      }

      // Yield tool result
      const dataStr =
        typeof outcome.data === 'object' && outcome.data !== null
          ? JSON.stringify(outcome.data, null, 2)
          : String(outcome.data)

      yield {
        type: 'tool_result',
        toolName,
        content: dataStr,
        data: outcome.data,
      }

      // Track tool result for LLM
      if (id) {
        toolResults.push({
          tool_call_id: id,
          content: dataStr,
        })
      }

      // Handle exit conditions
      if (outcome.shouldExit) {
        exitReason = 'ASK_USER'
        yield {
          type: 'done',
          content: outcome.nextPrompt || '',
          data: {
            exitReason: 'ASK_USER',
            question: outcome.data,
          },
        }
        return
      }

      if (!outcome.nextPrompt) {
        exitReason = 'CURRENT_TASK_DONE'
        break
      }

      nextPrompts.push(outcome.nextPrompt)
    }

    if (exitReason) {
      break
    }

    // Build next user message with tool results
    let nextContent = nextPrompts.length > 0 ? nextPrompts.join('\n') : '请继续执行任务。'

    // ============================================================
    // Turn escalation warnings (ported from GenericAgent ga.py)
    // ============================================================
    if (turn >= 7 && turn % 7 === 0) {
      nextContent += `\n\n[DANGER] 已连续执行第 ${turn} 轮。禁止无效重试。若无有效进展，必须切换策略：1. 探测物理边界 2. 请求用户协助。如有需要，可调用 update_working_checkpoint 保存关键上下文。`
    }
    if (turn >= 30 && turn % 10 === 0) {
      nextContent += `\n\n[DANGER] 已接近最大轮次 (${maxTurns})。必须总结当前进展，调用 ask_user 向用户汇报并确认是否继续。`
    }
    if (turn >= 15 && exitReason === null && turn % 3 === 0) {
      nextContent += `\n\n[HINT] 长任务进行中 (${turn} 轮)。如发现值得长期记忆的信息（避坑经验、环境配置），可调用 start_long_term_update。`
    }

    const nextMessage: AgentMessage = {
      role: 'user',
      content: nextContent,
    }

    // Attach tool results if using native tool calling
    if (toolResults.length > 0) {
      ;(nextMessage as any).tool_results = toolResults
    }

    messages.push(nextMessage)
  }

  if (!exitReason) {
    exitReason = 'MAX_TURNS_EXCEEDED'
  }

  yield {
    type: 'done',
    content: fullResponse,
    data: { exitReason, turns: turn, workingCheckpoint: checkpoint },
  }
}

// ============================================================
// Generator helpers
// ============================================================

/** Advance an async generator to completion, yielding all intermediate values */
async function exhaustGenerator<T, R>(
  gen: AsyncGenerator<T, R, unknown>
): Promise<R> {
  let result: IteratorResult<T, R>
  do {
    result = await gen.next()
  } while (!result.done)
  return result.value as R
}

/** Advance an async generator, yielding ONLY the final return value */
async function advanceGenerator<R>(
  gen: AsyncGenerator<string, R, unknown>
): Promise<R> {
  let result: IteratorResult<string, R>
  do {
    result = await gen.next()
  } while (!result.done)
  return result.value as R
}

