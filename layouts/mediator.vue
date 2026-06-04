<script setup lang="ts">
const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const auth = useAuth()
const router = useRouter()

function toggleTheme() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}

async function handleLogout() {
  await auth.logout()
  router.push('/admin')
}

const route = useRoute()
const isLoginPage = computed(() => route.path === '/admin/login')
const showNavbar = computed(() => auth.isAuthenticated.value && !isLoginPage.value)
</script>

<template>
  <div class="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
    <!-- Top Navbar (hidden on login page and when not authenticated) -->
    <header v-if="showNavbar" class="h-12 shrink-0 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
      <div class="flex items-center gap-2.5">
        <UIcon name="i-lucide-scale" class="w-4 h-4 text-blue-500 dark:text-blue-400" />
        <span class="text-xl font-semibold text-gray-900 dark:text-white">全时在线的争议解决专家</span>
        <span class="text-xs text-gray-400 dark:text-gray-500 font-mono ml-2">Always Online Dispute Resolution Expert</span>
        <span class="text-xs text-gray-400 dark:text-gray-500 font-mono hidden sm:inline">mediator workspace</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-500 dark:text-gray-400">{{ auth.user.value?.name || '' }}</span>
        <button
          class="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          @click="toggleTheme"
        >
          <UIcon :name="isDark ? 'i-lucide-sun' : 'i-lucide-moon'" class="w-4 h-4" />
        </button>
        <UButton variant="ghost" color="neutral" size="md" icon="i-lucide-log-out" @click="handleLogout">
          登出
        </UButton>
      </div>
    </header>

    <!-- Content -->
    <slot />
  </div>
</template>
