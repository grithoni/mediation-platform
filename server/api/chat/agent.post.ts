// ============================================================
// Agent API Endpoint — SSE streaming agent execution
// POST /api/chat/agent
// ============================================================
import { resolve } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import { getDb } from '../../database'
import { cases, messages, caseDynamicFiles } from '../../database/schema'
import { eq } from 'drizzle-orm'
import { runAgentLoop } from '../../utils/agent/loop'
import { buildSystemPrompt } from '../../utils/agent/system-prompt'
import type { AgentMessage } from '../../utils/agent/types'
import { AGENT_TOOLS } from '../../utils/agent/tools'
import { v4 as uuidv4 } from 'uuid'
import { searchKb, formatKbResultsForPrompt } from '../../utils/kb-search'
import { isEndDialogIntent } from '../../utils/dialog-intent'
import { incrementDialogTurn, endDialog, MAX_DIALOG_TURNS } from '../../utils/dialog-manager'

// ============================================================
// LLM call function — wraps the mimo model API with tool calling
// ============================================================
async function* llmCall(
  messages: AgentMessage[],
  tools: typeof AGENT_TOOLS
): AsyncGenerator<string, { content: string; toolCalls: any[] }> {
  const config = useRuntimeConfig()

  if (!config.openaiApiKey) {
    yield '未配置AI服务，使用模拟响应。'
    return {
      content: '已为您分析了相关材料。由于AI服务未配置，请配置API Key后重试。',
      toolCalls: [],
    }
  }

  // Convert to OpenAI format
  const openaiMessages = messages.map((m) => {
    if (m.role === 'system') return { role: 'system' as const, content: m.content }
    if (m.role === 'assistant') return { role: 'assistant' as const, content: m.content }
    // If user message has tool_results, convert to assistant + tool messages
    if (m.role === 'user') {
      const toolResults = (m as unknown as Record<string, unknown>).tool_results as Array<{ tool_call_id: string; content: string }> | undefined
      if (toolResults && toolResults.length > 0) {
        // Return as tool result messages
        return toolResults.map((tr) => ({
          role: 'tool' as const,
          tool_call_id: tr.tool_call_id,
          content: tr.content,
        }))
      }
      return { role: 'user' as const, content: m.content }
    }
    return { role: 'user' as const, content: m.content }
  }).flat()

  const requestBody: any = {
    model: config.openaiModel || 'mimo-v2.5',
    messages: openaiMessages,
    stream: true,
    temperature: 0.7,
    max_tokens: 4096,
  }

  // Only include tools if the model supports function calling
  // The mimo model may or may not support this
  if (tools.length > 0) {
    requestBody.tools = tools
    requestBody.tool_choice = 'auto'
  }

  const apiKey = config.openaiApiKey
  const baseUrl = config.openaiBaseUrl || 'https://token-plan-cn.xiaomimimo.com/v1'

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      // If tools aren't supported, retry without tools
      if (response.status === 400 && tools.length > 0) {
        delete requestBody.tools
        delete requestBody.tool_choice
        const retryResp = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(requestBody),
        })

        if (retryResp.ok) {
          const retryBody = retryResp.body
          if (!retryBody) throw new Error('No response body')

          const reader = retryBody.getReader()
          const decoder = new TextDecoder()
          let fullContent = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const chunk = decoder.decode(value, { stream: true })
            // Parse SSE chunks
            for (const line of chunk.split('\n')) {
              if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                  const data = JSON.parse(line.slice(6))
                  const delta = data.choices?.[0]?.delta?.content
                  if (delta) {
                    fullContent += delta
                    yield delta
                  }
                } catch {}
              }
            }
          }

          // Parse text-protocol tool calls from fullContent
          const { content: cleanContent, toolCalls } = parseTextProtocolTools(fullContent)
          return { content: cleanContent, toolCalls }
        }
      }

      throw new Error(`API error: ${response.status} ${response.statusText}`)
    }

    const body = response.body
    if (!body) throw new Error('No response body')

    const reader = body.getReader()
    const decoder = new TextDecoder()
    let fullContent = ''
    const toolCallBuffer: Map<number, { id: string; name: string; arguments: string }> = new Map()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.slice(6))
            const choice = data.choices?.[0]

            // Handle text content
            const deltaContent = choice?.delta?.content
            if (deltaContent) {
              fullContent += deltaContent
              yield deltaContent
            }

            // Handle tool calls (native OpenAI format)
            const toolCallsDelta = choice?.delta?.tool_calls
            if (toolCallsDelta) {
              for (const tc of toolCallsDelta) {
                const idx = tc.index ?? 0
                if (!toolCallBuffer.has(idx)) {
                  toolCallBuffer.set(idx, { id: tc.id || '', name: '', arguments: '' })
                }
                const entry = toolCallBuffer.get(idx)!
                if (tc.id) entry.id = tc.id
                if (tc.function?.name) entry.name += tc.function.name
                if (tc.function?.arguments) entry.arguments += tc.function.arguments
              }
            }
          } catch {}
        }
      }
    }

    // Build tool calls from buffer (native format)
    let toolCalls: any[] = []
    if (toolCallBuffer.size > 0) {
      toolCalls = Array.from(toolCallBuffer.values())
        .filter((tc) => tc.name)
        .map((tc) => ({
          toolName: tc.name,
          args: safeJsonParse(tc.arguments),
          id: tc.id,
        }))
    } else {
      // No native tool calls — try text-protocol parsing
      const parsed = parseTextProtocolTools(fullContent)
      toolCalls = parsed.toolCalls
      fullContent = parsed.content
    }

    return { content: fullContent, toolCalls }
  } catch (err: any) {
    console.error('LLM call failed:', err.message)
    // Return a fallback that will let the agent continue
    return {
      content: `⚠️ AI服务暂时不可用: ${err.message}。请稍后重试或检查API配置。`,
      toolCalls: [],
    }
  }
}

