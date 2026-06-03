export interface ChatMessage {
  id: string
  caseId: string
  senderType: 'party' | 'mediator' | 'ai'
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
  const isMediatorOnline = ref(false)

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
  function getWsUrl(token?: string, userType?: string, mediatorId?: string): string {
    if (import.meta.server) return ''
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const params = new URLSearchParams()
    params.set('caseId', caseId.value)
    if (token) params.set('token', token)
    if (userType) params.set('type', userType)
    if (mediatorId) params.set('mediatorId', mediatorId)
    return `${protocol}//${location.host}/_ws?${params.toString()}`
  }

  /**
   * Connect to WebSocket for real-time chat
   * @param token - party session token (for party access)
   * @param userType - 'party' or 'mediator'
   * @param mediatorId - mediator's ID (required for mediator access)
   */
  function connectWebSocket(token?: string, userType?: 'party' | 'mediator', mediatorId?: string) {
    if (import.meta.server) return

    _currentToken = token

    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    try {
      ws = new WebSocket(getWsUrl(token, userType, mediatorId))

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
            case 'mediator_joined':
              isMediatorOnline.value = true
              break
            case 'mediator_left':
              isMediatorOnline.value = false
              break
            case 'mediator-status':
              isMediatorOnline.value = msg.data?.online === true
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
  async function sendAiMessage(message: string, senderIdentifier?: string, senderName?: string) {
    aiStreaming.value = true
    aiStreamContent.value = ''

    try {
      const data = await $fetch<{
        success: boolean
        data: {
          id: string
          caseId: string
          senderType: string
          senderId: string
          senderName: string
          content: string
          createdAt: string
        }
      }>('/api/chat/ai', {
        method: 'POST',
        body: {
          caseId: caseId.value,
          message,
          senderIdentifier: senderIdentifier || 'party',
          senderName: senderName || '当事人',
        },
      })

      if (data?.success && data.data) {
        // Simulate streaming effect
        const fullContent = data.data.content
        for (let i = 0; i < fullContent.length; i++) {
          aiStreamContent.value = fullContent.slice(0, i + 1)
          await new Promise(r => setTimeout(r, 20))
        }

        messages.value.push({
          id: data.data.id,
          caseId: data.data.caseId,
          senderType: 'ai',
          senderId: data.data.senderId,
          senderName: data.data.senderName,
          content: data.data.content,
          createdAt: data.data.createdAt,
        })
      }
    }
    catch (err) {
      aiStreamContent.value = `错误: ${(err as Error).message}`
    }
    finally {
      aiStreaming.value = false
      aiStreamContent.value = ''
    }
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
    isMediatorOnline,
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
