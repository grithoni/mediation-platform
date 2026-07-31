export interface ChatMessage {
  id: string
  caseId: string
  senderType: 'party' | 'mediator' | 'ai' | 'system'
  senderId?: string | null
  senderName?: string | null
  content: string
  createdAt: string | Date
}

export function useChat(caseId: Ref<string>) {
  const messages = ref<ChatMessage[]>([])
  const isTyping = ref(false)
  const typingUser = ref<string | null>(null)
  const connected = ref(false)
  const aiStreaming = ref(false)
  const aiStreamContent = ref('')

  let ws: WebSocket | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let reconnectAttempt = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let typingTimer: ReturnType<typeof setTimeout> | null = null
  let _currentToken: string | undefined
  const messageQueue: string[] = []

  /**
   * Fetch messages from REST API
   */
  async function fetchMessages(sessionToken?: string) {
    try {
      const query: Record<string, string> = {}
      if (sessionToken) query.sessionToken = sessionToken

      const data = await $fetch<{ success: boolean; data: ChatMessage[] }>(
        `/api/chat/messages/${caseId.value}`,
        { query },
      )
      if (data?.data) {
        messages.value = data.data
      }
    }
    catch {
      // ignore
    }
  }

  /**
   * Get WebSocket URL
   */
  function getWsUrl(token?: string): string {
    if (import.meta.server) return ''
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const params = new URLSearchParams()
    params.set('caseId', caseId.value)
    if (token) params.set('token', token)
    return `${protocol}//${location.host}/_ws?${params.toString()}`
  }

  /**
   * Connect to WebSocket for real-time chat
   * @param token - party session token (for party access)
   */
  function connectWebSocket(token?: string) {
    if (import.meta.server) return

    _currentToken = token

    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    try {
      ws = new WebSocket(getWsUrl(token))

      ws.onopen = () => {
        connected.value = true
        reconnectAttempt = 0
        stopPolling()
        // Flush queued messages
        while (messageQueue.length > 0) {
          const msg = messageQueue.shift()
          if (msg) ws?.send(msg)
        }
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          switch (msg.type) {
            case 'message':
              messages.value.push(msg.data)
              break
            case 'typing':
              typingUser.value = msg.data?.senderName || msg.data?.senderId
              isTyping.value = true
              // Auto-hide typing after 3 seconds
              clearTimeout(typingTimer as any)
              typingTimer = setTimeout(() => {
                isTyping.value = false
                typingUser.value = null
              }, 3000)
              break
            case 'error':
              console.warn('[WS error]', msg.data?.message)
              break
          }
        }
        catch {
          // ignore parse errors
        }
      }

      ws.onclose = () => {
        connected.value = false
        startPolling(_currentToken)
        scheduleReconnect()
      }

      ws.onerror = () => {
        ws?.close()
      }
    }
    catch {
      startPolling(_currentToken)
    }
  }

  /**
   * Schedule WebSocket reconnection with exponential backoff
   */
  function scheduleReconnect() {
    if (reconnectAttempt >= 10) return

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempt), 30000)
    reconnectAttempt++

    reconnectTimer = setTimeout(() => {
      connectWebSocket(_currentToken)
    }, delay)
  }

  /**
   * Send a chat message via WebSocket
   */
  function sendMessage(content: string) {
    const payload = JSON.stringify({ type: 'message', data: { content } })

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(payload)
    }
    else {
      messageQueue.push(payload)
    }
  }

  /**
   * Send typing indicator (debounced)
   */
  function sendTyping() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    if (typingTimer) return

    ws.send(JSON.stringify({ type: 'typing', data: {} }))
    typingTimer = setTimeout(() => {
      typingTimer = null
    }, 2000)
  }

  /**
   * Send a message to the AI assistant
   */
  async function sendAiMessage(message: string, senderIdentifier?: string, senderName?: string): Promise<{ content: string; dialogEnded?: boolean }> {
    aiStreaming.value = true
    aiStreamContent.value = ''

    try {
      // Use SSE streaming agent endpoint for real-time token display
      const response = await fetch('/api/chat/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: caseId.value,
          message,
          senderIdentifier: senderIdentifier || 'party',
          senderName: senderName || '当事人',
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let fullContent = ''
      let leftover = ''
      let dialogEnded = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const text = leftover + chunk
        const lines = text.split('\n')
        leftover = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6).trim()
          if (!jsonStr) continue

          try {
            const event = JSON.parse(jsonStr)
            if (event.type === 'text' && event.content) {
              fullContent += event.content
              aiStreamContent.value = fullContent
            }
            if (event.type === 'thinking' && event.content) {
              // Show simple thinking indicator (hide round number)
              aiStreamContent.value = '思考中...'
            }
            if (event.type === 'tool_call' && event.toolName) {
              aiStreamContent.value = `正在调用工具: ${event.toolName}...`
            }
            if (event.type === 'tool_result' && event.content) {
              // Brief show of tool result before next thinking round
              const preview = event.content.length > 80 ? event.content.slice(0, 80) + '...' : event.content
              aiStreamContent.value = `工具返回: ${preview}`
            }
            if (event.type === 'done') {
              if (event.content) {
                fullContent = event.content
                aiStreamContent.value = fullContent
              }
              if (event.data?.exitReason === 'DIALOG_ENDED') {
                dialogEnded = true
              }
              // Generate fallback message when agent returned empty content
              if (!fullContent && event.data?.exitReason) {
                const reason = event.data.exitReason
                if (reason === 'MAX_TURNS_EXCEEDED') {
                  fullContent = 'AI正在分析您的案件材料，请稍候继续对话。'
                } else if (reason === 'TASK_DONE') {
                  fullContent = '已为您完成分析。'
                } else if (reason === 'DIALOG_ENDED') {
                  fullContent = '信息收集完毕，请选择调解员继续。'
                } else {
                  fullContent = 'AI助手已完成处理。'
                }
                aiStreamContent.value = fullContent
              }
            }
          } catch {}
        }
      }

      if (fullContent) {
        messages.value.push({
          id: `ai-${Date.now()}`,
          caseId: caseId.value,
          senderType: 'ai',
          senderId: 'agent',
          senderName: '调解智能体',
          content: fullContent,
          createdAt: new Date().toISOString(),
        })
      }

      return { content: fullContent, dialogEnded }
    }
    catch (err) {
      const errorMsg = `AI服务暂时不可用，请稍后重试。${(err as Error).message ? `(${(err as Error).message})` : ''}`
      messages.value.push({
        id: `ai-error-${Date.now()}`,
        caseId: caseId.value,
        senderType: 'ai',
        senderId: 'agent',
        senderName: '调解智能体',
        content: errorMsg,
        createdAt: new Date().toISOString(),
      })
      aiStreamContent.value = ''
      return { content: errorMsg }
    }
    finally {
      aiStreaming.value = false
    }
    return { content: '' }
  }

  /**
   * Start polling for messages (fallback when WebSocket unavailable)
   */
  function startPolling(sessionToken?: string) {
    if (pollTimer) return
    pollTimer = setInterval(() => fetchMessages(sessionToken), 5000)
  }

  /**
   * Stop polling
   */
  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  /**
   * Disconnect and clean up
   */
  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    reconnectAttempt = Infinity
    if (ws) {
      ws.close()
      ws = null
    }
    stopPolling()
    connected.value = false
  }

  return {
    messages,
    isTyping,
    typingUser,
    connected,
    aiStreaming,
    aiStreamContent,
    fetchMessages,
    connectWebSocket,
    sendMessage,
    sendTyping,
    sendAiMessage,
    startPolling,
    stopPolling,
    disconnect,
  }
}
