// v1780639939946
<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-bot" class="w-5 h-5 text-blue-500" />
        <span class="text-sm font-semibold text-gray-900 dark:text-gray-100">调解智能体</span>
        <UBadge v-if="isStreaming" color="blue" variant="subtle" size="xs">执行中</UBadge>
        <span v-else class="text-[10px] text-gray-400 font-mono">AUTONOMOUS AGENT</span>
      </div>
      <div class="flex items-center gap-1">
        <UButton
          v-if="messages.length > 0"
          size="xs"
          color="blue"
          variant="soft"
          @click="emit('endDialog')"
        >
          结束对话并选择调解员
        </UButton>
        <button
          v-if="messages.length > 0"
          class="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          @click="clearMessages"
        >
          <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Messages -->
    <div ref="containerRef" class="flex-1 overflow-y-auto p-4 space-y-4">
      <div v-if="messages.length === 0" class="text-center text-gray-400 py-8">
        <UIcon name="i-lucide-sparkles" class="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p class="text-xs">智能体助手已就绪</p>
        <p class="text-[10px] text-gray-400 mt-1">可自动读取案件文件、分析案情、生成调解建议</p>
      </div>

      <div v-for="msg in messages" :key="msg.id" class="space-y-2">
        <!-- User message -->
        <div v-if="msg.role === 'user'" class="flex justify-end">
          <div class="max-w-[80%] bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 rounded-lg px-4 py-2 text-sm">
            {{ msg.content }}
          </div>
        </div>

        <!-- Agent message -->
        <div v-else class="space-y-2">
          <!-- Thinking indicator -->
          <div v-if="msg.thinking" class="flex items-center gap-2 text-xs text-gray-400 pl-2">
            <UIcon name="i-lucide-brain" class="w-3 h-3" />
            <span class="font-mono">{{ msg.thinking }}</span>
          </div>

          <!-- Tool calls -->
          <div v-if="msg.toolCalls?.length" class="pl-2 space-y-1">
            <div
              v-for="(tc, i) in msg.toolCalls"
              :key="i"
              class="flex items-start gap-2 text-xs"
            >
              <UIcon
                :name="tc.result ? 'i-lucide-check-circle' : 'i-lucide-loader-circle'"
                class="w-3.5 h-3.5 mt-0.5"
                :class="tc.result ? 'text-green-500' : 'text-blue-400 animate-spin'"
              />
              <div class="flex-1 min-w-0">
                <span class="font-mono text-blue-600 dark:text-blue-400">{{ formatToolName(tc.toolName) }}</span>
                <span class="text-gray-400 ml-1">{{ formatToolArgs(tc.args) }}</span>
                <div v-if="tc.result" class="text-gray-500 dark:text-gray-400 mt-0.5 text-[10px] font-mono whitespace-pre-wrap break-all line-clamp-3">
                  {{ tc.result }}
                </div>
              </div>
            </div>
          </div>

          <!-- Content -->
          <div class="max-w-[85%] bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-2 text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
            {{ msg.content }}
          </div>
        </div>
      </div>

      <!-- Streaming content -->
      <div v-if="isStreaming && currentContent" class="space-y-2">
        <!-- Live tool calls -->
        <div v-if="currentToolCalls.length" class="pl-2 space-y-1">
          <div
            v-for="(tc, i) in currentToolCalls"
            :key="i"
            class="flex items-start gap-2 text-xs"
          >
            <UIcon
              :name="tc.result ? 'i-lucide-check-circle' : 'i-lucide-loader-circle'"
              class="w-3.5 h-3.5 mt-0.5"
              :class="tc.result ? 'text-green-500' : 'text-blue-400 animate-spin'"
            />
            <div class="flex-1 min-w-0">
              <span class="font-mono text-blue-600 dark:text-blue-400">{{ formatToolName(tc.toolName) }}</span>
              <span class="text-gray-400 ml-1">{{ formatToolArgs(tc.args) }}</span>
              <div v-if="tc.result" class="text-gray-500 dark:text-gray-400 mt-0.5 text-[10px] font-mono whitespace-pre-wrap break-all line-clamp-3">
                {{ tc.result }}
              </div>
            </div>
          </div>
        </div>

        <!-- Streaming text -->
        <div class="max-w-[85%] bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
          {{ currentContent }}
          <span class="inline-block w-1.5 h-4 bg-blue-500 animate-pulse align-middle ml-0.5" />
        </div>
      </div>

      <!-- Error -->
      <div v-if="error && !isStreaming" class="text-center text-red-500 text-xs py-2">
        {{ error }}
      </div>
    </div>

    <!-- Input -->
    <div class="border-t border-gray-200 dark:border-gray-700 p-3">
      <div class="flex gap-2">
        <UInput
          v-model="inputText"
          placeholder="输入任务指令..."
          size="sm"
          class="flex-1"
          :disabled="isStreaming"
          @keydown.enter.prevent="submitMessage"
        />
        <UButton
          icon="i-lucide-send"
          size="sm"
          color="blue"
          variant="solid"
          :disabled="isStreaming || !inputText.trim()"
          @click="submitMessage"
        >
          发送
        </UButton>
      </div>
      <p class="text-[9px] text-gray-400 mt-1">
        输入任务指令，智能体将自动执行（读取文件、分析案情、搜索法律知识等）
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  caseId: string
  senderIdentifier?: string
  senderName?: string
}>()

