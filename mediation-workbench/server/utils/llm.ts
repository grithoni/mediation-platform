// ============================================================
// server/utils/llm.ts
// 统一 LLM 客户端 — 直连 DeepSeek（OpenAI 兼容 API）
//
// 说明：
//   - 不再依赖本地 nanobot 引擎；直接调用外部 OpenAI 兼容端点
//     （默认 https://api.deepseek.com/v1）。
//   - 地址/模型/密钥按 环境变量 > Nuxt runtimeConfig > 默认值 解析。
//   - 每次调用为无状态请求，不携带任何会话/记忆参数。
// ============================================================

// 请求超时（毫秒）
const LLM_CHAT_TIMEOUT_MS = 125_000 // 非流式
const LLM_STREAM_TIMEOUT_MS = 125_000 // 流式（整体）

function isAbortError(err: unknown): boolean {
  const name = (err as { name?: string } | undefined)?.name
  return name === 'AbortError' || name === 'TimeoutError'
}

function abortReason(err: unknown, fallback: string): string {
  return isAbortError(err) ? fallback : (err as Error).message || String(err)
}

export interface LlmMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface LlmChatOptions {
  system?: string
  prompt: string
  history?: LlmMessage[]
  temperature?: number
  maxTokens?: number
  /** 覆盖默认非流式超时（毫秒）；长输入/长输出任务可调大，默认 125s。 */
  timeoutMs?: number
}

/** 运行地址：环境变量 > Nuxt runtimeConfig > 默认值。 */
function getLlmConfig() {
  let apiKey = process.env.NUXT_OPENAI_API_KEY || ''
  let baseUrl = process.env.NUXT_OPENAI_BASE_URL || 'https://api.deepseek.com/v1'
  let model = process.env.NUXT_OPENAI_MODEL || 'deepseek-v4-flash'
  try {
    // Nuxt/nitro 环境存在 useRuntimeConfig 自动导入；
    // 独立 MP 进程（tsx server/mp/index.ts）没有，会被 catch 捕获走环境变量。
    const rc = (useRuntimeConfig as unknown as (() => Record<string, any>))?.()
    if (rc) {
      apiKey = rc.openaiApiKey || apiKey
      baseUrl = rc.openaiBaseUrl || baseUrl
      model = rc.openaiModel || model
    }
  } catch {
    /* standalone process — use env/defaults */
  }
  return { apiKey, baseUrl: baseUrl.replace(/\/$/, ''), model }
}

/** 拼接 system + history + prompt 为单条 user message */
function buildUserContent(opts: LlmChatOptions): string {
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

/** 非流式调用，返回完整文本；对空响应自动重试（DeepSeek 长输入偶发空 content）。 */
export async function llmChat(opts: LlmChatOptions): Promise<string> {
  const { apiKey, baseUrl, model } = getLlmConfig()
  if (!apiKey) throw new Error('缺少 DeepSeek API Key（请设置 NUXT_OPENAI_API_KEY）')

  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(opts.timeoutMs ?? LLM_CHAT_TIMEOUT_MS),
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: buildUserContent(opts) }],
          temperature: opts.temperature ?? 0.7,
          max_tokens: opts.maxTokens ?? 4096,
          stream: false,
        }),
      })
    } catch (err) {
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1000 * attempt))
        continue
      }
      throw new Error(`LLM 请求失败: ${abortReason(err, '请求超时')}`)
    }
    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`LLM API ${res.status}: ${errText.slice(0, 300)}`)
    }
    const data = await res.json()
    const content = data.choices?.[0]?.message?.content || ''
    if (content && content.trim().length > 0) return content
    // 空 content：重试（长输入/长输出下 DeepSeek 偶发返回空）
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 1000 * attempt))
      continue
    }
  }
  return ''
}

/** 流式调用，逐段 yield 文本增量 */
export async function* llmChatStream(opts: LlmChatOptions): AsyncGenerator<string> {
  const { apiKey, baseUrl, model } = getLlmConfig()
  if (!apiKey) throw new Error('缺少 DeepSeek API Key（请设置 NUXT_OPENAI_API_KEY）')
  const signal = AbortSignal.timeout(LLM_STREAM_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: buildUserContent(opts) }],
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 4096,
        stream: true,
      }),
    })
  } catch (err) {
    throw new Error(`LLM 请求失败: ${abortReason(err, '请求超时')}`)
  }
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`LLM API ${res.status}: ${errText.slice(0, 300)}`)
  }
  const reader = res.body?.getReader()
  if (!reader) throw new Error('LLM 无响应内容')
  const decoder = new TextDecoder()
  let buffer = ''
  let sawDone = false

  const deltaFromLine = (line: string): string | null => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return null
    const payload = trimmed.slice(5).trim()
    if (!payload) return null
    if (payload === '[DONE]') {
      sawDone = true
      return null
    }
    try {
      const data = JSON.parse(payload)
      const delta = data.choices?.[0]?.delta?.content
      return typeof delta === 'string' && delta.length > 0 ? delta : null
    } catch {
      console.warn(`[llm] 忽略无法解析的 SSE 数据: ${payload.slice(0, 120)}`)
      return null
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const delta = deltaFromLine(line)
        if (delta) yield delta
      }
    }

    buffer += decoder.decode()
    for (const line of buffer.split('\n')) {
      const delta = deltaFromLine(line)
      if (delta) yield delta
    }
  } catch (err) {
    if (isAbortError(err)) throw new Error('LLM 流式响应超时，请稍后重试')
    throw err
  }

  if (!sawDone) {
    throw new Error('LLM 流式响应中断（未收到完成标记），请稍后重试')
  }
}