// v1780639939949
// ============================================================
// Agent Chat Composable — SSE streaming agent execution
// ============================================================

// 客户端 SSE 整体超时：服务端 /api/chat/agent 内部引擎请求超时为 125s
// （server/utils/nanobot.ts），浏览器端略高于服务端，让服务端自身的
// 超时/错误事件先返回；引擎挂死时浏览器也能兜底中断。
const AI_STREAM_TIMEOUT_MS = 130_000

function isTimeoutError(err: unknown): boolean {
  const name = (err as { name?: string } | undefined)?.name
  return name === 'AbortError' || name === 'TimeoutError'
}

export interface AgentEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'text' | 'done' | 'error' | 'finished'
  turn?: number
  content?: string
  toolName?: string
  toolArgs?: Record<string, unknown>
  toolResult?: string
  data?: any
}

export interface AgentMessage {
  id: string
  role: 'user' | 'agent'
  content: string
  toolCalls?: Array<{
    toolName: string
    args: Record<string, unknown>
    result?: string
  }>
  thinking?: string
  createdAt: Date
}

export function useAgentChat(caseId: Ref<string>) {
  const messages = ref<AgentMessage[]>([])
  const isStreaming = ref(false)
  const currentContent = ref('')
  const currentThinking = ref('')
  const currentToolCalls = ref<Array<{
    toolName: string
    args: Record<string, unknown>
    result?: string
    isRunning: boolean
  }>>([])
  const currentTurn = ref(0)
  const error = ref<string | null>(null)
  const dialogEnded = ref(false) // Set to true when server returns DIALOG_ENDED

  /** Send a message to the agent API via SSE */
  async function sendToAgent(
    message: string,
    senderIdentifier?: string,
    senderName?: string,
    agentMode?: string,
  ): Promise<void> {
    // Add user message
    messages.value.push({
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
      createdAt: new Date(),
    })

    // Reset state
    isStreaming.value = true
    currentContent.value = ''
    currentThinking.value = ''
    currentToolCalls.value = []
    currentTurn.value = 0
    error.value = null

    // Stream completion tracking — must live outside try/finally so the
    // finally block can decide whether partial content should be persisted.
    let completed = false // Received a 'done' completion marker
    let streamError: string | null = null // Received an explicit 'error' event

    try {
      const response = await fetch('/api/chat/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(AI_STREAM_TIMEOUT_MS),
        body: JSON.stringify({
          caseId: caseId.value,
          message,
          senderIdentifier: senderIdentifier || 'party',
          senderName: senderName || '当事人',
          agentMode: agentMode || 'interactive',
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let leftover = '' // Buffer for incomplete lines across chunks

      const processLine = (line: string) => {
        if (!line.startsWith('data: ')) return
        const jsonStr = line.slice(6).trim()
        if (!jsonStr) return

        try {
          const event: AgentEvent = JSON.parse(jsonStr)
          if (event.type === 'done') completed = true
          if (event.type === 'error') streamError = event.content || '未知错误'
          handleAgentEvent(event)
        } catch {}
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const text = leftover + chunk
        const lines = text.split('\n')

        // Last element may be incomplete (no trailing \n) — save for next chunk
        leftover = lines.pop() || ''

        for (const line of lines) {
          processLine(line)
        }
      }

      // Process any remaining data in the buffer
      if (leftover.trim()) {
        processLine(leftover)
      }

      // EOF 且未收到完成标记：上游异常中断。若服务端已发送显式 error
      // 事件（handleAgentEvent 已展示错误），则不重复抛出；否则抛错让
      // 调用方感知，避免把半截内容当作成功结果。
      if (streamError) {
        // already surfaced by handleAgentEvent('error')
      } else if (!completed) {
        throw new Error('AI 响应中断，未收到完成标记，请重试。')
      }
    } catch (err: any) {
      const msg = isTimeoutError(err) ? 'AI 响应超时，请稍后重试。' : err.message
      error.value = msg
      addAgentMessage(`⚠️ 智能体执行出错: ${msg}`)
    } finally {
      isStreaming.value = false

      // 仅在正常完成时持久化累积内容；异常中断时绝不把半截内容
      // 当作成功消息（'done' 事件处理时已清空 currentContent）。
      if (completed && currentContent.value) {
        addAgentMessage(currentContent.value)
      }
    }
  }

  /** Handle an SSE event from the agent */
  function handleAgentEvent(event: AgentEvent) {
    switch (event.type) {
      case 'thinking':
        currentTurn.value = event.turn || 0
        currentThinking.value = event.content || ''
        break

      case 'text':
        currentContent.value += event.content || ''
        break

      case 'tool_call':
        currentToolCalls.value.push({
          toolName: event.toolName || 'unknown',
          args: event.toolArgs || {},
          isRunning: true,
        })
        break

      case 'tool_result':
        // Update the last running tool call with result
        const runningIdx = [...currentToolCalls.value].reverse().findIndex((tc) => tc.isRunning)
        if (runningIdx >= 0) {
          const actualIdx = currentToolCalls.value.length - 1 - runningIdx
          const item = currentToolCalls.value[actualIdx]
          if (item) {
            item.result = event.content || ''
            item.isRunning = false
          }
        }
        break

      case 'done':
        // Agent finished — save accumulated content as a message
        if (event.content) {
          currentContent.value = event.content
        }
        if (currentContent.value) {
          addAgentMessage(currentContent.value)
          currentContent.value = ''
        }

        // Handle dialog ended (from keyword intercept / turn limit)
        if (event.data?.exitReason === 'DIALOG_ENDED') {
          dialogEnded.value = true
          // Message already added above — no duplicate needed.
          // Caller should watch dialogEnded and update UI accordingly
        }

        // Handle ask_user
        if (event.data?.exitReason === 'ASK_USER') {
          const question = event.data?.question
          if (question) {
            addAgentMessage(
              typeof question === 'string'
                ? question
                : question.question
                  ? `${question.question}\n\n${(question.candidates || []).map((c: string, i: number) => `${i + 1}. ${c}`).join('\n')}`
                  : JSON.stringify(question)
            )
          }
        }
        break

      case 'error':
        error.value = event.content || '未知错误'
        addAgentMessage(`⚠️ ${event.content}`)
        break
    }
  }

  /** Add an agent message to the list */
  function addAgentMessage(content: string) {
    messages.value.push({
      id: `agent-${Date.now()}`,
      role: 'agent',
      content,
      toolCalls: currentToolCalls.value.length > 0
        ? currentToolCalls.value.map((tc) => ({
            toolName: tc.toolName,
            args: tc.args,
            result: tc.result,
          }))
        : undefined,
      thinking: currentThinking.value || undefined,
      createdAt: new Date(),
    })

    // Reset per-message state
    currentToolCalls.value = []
    currentThinking.value = ''
  }

  /** Clear all messages */
  function clear() {
    messages.value = []
    currentContent.value = ''
    currentThinking.value = ''
    currentToolCalls.value = []
    currentTurn.value = 0
    error.value = null
  }

  return {
    messages,
    isStreaming,
    currentContent,
    currentThinking,
    currentToolCalls,
    currentTurn,
    error,
    dialogEnded,
    sendToAgent,
    clear,
  }
}