const emit = defineEmits<{
  endDialog: []
}>()

const { caseId } = toRefs(props)
const { messages, isStreaming, currentContent, currentToolCalls, error, dialogEnded, sendToAgent } =
  useAgentChat(caseId)

// When server triggers DIALOG_ENDED or local keyword match, update global state
async function triggerMediatorSelection() {
  try {
    await $fetch('/api/cases/end-dialog', { method: 'POST', body: { caseId: props.caseId } })
  } catch {}
  // Update global phase state directly
  const phase = useState<string>('case-phase-' + props.caseId, () => 'analysis')
  phase.value = 'mediator_selection'
  emit('endDialog')
}

watch(dialogEnded, (val) => {
  if (val) triggerMediatorSelection()
})

const inputText = ref('')
const containerRef = ref<HTMLElement | null>(null)
const idleTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const submitting = ref(false) // debounce guard

const KEYWORDS = [
  '分配调解员', '选择调解员', '我要找调解员', '帮我找调解员',
  '我要联系调解员', '联系调解员', '结束谈话', '结束对话', '结束',
  '就这样', '可以了', '不用了', '不需要', '无需', '无补充',
  '我不想聊了', '找调解员', '推荐调解员', '安排调解员',
]

async function submitMessage() {
  const text = inputText.value.trim()
  if (!text || isStreaming.value || submitting.value) return

  submitting.value = true
  const clean = text.replace(/\s/g, '')
  const isEnd = KEYWORDS.some(kw => clean.includes(kw))

  if (isEnd) {
    addLocalMessage(text, 'user')
    addLocalMessage('好的，案件分析已完成。请点击页面上方的"选择调解员"按钮选择调解员。', 'agent')
    inputText.value = ''
    submitting.value = false
    triggerMediatorSelection()
    setTimeout(() => { window.location.reload() }, 1500)
    return
  }

  sendToAgent(text, props.senderIdentifier, props.senderName)
  inputText.value = ''
  nextTick(() => { submitting.value = false })
}

function addLocalMessage(content: string, role: 'user' | 'agent') {
  messages.value.push({
    id: `${role}-${Date.now()}`,
    role,
    content,
    createdAt: new Date(),
  })
}

onMounted(() => {
  resetIdleTimer()
})

onUnmounted(() => {
  if (idleTimer.value) clearTimeout(idleTimer.value)
})

// Reset idle timer when user sends message
watch(() => messages.value.length, () => {
  const last = messages.value[messages.value.length - 1]
  if (last?.role === 'user') {
    resetIdleTimer()
  }
})

function clearMessages() {
  const { clear } = useAgentChat(caseId)
  clear()
}

/** Auto-scroll to bottom on new messages */
const lastMessageEl = ref<HTMLElement | null>(null)

watch([messages, currentContent, currentThinking, currentToolCalls], () => {
  nextTick(() => {
    if (containerRef.value) {
      containerRef.value.scrollTop = containerRef.value.scrollHeight
      // Also scroll any case-level containers
      const parentScroll = containerRef.value.closest('.overflow-y-auto')
      if (parentScroll && parentScroll !== containerRef.value) {
        parentScroll.scrollTop = parentScroll.scrollHeight
      }
    }
  })
}, { deep: true, immediate: true })

// ============================================================
// Formatting helpers
// ============================================================

const TOOL_NAMES_CN: Record<string, string> = {
  file_read: '读取文件',
  file_write: '写入文件',
  code_run: '执行代码',
  search_information: '搜索信息',
  ask_user: '向用户提问',
  update_working_checkpoint: '更新工作记忆',
  search_legal_knowledge: '搜索法律知识',
}

function formatToolName(name: string): string {
  return TOOL_NAMES_CN[name] || name
}

function formatToolArgs(args: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, val] of Object.entries(args)) {
    if (key.startsWith('_')) continue
    const v = typeof val === 'string' ? (val.length > 40 ? val.slice(0, 40) + '...' : val) : JSON.stringify(val)
    if (v.length < 60 && key !== 'content' && key !== 'code') {
      parts.push(`${key}=${v}`)
    }
  }
  if (args.path) return String(args.path)
  if (args.query) return `"${args.query}"`
  if (args.question) return `"${(args.question as string).slice(0, 30)}..."`
  return parts.join(', ') || ''
}
</script>
