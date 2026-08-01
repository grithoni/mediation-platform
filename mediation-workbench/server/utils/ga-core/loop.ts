import { buildMemoryContext, setWorkingCheckpoint } from '../agent/memory'
import type {
  GaContext,
  GaMessage,
  GaProgress,
  GaStepOutcome,
  GaToolCall,
  GaToolDefinition,
  GaToolHandler,
} from './types'

interface RunGaAgentLoopOptions {
  systemPrompt: string
  userInput: string
  caseId: string
  workDir: string
  tools: GaToolDefinition[]
  handlers: Record<string, GaToolHandler>
  maxTurns?: number
  sessionId?: string
  llmCall: (
    messages: GaMessage[],
    tools: GaToolDefinition[],
  ) => AsyncGenerator<string, { content: string; toolCalls: GaToolCall[] }, unknown>
}

type LlmResult = { content: string; toolCalls: GaToolCall[] }

export function normalizeGaToolCalls(toolCalls: GaToolCall[] | undefined | null): GaToolCall[] {
  return Array.isArray(toolCalls)
    ? toolCalls.filter(call => !!call?.toolName).map((call, index) => ({
      toolName: call.toolName,
      args: call.args || {},
      id: call.id || `ga_${index}`,
    }))
    : []
}

export async function* runGaAgentLoop(options: RunGaAgentLoopOptions): AsyncGenerator<GaProgress> {
  const {
    systemPrompt,
    userInput,
    caseId,
    workDir,
    tools,
    handlers,
    maxTurns = 40,
    sessionId = `ga-${caseId}-${Date.now()}`,
    llmCall,
  } = options

  const messages: GaMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userInput },
  ]

  let checkpoint = ''
  let turn = 0
  let fullResponse = ''
  let exitReason: string | null = null
  let consecutiveToolTurns = 0
  const MAX_CONSECUTIVE_TOOL_TURNS = 3

  while (turn < maxTurns) {
    turn += 1
    yield { type: 'thinking', turn, content: `思考中... (第 ${turn} 轮)` }

    const memoryContext = buildMemoryContext(sessionId)
    if (memoryContext && messages[0]) {
      messages[0].content = `${systemPrompt}\n${memoryContext}`
    }

    const effectiveTools = consecutiveToolTurns >= MAX_CONSECUTIVE_TOOL_TURNS ? [] : tools
    let llmContent = ''
    let toolCalls: GaToolCall[] = []

    try {
      const gen = llmCall(messages, effectiveTools)
      let iterResult = await gen.next()
      while (!iterResult.done) {
        const token = iterResult.value as string
        if (token) {
          fullResponse += token
          yield { type: 'text', content: token }
        }
        iterResult = await gen.next()
      }
      const llmResult = iterResult.value as LlmResult
      llmContent = llmResult.content || ''
      toolCalls = effectiveTools.length > 0 ? normalizeGaToolCalls(llmResult.toolCalls) : []
    } catch (error: any) {
      yield { type: 'error', content: `LLM 调用失败: ${error.message}` }
      exitReason = `LLM_ERROR: ${error.message}`
      break
    }

    if (llmContent && llmContent.length > fullResponse.length) {
      fullResponse = llmContent
    }

    if (toolCalls.length === 0) {
      exitReason = 'TASK_DONE'
      break
    }

    if (!llmContent && toolCalls.length > 0) {
      consecutiveToolTurns += 1
    } else {
      consecutiveToolTurns = 0
    }

    const toolResults: Array<{ tool_call_id: string; content: string }> = []
    const nextPrompts: string[] = []

    for (const toolCall of toolCalls) {
      const handler = handlers[toolCall.toolName]
      if (!handler) {
        yield { type: 'error', content: `未知工具: ${toolCall.toolName}`, toolName: toolCall.toolName, toolArgs: toolCall.args }
        nextPrompts.push(`未知工具 ${toolCall.toolName}，请使用可用工具列表中的工具。`)
        continue
      }

      yield { type: 'tool_call', turn, toolName: toolCall.toolName, toolArgs: toolCall.args }

      const ctx: GaContext = {
        caseId,
        workDir,
        maxTurns,
        currentTurn: turn,
        workingCheckpoint: checkpoint,
        fullResponse,
        stopRequested: false,
      }

      let outcome: GaStepOutcome
      try {
        outcome = await exhaustGenerator(handler(toolCall.args, ctx))
      } catch (error: any) {
        outcome = {
          data: `工具执行错误: ${error.message}`,
          nextPrompt: `工具 ${toolCall.toolName} 执行失败 (${error.message})。请检查参数或尝试其他方式。`,
        }
      }

      if (ctx.workingCheckpoint !== checkpoint) {
        checkpoint = ctx.workingCheckpoint
        setWorkingCheckpoint(sessionId, checkpoint)
      }

      const dataStr = typeof outcome.data === 'object' && outcome.data !== null
        ? JSON.stringify(outcome.data, null, 2)
        : String(outcome.data)

      yield { type: 'tool_result', toolName: toolCall.toolName, content: dataStr, data: outcome.data }

      if (toolCall.id) {
        toolResults.push({ tool_call_id: toolCall.id, content: dataStr })
      }

      if (outcome.shouldExit) {
        exitReason = 'ASK_USER'
        yield {
          type: 'done',
          content: outcome.nextPrompt || '',
          data: { exitReason: 'ASK_USER', question: outcome.data },
        }
        return
      }

      if (!outcome.nextPrompt) {
        exitReason = 'CURRENT_TASK_DONE'
      } else {
        nextPrompts.push(outcome.nextPrompt)
      }
    }

    if (exitReason) break

    let nextContent = nextPrompts.length > 0 ? nextPrompts.join('\n') : '请继续执行任务。'
    if (consecutiveToolTurns >= MAX_CONSECUTIVE_TOOL_TURNS) {
      nextContent += `\n\n[HINT] 您已连续${consecutiveToolTurns}轮仅使用工具未生成文字回复。请基于已收集的信息直接生成完整的文字回复给用户，不要再调用工具。`
    }
    if (turn >= 7 && turn % 7 === 0) {
      nextContent += `\n\n[DANGER] 已连续执行第 ${turn} 轮。禁止无效重试，必要时调用 ask_user。`
    }
    if (turn >= 30 && turn % 10 === 0) {
      nextContent += `\n\n[DANGER] 已接近最大轮次 (${maxTurns})。请总结进展，并准备请求用户确认。`
    }

    const nextMessage: GaMessage = { role: 'user', content: nextContent }
    if (toolResults.length > 0) {
      ;(nextMessage as unknown as { tool_results?: Array<{ tool_call_id: string; content: string }> }).tool_results = toolResults
    }
    messages.push(nextMessage)
  }

  yield {
    type: 'done',
    content: fullResponse,
    data: {
      exitReason: exitReason || 'MAX_TURNS_EXCEEDED',
      turns: turn,
      workingCheckpoint: checkpoint,
    },
  }
}

async function exhaustGenerator<T>(value: AsyncGenerator<string, T> | Promise<T> | T): Promise<T> {
  if (value && typeof (value as AsyncGenerator<string, T>).next === 'function') {
    const gen = value as AsyncGenerator<string, T>
    let iterResult = await gen.next()
    while (!iterResult.done) {
      iterResult = await gen.next()
    }
    return iterResult.value
  }
  return await Promise.resolve(value as T)
}
