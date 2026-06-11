<template>
  <div class="flex-1 flex flex-col min-h-0 bg-white dark:bg-gray-900">
    <!-- Case Info Bar -->
    <div class="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3 text-sm">
          <span class="font-mono text-blue-600 dark:text-blue-400">{{ caseId }}</span>
          <span class="text-gray-900 dark:text-white font-medium">{{ caseTitle }}</span>
          <UBadge :color="statusColor" variant="soft" size="xs">{{ statusLabel }}</UBadge>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-xs text-gray-400">{{ parties }}</span>
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors disabled:opacity-50"
            :disabled="saving || !messageCount"
            @click="emit('saveConversation')">
            <UIcon :name="saving ? 'i-lucide-loader-2' : 'i-lucide-save'" :class="saving ? 'animate-spin' : ''" class="w-3.5 h-3.5" />
            {{ saving ? '保存中...' : '保存对话' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Case Materials (collapsible) -->
    <div class="shrink-0 border-b border-gray-200 dark:border-gray-800">
      <button class="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm" @click="materialsOpen = !materialsOpen">
        <UIcon :name="materialsOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="w-4 h-4 text-gray-400" />
        <UIcon name="i-lucide-folder-open" class="w-4 h-4 text-blue-500" />
        <span class="font-medium text-gray-700 dark:text-gray-300">案件资料</span>
        <span class="text-xs text-gray-400">{{ materialCount }} 项</span>
      </button>
      <div v-if="materialsOpen" class="px-4 pb-3 flex gap-2 flex-wrap">
        <button v-if="caseDetail?.description"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
          @click="emit('viewMaterial', 'description')">
          <UIcon name="i-lucide-file-text" class="w-3.5 h-3.5" />
          案件描述
        </button>
        <button v-if="caseDetail?.claimsSummary"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors"
          @click="emit('viewMaterial', 'claims')">
          <UIcon name="i-lucide-scale" class="w-3.5 h-3.5" />
          请求和答辩
        </button>
        <button v-if="caseDetail?.evidenceSummary"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors"
          @click="emit('viewMaterial', 'evidence')">
          <UIcon name="i-lucide-search" class="w-3.5 h-3.5" />
          证据和质证
        </button>
        <button
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900 transition-colors"
          @click="emit('openFiles')">
          <UIcon name="i-lucide-paperclip" class="w-3.5 h-3.5" />
          原始文件
          <span v-if="fileCount" class="text-[10px] opacity-70">({{ fileCount }})</span>
        </button>
        <div v-if="materialCount === 0 && fileCount === 0" class="text-xs text-gray-400 py-1">暂无案件资料</div>
      </div>
    </div>

    <!-- AI Mediation Skills -->
    <div class="shrink-0 px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-950/30 dark:to-blue-950/30">
      <div class="flex items-center gap-2 mb-1.5">
        <UIcon name="i-lucide-sparkles" class="w-4 h-4 text-violet-600" />
        <span class="text-xs font-semibold text-violet-700 dark:text-violet-300">AI 调解技能</span>
      </div>
      <div class="flex gap-2 flex-wrap">
        <button
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-gray-900 border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950 hover:border-violet-400 transition-colors disabled:opacity-50"
          :disabled="recommendLoading"
          @click="emit('generateSolution')">
          <UIcon :name="recommendLoading ? 'i-lucide-loader-2' : 'i-lucide-lightbulb'" :class="recommendLoading ? 'animate-spin' : ''" class="w-3.5 h-3.5" />
          {{ recommendLoading ? '生成中...' : '利益重构方案推荐' }}
        </button>
      </div>
    </div>

    <!-- Reply Mode Toggle -->
    <div class="shrink-0 px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-bot" class="w-4 h-4 text-blue-600" />
          <span class="text-xs font-medium text-gray-700 dark:text-gray-300">应答模式</span>
        </div>
        <div class="flex items-center gap-1 bg-gray-200 dark:bg-gray-800 rounded-lg p-0.5">
          <button
            class="px-3 py-1 text-xs font-medium rounded-md transition-colors"
            :class="replyMode === 'auto' ? 'bg-blue-500 text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'"
            @click="emit('changeReplyMode', 'auto')">
            <UIcon name="i-lucide-zap" class="w-3 h-3 inline -mt-0.5" /> 智能应答
          </button>
          <button
            class="px-3 py-1 text-xs font-medium rounded-md transition-colors"
            :class="replyMode === 'manual' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'"
            @click="emit('changeReplyMode', 'manual')">
            <UIcon name="i-lucide-hand" class="w-3 h-3 inline -mt-0.5" /> 人工应答
          </button>
        </div>
      </div>
      <p v-if="replyMode === 'auto'" class="text-[11px] text-blue-600 dark:text-blue-400 mt-1">AI 将自动回复当事人的消息，您可随时切换为人工模式</p>
      <p v-else class="text-[11px] text-gray-500 dark:text-gray-400 mt-1">AI 会在当事人发消息后生成建议话术，供您参考使用</p>
    </div>

    <!-- Chat Dialog -->
    <div class="flex-1 flex flex-col min-h-0">
      <div class="flex-1 overflow-y-auto p-4 space-y-3">
        <template v-if="messages.length">
          <div v-for="msg in messages" :key="msg.id" class="flex" :class="msg.senderType === 'mediator' ? 'justify-end' : 'justify-start'">
            <div class="max-w-[75%] rounded-lg px-3 py-2" :class="bubbleClass(msg.senderType)">
              <div class="text-xs font-medium mb-1 opacity-60">{{ senderLabel(msg) }}</div>
              <div class="text-base whitespace-pre-wrap leading-relaxed">{{ msg.content }}</div>
              <div class="text-xs mt-1 opacity-40 text-right font-mono">{{ formatTime(msg.createdAt) }}</div>
            </div>
          </div>
        </template>
        <div v-else class="flex-1 flex items-center justify-center">
          <div class="text-center">
            <UIcon name="i-lucide-message-circle" class="w-8 h-8 text-gray-300 dark:text-gray-700 mx-auto mb-2" />
            <p class="text-sm text-gray-400">暂无对话记录</p>
          </div>
        </div>

        <!-- AI Suggestion Bubble (人工应答模式) -->
        <div v-if="suggestion" class="flex justify-start">
          <div class="max-w-[75%] rounded-lg border-2 border-dashed border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30 px-3 py-2">
            <div class="flex items-center gap-1.5 mb-1.5">
              <UIcon name="i-lucide-sparkles" class="w-3.5 h-3.5 text-blue-500" />
              <span class="text-xs font-medium text-blue-600 dark:text-blue-400">AI 建议话术</span>
              <button class="ml-auto text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" @click="emit('dismissSuggestion')">
                <UIcon name="i-lucide-x" class="w-3 h-3" />
              </button>
            </div>
            <div class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed mb-2">{{ suggestion }}</div>
            <div class="flex gap-2">
              <button
                class="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                @click="emit('useSuggestion', suggestion)">
                <UIcon name="i-lucide-check" class="w-3 h-3" /> 使用
              </button>
              <button
                class="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded transition-colors"
                @click="emit('editSuggestion', suggestion)">
                <UIcon name="i-lucide-pencil" class="w-3 h-3" /> 编辑
              </button>
            </div>
          </div>
        </div>

        <!-- Auto-reply indicator (智能应答模式) -->
        <div v-if="autoReplying" class="flex justify-start">
          <div class="max-w-[75%] rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2">
            <div class="flex items-center gap-1.5">
              <UIcon name="i-lucide-loader-2" class="w-3.5 h-3.5 text-blue-500 animate-spin" />
              <span class="text-xs text-blue-600 dark:text-blue-400">AI 正在自动生成回复...</span>
            </div>
          </div>
        </div>
      </div>
      <!-- Chat Input -->
      <div class="border-t border-gray-200 dark:border-gray-800 p-3">
        <form @submit.prevent="doSend" class="flex gap-2">
          <UTextarea v-model="quickMessage" placeholder="输入消息..." class="flex-1" :rows="1" autoresize :maxrows="4" @keydown.enter.exact.prevent="doSend" />
          <UButton type="submit" icon="i-lucide-send" size="lg" :disabled="!quickMessage.trim()" class="self-end bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100" />
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface CaseDetail {
  description?: string; claimsSummary?: string; evidenceSummary?: string
}
interface MessageItem {
  id: string; senderType: string; senderName?: string | null; content: string; createdAt: string
}

const props = defineProps<{
  caseId: string
  caseTitle: string
  caseStatus: string
  parties: string
  caseDetail: CaseDetail | null
  messages: MessageItem[]
  fileCount: number
  saving: boolean
  recommendLoading: boolean
  replyMode: 'auto' | 'manual'
  suggestion: string | null
  autoReplying: boolean
}>()

const emit = defineEmits<{
  saveConversation: []
  viewMaterial: [type: string]
  openFiles: []
  generateSolution: []
  sendMessage: [text: string]
  changeReplyMode: [mode: 'auto' | 'manual']
  useSuggestion: [text: string]
  editSuggestion: [text: string]
  dismissSuggestion: []
}>()

const quickMessage = ref('')
const materialsOpen = ref(true)

defineExpose({ quickMessage })

function doSend() {
  const text = quickMessage.value.trim()
  if (!text) return
  emit('sendMessage', text)
  quickMessage.value = ''
}

const materialCount = computed(() => {
  if (!props.caseDetail) return 0
  let n = 0
  if (props.caseDetail.description) n++
  if (props.caseDetail.claimsSummary) n++
  if (props.caseDetail.evidenceSummary) n++
  return n
})

const statusColor = computed(() => {
  const map: Record<string, string> = { pending: 'warning', active: 'success', resolved: 'info', closed: 'neutral' }
  return (map[props.caseStatus] || 'neutral') as any
})

const statusLabel = computed(() => {
  const map: Record<string, string> = { pending: '待处理', active: '进行中', resolved: '已解决', closed: '已关闭' }
  return map[props.caseStatus] || props.caseStatus
})

const messageCount = computed(() => props.messages.length)

function senderLabel(msg: { senderType: string; senderName?: string | null }) {
  if (msg.senderType === 'mediator') return '调解员（您）'
  if (msg.senderType === 'ai') return 'AI助手'
  return msg.senderName || '当事人'
}

function bubbleClass(senderType: string) {
  if (senderType === 'mediator') return 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
  if (senderType === 'ai') return 'bg-blue-50 dark:bg-blue-950/30 text-gray-800 dark:text-gray-200 border border-blue-200 dark:border-blue-900'
  return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
}

function formatTime(date: string | Date) {
  return new Date(date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>
