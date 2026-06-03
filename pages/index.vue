<template>
  <div class="flex-1 flex flex-col min-h-0">
    <!-- Upper: Platform Info -->
    <div class="shrink-0 p-8 border-b border-gray-200 dark:border-gray-800">
      <div class="max-w-2xl">
        <div class="flex items-center gap-2 mb-3">
          <UIcon name="i-lucide-scale" class="w-6 h-6 text-blue-500 dark:text-blue-400" />
          <div>
            <h1 class="text-5xl font-bold text-gray-900 dark:text-white">全时在线的调解专家</h1>
            <p class="text-base text-gray-400 dark:text-gray-500 font-mono leading-tight">Always Online Mediation Expert</p>
          </div>
        </div>

        <div class="flex items-center gap-2 mb-6">
          <div class="w-1 h-5 bg-blue-300 dark:bg-blue-600 rounded-full" />
          <span class="text-sm font-mono text-gray-400 dark:text-gray-500 uppercase tracking-widest">MEDIATION EXPERT</span>
        </div>

        <div class="grid grid-cols-3 gap-6">
          <div v-for="f in features" :key="f.label" class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-md bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center shrink-0">
                <UIcon :name="f.icon" class="w-4 h-4 text-blue-500 dark:text-blue-400" />
            </div>
            <div>
                <div class="text-base font-semibold text-gray-900 dark:text-white">{{ f.label }}</div>
                <div class="text-sm text-gray-400 dark:text-gray-500 mt-0.5 leading-relaxed">{{ f.desc }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Lower: AI Chat -->
    <div class="flex-1 flex flex-col min-h-0">
      <div ref="chatContainer" class="flex-1 overflow-y-auto p-4 space-y-3">
        <template v-if="chatMessages.length === 0 && !chatLoading">
          <div class="flex items-center justify-center h-full">
            <div class="text-center">
              <UIcon name="i-lucide-message-circle" class="w-10 h-10 text-gray-300 dark:text-gray-700 mx-auto mb-2" />
              <p class="text-sm text-gray-400 dark:text-gray-500 font-mono">我是您的智能调解助手，有什么可以帮您？</p>
            </div>
          </div>
        </template>

        <div v-for="(msg, i) in chatMessages" :key="i" class="flex" :class="msg.role === 'user' ? 'justify-end' : 'justify-start'">
          <div
            class="max-w-[70%] rounded-lg px-3 py-2"
            :class="msg.role === 'user'
              ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'"
          >
            <div v-if="msg.role === 'ai'" class="text-xs font-medium mb-1 opacity-60 text-blue-600 dark:text-blue-400">AI助手</div>
            <div class="text-base whitespace-pre-wrap leading-relaxed">{{ msg.content }}</div>
            <div class="text-xs mt-1 opacity-40 text-right font-mono">{{ msg.time }}</div>
          </div>
        </div>

        <div v-if="chatLoading" class="flex justify-start">
          <div class="bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2 max-w-[70%]">
            <div class="text-xs font-medium mb-1 opacity-60 text-blue-600 dark:text-blue-400">AI助手</div>
            <div class="text-base whitespace-pre-wrap leading-relaxed text-gray-800 dark:text-gray-200">
              {{ chatStreamContent || '思考中...' }}
              <span class="animate-pulse text-blue-500 dark:text-blue-400">▌</span>
            </div>
          </div>
        </div>
      </div>

      <div class="border-t border-gray-200 dark:border-gray-800 p-3 shrink-0 bg-white dark:bg-gray-900">
        <form @submit.prevent="sendChat" class="flex gap-2">
          <UTextarea
            v-model="chatInput"
            placeholder="向AI助手提问..."
            :rows="1"
            autoresize
            :maxrows="4"
            class="flex-1"
            @keydown.enter.exact.prevent="sendChat"
          />
          <UButton
            type="submit"
            icon="i-lucide-send"
            size="sm"
            :disabled="!chatInput.trim() || chatLoading"
            class="self-end bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100"
          />
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const config = useRuntimeConfig()
if (config.public.appMode === 'mediator') {
  navigateTo('/admin', { replace: true })
}

const features = [
  { icon: 'i-lucide-shield-check', label: '安全保密', desc: '全程加密传输，保护商业秘密和隐私' },
  { icon: 'i-lucide-brain', label: 'AI 智能辅助', desc: '人工智能辅助分析，提供专业调解建议' },
  { icon: 'i-lucide-users', label: '专业调解员', desc: '经验丰富的商事调解员，高效化解纠纷' },
]

const chatInput = ref('')
const chatMessages = ref<Array<{ role: string; content: string; time: string }>>([])
const chatLoading = ref(false)
const chatStreamContent = ref('')
const chatContainer = ref<HTMLElement | null>(null)

function formatTime(d: Date) {
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

async function sendChat() {
  const text = chatInput.value.trim()
  if (!text) return
  chatInput.value = ''

  const now = new Date()
  chatMessages.value.push({ role: 'user', content: text, time: formatTime(now) })

  chatLoading.value = true
  chatStreamContent.value = ''

  try {
    const data = await $fetch<{ success: boolean; data: { content: string } }>('/api/chat/ai', {
      method: 'POST',
      body: {
        caseId: 'demo',
        message: text,
        senderIdentifier: 'party',
        senderName: '当事人',
      },
    })

    if (data?.data?.content) {
      const full = data.data.content
      for (let i = 0; i < full.length; i++) {
        chatStreamContent.value = full.slice(0, i + 1)
        await new Promise(r => setTimeout(r, 15))
      }
      chatMessages.value.push({ role: 'ai', content: full, time: formatTime(new Date()) })
    }
  } catch (err: any) {
    chatMessages.value.push({ role: 'ai', content: `抱歉，服务暂时不可用：${err?.message || '请稍后重试'}`, time: formatTime(new Date()) })
  } finally {
    chatLoading.value = false
    chatStreamContent.value = ''
    nextTick(() => {
      if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    })
  }
}
</script>
