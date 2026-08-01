<script setup lang="ts">
// 设置 — 账号与大模型配置
const { user, isAuthenticated, fetchUser } = useAuth()
const checking = ref(true)
const roleOk = ref(false)

const aiModel = ref('deepseek-v4-flash')
const aiProvider = ref('DeepSeek')

onMounted(async () => {
  await fetchUser()
  checking.value = false
  roleOk.value = ['mediator', 'case_manager', 'admin'].includes(user.value?.role || '')
})

const saved = ref(false)
function saveSettings() {
  saved.value = true
  setTimeout(() => { saved.value = false }, 2000)
}
</script>

<template>
  <div class="flex-1 min-w-0 overflow-y-auto p-6">
    <div class="max-w-3xl mx-auto">
      <div v-if="checking" class="flex items-center justify-center py-32">
        <UIcon name="i-lucide-loader-2" class="w-8 h-8 text-blue-500 animate-spin" />
      </div>

      <div v-else-if="!isAuthenticated || !roleOk" class="flex items-center justify-center py-32">
        <p class="text-gray-400 dark:text-gray-500 text-sm">请先以调解员身份登录</p>
      </div>

      <template v-else>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">设置</h1>

        <!-- 账号信息 -->
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 mb-6">
          <h2 class="text-base font-semibold text-gray-900 dark:text-white mb-4">账号信息</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">姓名</label>
              <UInput :model-value="user?.name || ''" disabled class="w-full" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">角色</label>
              <UInput :model-value="user?.role || ''" disabled class="w-full" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">用户名</label>
              <UInput :model-value="user?.username || ''" disabled class="w-full" />
            </div>
          </div>
        </div>

        <!-- 大模型配置 -->
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 mb-6">
          <h2 class="text-base font-semibold text-gray-900 dark:text-white mb-1">大模型配置</h2>
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">调解工作台 AI 助手接入的模型</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">服务商</label>
              <UInput v-model="aiProvider" class="w-full" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">模型</label>
              <USelect
                v-model="aiModel"
                :options="[
                  { label: 'deepseek-v4-flash', value: 'deepseek-v4-flash' },
                  { label: 'deepseek-v4-pro', value: 'deepseek-v4-pro' },
                ]"
                class="w-full"
              />
            </div>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <UButton color="primary" icon="i-lucide-check" @click="saveSettings">保存设置</UButton>
          <span v-if="saved" class="text-sm text-emerald-600 dark:text-emerald-400">已保存</span>
        </div>
      </template>
    </div>
  </div>
</template>
