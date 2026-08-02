// ============================================================
// Agent API Endpoint — SSE streaming agent execution
// POST /api/chat/agent
// 引擎：nanobot（OpenAI 兼容 API，单条 user message 拼接）
// ============================================================
import { resolve } from 'node:path'
import { getDb } from '../../database'
import { cases, messages, caseDynamicFiles } from '../../database/schema'
import { eq } from 'drizzle-orm'
import { buildSystemPrompt } from '../../utils/agent/system-prompt'
import { v4 as uuidv4 } from 'uuid'
import { searchKb, formatKbResultsForPrompt } from '../../utils/kb-search'
import { isEndDialogIntent } from '../../utils/dialog-intent'
import { incrementDialogTurn, endDialog, MAX_DIALOG_TURNS } from '../../utils/dialog-manager'
import { nanobotChatStream } from '../../utils/nanobot'

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

  // nanobot 引擎没有工作台的自定义工具，直接基于上下文回答
  systemPrompt += `
## 重要提示
当前由 nanobot 引擎驱动。你**不需要调用任何工具**（也没有可用工具），直接基于以上案件信息和法律依据给出完整、结构化、专业的中文回答。不要提及工具或"调用功能"。

`

  let userInput = message
  if (caseId !== 'demo') {
    userInput = `案件 ${caseId}（${caseTitle}）的当事人 ${senderName || senderIdentifier} 发来消息：
    
${message}

请作为调解智能体协助处理此案件，直接给出专业、温和、可执行的分析与建议。`
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
        let fullContent = ''
        for await (const delta of nanobotChatStream({
          system: systemPrompt,
          prompt: userInput,
          temperature: 0.7,
          maxTokens: 4096,
        })) {
          fullContent += delta
          controller.enqueue(encoder.encode(sendSSE({ type: 'text', content: delta })))
        }

        // Fallback if agent returned empty content
        let aiContent = fullContent
        if (!aiContent) {
          aiContent = agentMode === 'autonomous'
            ? '已为您完成分析。'
            : '已为您分析了相关材料。请补充更多信息以便继续。'
        }

        // Save AI text message
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
              content: aiContent,
              visibility: 'private',
            })
            .run()
        } catch (err) {
          console.error('[Agent] Failed to save AI message:', err)
        }

        controller.enqueue(encoder.encode(sendSSE({ type: 'done', content: aiContent, data: { exitReason: 'TASK_DONE' } })))
        controller.enqueue(encoder.encode(sendSSE({ type: 'finished' })))
        controller.close()
      } catch (err: any) {
        console.error('[Agent] nanobot stream error:', err)
        controller.enqueue(
          encoder.encode(sendSSE({ type: 'error', content: `Agent error: ${err.message}` }))
        )
        controller.close()
      }
    },
  })

  return stream
})
