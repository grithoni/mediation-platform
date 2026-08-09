<script setup lang="ts">
// 智能体 → 脱敏规则：全局规则，保存后对该账号下所有案件生效
const { user, isAuthenticated, fetchUser, getAuthHeaders } = useAuth()
const checking = ref(true)
const roleOk = ref(false)

interface DesensitizeRule { category: string; label: string; enabled: boolean; action: 'mask' | 'delete' | 'keep' }

const rules = ref<DesensitizeRule[]>([])
const rulesLoading = ref(false)
const rulesError = ref('')
const rulesSaving = ref(false)
const rulesSaved = ref(false)

async function loadRules() {
  rulesLoading.value = true
  rulesError.value = ''
  try {
    const resp = await $fetch<{ success: boolean; data: any }>('/api/desensitize-rules', {
      headers: getAuthHeaders(),
    })
    rules.value = resp?.data?.rules || []
  } catch (err: any) {
    rulesError.value = err?.data?.message || err?.message || '加载脱敏规则失败'
  } finally {
    rulesLoading.value = false
  }
}

async function saveRules() {
  rulesSaving.value = true
  rulesError.value = ''
  rulesSaved.value = false
  try {
    const resp = await $fetch<{ success: boolean; data: any }>('/api/desensitize-rules', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: { rules: rules.value },
    })
    if (resp?.success) {
      rules.value = resp.data?.rules || rules.value
      rulesSaved.value = true
      setTimeout(() => { rulesSaved.value = false }, 2000)
    } else {
      rulesError.value = resp?.message || '保存失败'
    }
  } catch (err: any) {
    rulesError.value = err?.data?.message || err?.message || '保存失败，请稍后重试'
  } finally {
    rulesSaving.value = false
  }
}

onMounted(async () => {
  await fetchUser()
  checking.value = false
  roleOk.value = ['mediator', 'case_manager', 'admin'].includes(user.value?.role || '')
  if (roleOk.value) {
    await loadRules()
  }
})
</script>

<template>
  <div class="flex-1 min-w-0 overflow-y-auto p-6">
    <div class="max-w-4xl mx-auto">
      <div v-if="checking" class="flex items-center justify-center py-32">
        <UIcon name="i-lucide-loader-2" class="w-8 h-8 text-blue-500 animate-spin" />
      </div>

      <div v-else-if="!isAuthenticated || !roleOk" class="flex items-center justify-center py-32">
        <p class="text-gray-400 dark:text-gray-500 text-sm">请先以调解员身份登录</p>
      </div>

      <template v-else>
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <UIcon name="i-lucide-shield-check" class="w-6 h-6 text-blue-500" />脱敏规则
            </h1>
            <p class="text-sm text-gray-400 dark:text-gray-500 mt-0.5">按类别调整脱敏行为（掩码/删除/保留），保存后对该账号下所有案件生效</p>
          </div>
        </div>

        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 sm:p-6">
          <div v-if="rulesLoading" class="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
            <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />正在加载规则…
          </div>
          <template v-else>
            <UAlert v-if="rulesError" color="error" variant="soft" :title="rulesError" class="mb-3" />
            <div
              v-for="rule in rules"
              :key="rule.category"
              class="flex items-center gap-3 py-2.5 border-b border-gray-50 dark:border-gray-800/60 last:border-0"
            >
              <label class="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                <input
                  v-model="rule.enabled"
                  type="checkbox"
                  class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span class="text-sm text-gray-700 dark:text-gray-300 truncate">{{ rule.label }}</span>
              </label>
              <select
                v-model="rule.action"
                :disabled="!rule.enabled"
                class="shrink-0 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-1.5 disabled:opacity-50"
              >
                <option value="mask">掩码回填</option>
                <option value="delete">直接删除</option>
                <option value="keep">保留原样</option>
              </select>
            </div>
            <div class="flex items-center gap-3 pt-4">
              <button
                class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                :disabled="rulesSaving"
                @click="saveRules"
              >
                <UIcon v-if="rulesSaving" name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
                <UIcon v-else name="i-lucide-check" class="w-4 h-4" />确认保存
              </button>
              <span v-if="rulesSaved" class="text-xs text-green-600 dark:text-green-400">已保存，将对所有案件生效</span>
            </div>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>
