// ============================================================
// server/utils/nanobot.ts
// 统一 nanobot AI 引擎客户端 — OpenAI 兼容 API 封装
// 说明：nanobot /v1/chat/completions 只接受单条 user message，
//       因此把 system + history + prompt 拼接为单条消息发送；
//       每次调用使用唯一 session_id，不依赖 nanobot 隐式记忆。
// ============================================================

export interface NanobotMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface NanobotChatOptions {
  system?: string
  prompt: string
  history?: NanobotMessage[]
  temperature?: number
  maxTokens?: number
}

function getNanobotConfig() {
  const config = useRuntimeConfig()
  const baseUrl = (config.nanobotBaseUrl as string) || 'http://127.0.0.1:8900/v1'
  const model = (config.nanobotModel as string) || 'deepseek-v4-flash'
  return { baseUrl, model }
}

/** 拼接 system + history + prompt 为单条 user message */
function buildUserContent(opts: NanobotChatOptions): string {
  const parts: string[] = []
  if (opts.system) parts.push(`【系统指令】\n${opts.system}`)
  if (opts.history && opts.history.length > 0) {
    const historyText = opts.history
      .map((m) => `${m.role === 'assistant' ? '助手' : '用户'}：${m.content}`)
      .join('\n')
    parts.push(`【历史对话】\n${historyText}`)
  }
  parts.push(`【当前问题】\n${opts.prompt}`)
  return parts.join('\n\n')
}

function uniqueSessionId(): string {
  return `api-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** 非流式调用，返回完整文本 */
export async function nanobotChat(opts: NanobotChatOptions): Promise<string> {
  const { baseUrl, model } = getNanobotConfig()
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: buildUserContent(opts) }],
      session_id: uniqueSessionId(),
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 4096,
      stream: false,
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`nanobot API ${res.status}: ${errText.slice(0, 300)}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

/** 流式调用，逐段 yield 文本增量 */
export async function* nanobotChatStream(opts: NanobotChatOptions): AsyncGenerator<string> {
  const { baseUrl, model } = getNanobotConfig()
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: buildUserContent(opts) }],
      session_id: uniqueSessionId(),
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 4096,
      stream: true,
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`nanobot API ${res.status}: ${errText.slice(0, 300)}`)
  }
  const reader = res.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const data = JSON.parse(payload)
        const delta = data.choices?.[0]?.delta?.content
        if (delta) yield delta
      } catch {}
    }
  }
}
