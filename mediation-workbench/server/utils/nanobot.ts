// ============================================================
// server/utils/nanobot.ts
// 统一 nanobot AI 引擎客户端 — OpenAI 兼容 API 封装
//
// 说明：
//   - 引擎 = 项目内置（vendored）nanobot，由 server/plugins/ai-engine.ts
//     在 .data/ai/config.json 下启动，监听 127.0.0.1:8900；
//     不依赖外部 nanobot / ~/.nanobot 配置。
//   - 请求前通过 ensureAiEngine() 确保服务可用（Nitro 进程内由插件
//     负责 spawn；dev:mp 独立进程以 probeOnly 模式探测，不 spawn）。
//   - nanobot /v1/chat/completions 只接受单条 user message，
//     因此把 system + history + prompt 拼接为单条消息发送；
//     每次调用使用唯一 session_id，不依赖 nanobot 隐式记忆。
// ============================================================

import { ensureAiEngine } from './ai-engine-manager'

// 请求超时（毫秒）。引擎侧每次请求的硬超时为 api.timeout（默认 120s，
// 见 .data/ai/config.json），因此客户端超时略高于引擎，让引擎自身的
// 504/错误响应有机会返回；若引擎挂死，客户端也能兜底中断。
const NANOBOT_CHAT_TIMEOUT_MS = 125_000 // 非流式
const NANOBOT_STREAM_TIMEOUT_MS = 125_000 // 流式（整体）

function isAbortError(err: unknown): boolean {
  const name = (err as { name?: string } | undefined)?.name
  return name === 'AbortError' || name === 'TimeoutError'
}

function abortReason(err: unknown, fallback: string): string {
  return isAbortError(err) ? fallback : (err as Error).message || String(err)
}

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

/** 运行地址：环境变量 > Nuxt runtimeConfig > 默认值（项目内置引擎）。 */
function getNanobotConfig() {
  let baseUrl = process.env.NANOBOT_BASE_URL || 'http://127.0.0.1:8900/v1'
  let model = process.env.NANOBOT_MODEL || 'deepseek-v4-flash'
  try {
    // Nuxt/nitro 环境存在 useRuntimeConfig 自动导入；
    // 独立 MP 进程（tsx server/mp/index.ts）没有，会被 catch 捕获走环境变量。
    const rc = (useRuntimeConfig as unknown as (() => Record<string, any>))?.()
    if (rc) {
      baseUrl = rc.nanobotBaseUrl || baseUrl
      model = rc.nanobotModel || model
    }
  } catch {
    /* standalone process — use env/defaults */
  }
  return { baseUrl, model }
}

/**
 * 请求前确保 AI 服务可用。
 * Nitro 进程：允许插件路径 spawn（同一进程内由 starting 标志防重）。
 * dev:mp 独立进程：NANOBOT_AI_PROBE_ONLY=1 时只探测不 spawn（避免双重 spawn）。
 */
async function ensureAiAvailable(): Promise<void> {
  const probeOnly = process.env.NANOBOT_AI_PROBE_ONLY === '1'
  const status = await ensureAiEngine({ probeOnly })
  if (!status.healthy) {
    const firstLine = (status.detail || '').split('\n').find(Boolean)
    throw new Error(
      `AI 引擎不可用（${status.status}）${firstLine ? `: ${firstLine}` : ''}。` +
        (probeOnly
          ? ''
          : '请运行 bash python/ai-engine/scripts/setup.sh 后重启工作台。')
    )
  }
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
  await ensureAiAvailable()
  const { baseUrl, model } = getNanobotConfig()
  let res: Response
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(NANOBOT_CHAT_TIMEOUT_MS),
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: buildUserContent(opts) }],
        session_id: uniqueSessionId(),
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 4096,
        stream: false,
      }),
    })
  } catch (err) {
    throw new Error(`AI 引擎请求失败: ${abortReason(err, '请求超时')}`)
  }
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`nanobot API ${res.status}: ${errText.slice(0, 300)}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

/** 流式调用，逐段 yield 文本增量 */
export async function* nanobotChatStream(opts: NanobotChatOptions): AsyncGenerator<string> {
  await ensureAiAvailable()
  const { baseUrl, model } = getNanobotConfig()
  const signal = AbortSignal.timeout(NANOBOT_STREAM_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: buildUserContent(opts) }],
        session_id: uniqueSessionId(),
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 4096,
        stream: true,
      }),
    })
  } catch (err) {
    throw new Error(`AI 引擎请求失败: ${abortReason(err, '请求超时')}`)
  }
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`nanobot API ${res.status}: ${errText.slice(0, 300)}`)
  }
  const reader = res.body?.getReader()
  if (!reader) throw new Error('AI 引擎无响应内容')
  const decoder = new TextDecoder()
  let buffer = ''
  let sawDone = false

  // 解析单行 SSE：返回增量文本；空 payload / [DONE] 跳过。
  // 非空 payload 解析失败时记录告警但不中断正常流（不静默吞掉）。
  // 记录是否收到完成标记 [DONE]：EOF 时若未收到，说明引擎侧流式
  // 异常中断（超时/错误），调用方不应把半截内容当作成功。
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
      console.warn(`[nanobot] 忽略无法解析的 SSE 数据: ${payload.slice(0, 120)}`)
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

    // 流结束：flush decoder 残留字节 + 缓冲区中未以换行结尾的残留行
    buffer += decoder.decode()
    for (const line of buffer.split('\n')) {
      const delta = deltaFromLine(line)
      if (delta) yield delta
    }
  } catch (err) {
    if (isAbortError(err)) throw new Error('AI 引擎流式响应超时，请稍后重试')
    throw err
  }

  if (!sawDone) {
    throw new Error('AI 引擎流式响应中断（未收到完成标记），请稍后重试')
  }
}
