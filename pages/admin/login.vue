<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center px-4">
    <div class="w-full max-w-sm">
      <!-- Logo -->
      <div class="text-center mb-8">
        <div class="flex items-center justify-center gap-2.5 mb-3">
          <UIcon name="i-lucide-scale" class="w-6 h-6 text-[#1e3a5f] dark:text-gray-400" />
          <span class="text-3xl font-semibold text-gray-900 dark:text-white">全时在线的调解专家</span>
        </div>
        <p class="text-sm text-gray-500 dark:text-gray-400 font-mono">Always Online Mediation Expert</p>
        <p class="text-sm text-gray-500 dark:text-gray-400 font-mono mt-1">mediator sign in</p>
      </div>

      <!-- Login Card -->
      <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 shadow-sm dark:shadow-none">
        <form @submit.prevent="handleLogin" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">用户名</label>
            <UInput
              v-model="username"
              placeholder="请输入拼音用户名"
              icon="i-lucide-user"
              size="lg"
              :disabled="loading"
              autocomplete="username"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">密码</label>
            <UInput
              v-model="password"
              type="password"
              placeholder="请输入密码"
              icon="i-lucide-lock"
              size="lg"
              :disabled="loading"
              autocomplete="current-password"
            />
          </div>

          <UAlert
            v-if="errorMessage"
            color="error"
            variant="soft"
            :title="errorMessage"
          />

          <UButton
            type="submit"
            block
            size="xl"
            :loading="loading"
            :disabled="!username.trim() || !password.trim()"
            class="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100"
          >
            登录
          </UButton>
        </form>
      </div>

      <div class="text-center mt-6">
        <UButton
          variant="ghost"
          color="neutral"
          icon="i-lucide-arrow-left"
          size="lg"
          @click="navigateTo('/')"
        >
          返回首页
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({})

const router = useRouter()
const auth = useAuth()

const username = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref('')

async function handleLogin() {
  errorMessage.value = ''
  loading.value = true

  try {
    await auth.login(username.value.trim(), password.value)
    router.push('/admin')
  }
  catch (err: any) {
    errorMessage.value = err.message || '登录失败，请检查用户名和密码'
  }
  finally {
    loading.value = false
  }
}
</script>
