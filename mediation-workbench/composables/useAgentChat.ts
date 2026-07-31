// v1780639939949
// ============================================================
// Agent Chat Composable — SSE streaming agent execution
// ============================================================

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

    try {
      const response = await fetch('/api/chat/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const text = leftover + chunk
        const lines = text.split('\n')

        // Last element may be incomplete (no trailing \n) — save for next chunk
        leftover = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6).trim()
          if (!jsonStr) continue

          try {
            const event: AgentEvent = JSON.parse(jsonStr)
            handleAgentEvent(event)
          } catch {}
        }
      }

      // Process any remaining data in the buffer
      if (leftover.trim()) {
        const line = leftover.trim()
        if (line.startsWith('data: ')) {
          try {
            const event: AgentEvent = JSON.parse(line.slice(6).trim())
            handleAgentEvent(event)
          } catch {}
        }
      }
    } catch (err: any) {
      error.value = err.message
      addAgentMessage(`⚠️ 智能体执行出错: ${err.message}`)
    } finally {
      isStreaming.value = false

      // Save final agent message
      if (currentContent.value) {
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