// ============================================================
// Text-protocol tool call parser
// Parses format: <tool_use>{"name": "...", "arguments": {...}}</tool_use>
// ============================================================
function parseTextProtocolTools(text: string): {
  content: string
  toolCalls: any[]
} {
  const toolCalls: any[] = []
  let content = text

  // Pattern 1: <tool_use>{"name": "...", "arguments": {...}}</tool_use>
  const toolUseRegex = /<tool_use>\s*(\{[\s\S]*?\})\s*<\/tool_use>/g
  let match: RegExpExecArray | null
  while ((match = toolUseRegex.exec(text)) !== null) {
    try {
      const jsonStr = match[1] || '{}'
      const parsed = JSON.parse(jsonStr)
      toolCalls.push({
        toolName: parsed.name,
        args: parsed.arguments || {},
        id: `text_${toolCalls.length}`,
      })
      content = content.replace(match[0], '')
    } catch {}
  }

  // Pattern 2: <tool_call>{"name": "...", "arguments": {...}}</tool_call>
  const toolCallRegex = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g
  while ((match = toolCallRegex.exec(content)) !== null) {
    try {
      const jsonStr = match[1] || '{}'
      const parsed = JSON.parse(jsonStr)
      toolCalls.push({
        toolName: parsed.name,
        args: parsed.arguments || {},
        id: `text_${toolCalls.length}`,
      })
      content = content.replace(match[0], '')
    } catch {}
  }

  // Pattern 3: Native OpenAI tool_use in text (fallback)
  // ```json \n {...} \n ```
  const jsonBlockRegex = /```json\s*\n([\s\S]*?)\n```/g
  while ((match = jsonBlockRegex.exec(content)) !== null) {
    try {
      const jsonStr = match[1] || '{}'
      const parsed = JSON.parse(jsonStr)
      if (parsed.tool || parsed.name) {
        toolCalls.push({
          toolName: parsed.tool || parsed.name,
          args: parsed.arguments || parsed.parameters || {},
          id: `text_${toolCalls.length}`,
        })
        content = content.replace(match[0], '')
      }
    } catch {}
  }

  return { content: content.trim(), toolCalls }
}

function safeJsonParse(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str)
  } catch {
    return {}
  }
}

