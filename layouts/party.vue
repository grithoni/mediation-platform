<script setup lang="ts">
const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

function toggleTheme() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}

const caseNumber = ref('')
const accessCode = ref('')
const loading = ref(false)
const errorMessage = ref('')
const router = useRouter()

async function enterCase() {
  errorMessage.value = ''
  loading.value = true
  try {
    const id = caseNumber.value.trim()
    const code = accessCode.value.trim()
    await $fetch(`/api/cases/${id}`, { query: { code } })
    router.push(`/case/${id}?code=${code}`)
  } catch {
    errorMessage.value = '案件编号或验证码错误，请检查后重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="h-screen flex overflow-hidden bg-white dark:bg-gray-950">
    <!-- Left Panel: Case Entry -->
    <aside class="w-[320px] shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
      <div class="p-5 border-b border-gray-200 dark:border-gray-800">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <UIcon name="i-lucide-scale" class="w-4 h-4 text-blue-500 dark:text-blue-400" />
            <div>
              <div class="text-xl font-semibold text-gray-900 dark:text-white">全时在线的调解专家</div>
              <div class="text-xs text-gray-400 dark:text-gray-500 font-mono">Always Online Mediation Expert</div>
            </div>
          </div>
          <button
            class="p-1 rounded-md text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
            @click="toggleTheme"
          >
            <UIcon :name="isDark ? 'i-lucide-sun' : 'i-lucide-moon'" class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- Case Entry Form -->
      <div class="flex-1 p-5 overflow-y-auto">
        <h2 class="text-base font-semibold text-gray-900 dark:text-white mb-3">进入您的案件</h2>

        <form @submit.prevent="enterCase" class="space-y-3">
          <UInput
            v-model="caseNumber"
            placeholder="案件编号"
            icon="i-lucide-file-text"
            size="sm"
            :disabled="loading"
            class="font-mono text-base"
          />
          <UInput
            v-model="accessCode"
            placeholder="访问验证码"
            icon="i-lucide-lock"
            size="sm"
            :disabled="loading"
          />
          <UAlert v-if="errorMessage" color="error" variant="soft" :title="errorMessage" class="text-left" />
          <UButton
            type="submit"
            block
            size="lg"
            :loading="loading"
            :disabled="!caseNumber.trim() || !accessCode.trim()"
            class="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100"
          >
            进入案件
          </UButton>
        </form>
      </div>
    </aside>

    <!-- Right Panel: Slot for child pages -->
    <main class="flex-1 flex flex-col min-w-0 bg-white dark:bg-gray-900">
      <slot />
    </main>
  </div>
</template>
