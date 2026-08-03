// ============================================================
// server/api/public/chat.post.ts
// 官方门户智能咨询 — 替代 ai-consulting(3005) POST /api/chat
//
// 契约（与 3005 保持一致，官方门户 ChatWidget 依赖）：
//   Body: { "messages": [{ "role": "user"|"assistant", "content": "..." }] }
//   Response: SSE 流
//     data: {"content": "token"}\n\n
//     ...
//     data: [DONE]\n\n
//
// 实现：
//   - RAG：以最后一条 user 消息 searchKb(topK=4)，格式化为【参考资料】注入 system
//   - history 取最近 12 条 messages
//   - nanobotChatStream({ system, prompt, history, temperature: 0.3 }) 流式输出
//   - 异常时输出与 3005 相同的固定错误文案
// ============================================================
import { searchKb } from '../../utils/kb-search'
import { nanobotChatStream } from '../../utils/nanobot'

// 系统提示词 — 原文复制自 ai-consulting/app/main.py (59-73 行)
const SYSTEM_PROMPT = `你是「珠江国际商事调解院」官方网站的智能咨询助手，负责解答来访者的业务咨询。

【你的职责范围】
- 商事调解：申请条件、办理流程、费用标准、调解协议效力等
- 中立评估（ENE）：评估流程、适用场景、评估意见用途等
- 争议评审（DRB）：建设工程争议评审的机制和流程
- 商事咨询与培训课程：服务内容、报名方式等
- 机构信息：性质、地址、联系方式等

【回答要求】
1. 优先依据下方提供的「参考资料」作答，不要编造资料中没有的数字、费用、期限等信息。
2. 回答使用简体中文，语气专业、亲切、简洁，可适当使用条目化排版。
3. 如果问题超出你的职责范围（例如要求代理案件、出具法律意见书），请礼貌说明本院无法提供该服务，并建议用户拨打 020-83288530 或发送邮件至 contact@zjmediation.org 与工作人员联系。
4. 涉及具体案件分析时，可以给出一般性说明，但须提示最终以与调解院工作人员的正式沟通为准。
5. 不要在回答中提及「参考资料」「知识库」等内部实现细节。`

// 3005 同款异常 fallback 文案
const FALLBACK_ERROR = '抱歉，智能咨询服务暂时不可用。请稍后重试，或拨打 020-83288530 与我们联系。'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const messages = Array.isArray(body?.messages) ? body.messages : []

  if (messages.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'messages 不能为空' })
  }

  // 最后一条 user 消息 → RAG 检索（topK=4）
  const lastUser = [...messages].reverse().find((m: any) => m?.role === 'user')
  const lastUserContent = typeof lastUser?.content === 'string' ? lastUser.content : ''

  let system = SYSTEM_PROMPT
  if (lastUserContent.trim()) {
    try {
      const contexts = await searchKb(lastUserContent, 4)
      if (contexts.length > 0) {
        const ctxText = contexts
          .map((c, i) => `〖资料 ${i + 1}〗\n${c.content}`)
          .join('\n\n')
        system += `\n\n【参考资料】\n${ctxText}`
      }
    } catch {
      // KB 不可用时静默降级（searchKb 内部已有降级逻辑）
    }
  }

  // 只保留最近 12 条对话，控制 token 消耗
  // 显式标注类型，避免 messages(any[]) 上的链式调用使结果退化为 any
  const recent: Array<{ role: 'user' | 'assistant'; content: string }> = messages
    .slice(-12)
    .filter(
      (m: any) =>
        (m?.role === 'user' || m?.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim(),
    )
    .map((m: any) => ({ role: m.role, content: m.content }))

  // 最后一条 user 消息作为 prompt（不重复出现在 history 中）
  let prompt = lastUserContent
  let history = recent
  const lastUserIdx = recent.map((m) => m.role).lastIndexOf('user')
  if (lastUserIdx >= 0) {
    prompt = recent[lastUserIdx]!.content
    history = recent.slice(0, lastUserIdx)
  }

  setHeader(event, 'Content-Type', 'text/event-stream')
  setHeader(event, 'Cache-Control', 'no-cache')
  setHeader(event, 'X-Accel-Buffering', 'no')

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const delta of nanobotChatStream({
          system,
          prompt,
          history,
          temperature: 0.3,
        })) {
          const payload = JSON.stringify({ content: delta })
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
        }
      } catch (e) {
        console.error('[public/chat] nanobot 调用失败:', e)
        const payload = JSON.stringify({ content: FALLBACK_ERROR })
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })

  return stream
})