// ============================================================
// POST /api/chat/agent
// ============================================================
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { caseId, message, senderIdentifier, senderName, agentMode } = body || {}

  if (!caseId || !message) {
    throw createError({ statusCode: 400, message: '缺少必要参数 (caseId, message)' })
  }

  // Set SSE headers
  setHeader(event, 'Content-Type', 'text/event-stream')
  setHeader(event, 'Cache-Control', 'no-cache')
  setHeader(event, 'Connection', 'keep-alive')

  const sendSSE = (data: any) => `data: ${JSON.stringify(data)}\n\n`
  const encoder = new TextEncoder()

  // ============================================================
  // Server-side intercept: end-dialog triggers
  // Condition 1: keyword match
  // Condition 2: dialog turn >= MAX_DIALOG_TURNS (auto-trigger)
  // ============================================================
  const keywordMatch = isEndDialogIntent(message)
  const dialogTurn = incrementDialogTurn(caseId)
  const turnExceeded = dialogTurn >= MAX_DIALOG_TURNS
  const isEndDialog = keywordMatch || turnExceeded

  if (isEndDialog && caseId !== 'demo') {
    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(sendSSE({ type: 'thinking', turn: 1, content: '结束对话，切换至调解员选择...' })))
          controller.enqueue(encoder.encode(sendSSE({ type: 'tool_call', turn: 1, toolName: 'update_dynamic_file', toolArgs: { dialogEnded: true } })))

          endDialog(caseId)

          controller.enqueue(encoder.encode(sendSSE({ type: 'tool_result', toolName: 'update_dynamic_file', content: '案件已切换至调解员选择阶段', data: '对话已结束，phase = mediator_selection' })))
          const endReason = keywordMatch ? '您已确认结束对话' : '对话轮次已达上限'
          const endContent = keywordMatch
            ? '好的，案件分析已完成。请点击页面上方的"选择调解员"按钮选择调解员。'
            : `对话已进行了${dialogTurn}轮。案件信息已收集充分，请点击页面上方的"选择调解员"按钮选择调解员。`

          controller.enqueue(encoder.encode(sendSSE({ type: 'done', content: endContent, data: { exitReason: 'DIALOG_ENDED', reason: endReason, turns: dialogTurn } })))
          controller.enqueue(encoder.encode(sendSSE({ type: 'finished' })))
          controller.close()
        } catch (err: any) {
          controller.enqueue(encoder.encode(sendSSE({ type: 'error', content: err.message })))
          controller.close()
        }
      },
    })
    return stream
  }

  // Work dir based on case
  const workDir = resolve(process.cwd(), 'uploads', 'cases', caseId)

  // Get case info + phase + dynamic file
  let caseTitle = ''
  let partyAName = '当事人'
  let partyBName = '被申请人'
  let casePhase = 'analysis'
  let dynamicFile: Record<string, any> | undefined

  try {
    const db = getDb()
    const caseData = db.select().from(cases).where(eq(cases.id, caseId)).get()
    if (caseData) {
      caseTitle = caseData.title
      partyAName = caseData.partyAName
      partyBName = caseData.partyBName
      casePhase = caseData.phase || 'analysis'
    }

    // Read dynamic file if exists
    const df = db.select().from(caseDynamicFiles).where(eq(caseDynamicFiles.caseId, caseId)).get()
    if (df) {
      dynamicFile = {
        partyAnalysis: df.partyAnalysis,
        timeline: df.timeline,
        disputeChecklist: df.disputeChecklist,
        positions: df.positions,
        potentialInterests: df.potentialInterests,
        batna: df.batna,
        agentLog: df.agentLog,
        dialogTurnCount: df.dialogTurnCount,
        dialogEnded: df.dialogEnded,
      }
    }
  } catch (err) {
    console.error('[Agent] Failed to load case data:', err)
  }
  let systemPrompt = buildSystemPrompt({
    caseId,
    caseTitle,
    partyAName,
    partyBName,
    workDir,
    phase: casePhase,
    dynamicFile,
  })

  // ── RAG: Inject relevant legal provisions from KB ──────
  try {
    const kbResults = await searchKb(message, 3)
    if (kbResults.length > 0) {
      systemPrompt += formatKbResultsForPrompt(kbResults)
      console.log(`[RAG] Agent: Injected ${kbResults.length} KB results for: "${message.slice(0, 50)}"`)
    }
  } catch {}

  let userInput = message
  if (caseId !== 'demo') {
    userInput = `案件 ${caseId}（${caseTitle}）的当事人 ${senderName || senderIdentifier} 发来消息：
    
${message}

请作为调解智能体协助处理此案件。你可以：
1. 读取案件文件 (uploads/cases/${caseId}/) 了解案情
2. 搜索法律知识分析争议焦点
3. 通过 ask_user 与当事人沟通
4. 生成调解建议或方案`
  }

  // Save the user message to DB
  try {
    const db = getDb()
    const msgId = uuidv4()
    db.insert(messages)
      .values({
        id: msgId,
        caseId,
        senderType: 'party',
        senderId: senderIdentifier || 'unknown',
        senderName: senderName || senderIdentifier || '当事人',
        content: message,
        visibility: 'private',
      })
      .run()
  } catch (err) {
    console.error('[Agent] Failed to save user message:', err)
  }
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const agentGen = runAgentLoop({
          systemPrompt,
          userInput,
          caseId,
          workDir,
          maxTurns: agentMode === 'autonomous' ? 20 : 5,
          sessionId: `ag-${caseId}-${Date.now()}`,
          llmCall,
        })

        for await (const progress of agentGen) {
          controller.enqueue(encoder.encode(sendSSE(progress)))

          // Save AI text messages
          if (progress.type === 'done' && progress.content) {
            try {
              const db = getDb()
              const aiMsgId = uuidv4()
              db.insert(messages)
                .values({
                  id: aiMsgId,
                  caseId,
                  senderType: 'ai',
                  senderId: 'agent',
                  senderName: '调解智能体',
                  content: progress.content,
                  visibility: 'private',
                })
                .run()
            } catch (err) {
              console.error('[Agent] Failed to save AI message:', err)
            }
          }

          // If agent asked user a question, stop here
          if (progress.type === 'done' && (progress.data as { exitReason?: string } | undefined)?.exitReason === 'ASK_USER') {
            break
          }
        }

        controller.enqueue(encoder.encode(sendSSE({ type: 'finished' })))
        controller.close()
      } catch (err: any) {
        controller.enqueue(
          encoder.encode(sendSSE({ type: 'error', content: `Agent error: ${err.message}` }))
        )
        controller.close()
      }
    },
  })

  return stream
})
