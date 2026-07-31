<script setup lang="ts">
// 调解员工作台布局（顶部导航栏）
const colorMode = useColorMode()
const isDark = computed({
  get: () => colorMode.value === 'dark',
  set: (v) => { colorMode.preference = v ? 'dark' : 'light' },
})

function toggleTheme() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}

const { user, logout } = useAuth()
const router = useRouter()
const route = useRoute()

const navItems = [
  { key: 'cases', icon: 'i-lucide-folder-open', label: '案件管理', to: '/mediator' },
  { key: 'guide', icon: 'i-lucide-book-open', label: '调解指引', to: '/mediator/guide' },
]

async function handleLogout() {
  await logout()
  await navigateTo('/mediator')
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
    <!-- Top Navigation Bar -->
    <header class="shrink-0 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div class="h-14 px-4 flex items-center justify-between">
        <!-- Brand + Nav -->
        <div class="flex items-center gap-6">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-scale" class="w-5 h-5 text-blue-500 dark:text-blue-400" />
            <span class="text-lg font-bold text-gray-900 dark:text-white">调解员工作台</span>
            <span class="text-xs text-gray-400 dark:text-gray-500 font-mono hidden sm:inline">Mediator Console</span>
          </div>

          <!-- Nav Menu -->
          <nav class="flex items-center gap-1">
            <NuxtLink
              v-for="item in navItems"
              :key="item.key"
              :to="item.to"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors"
              :class="route.path === item.to
                ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'"
            >
              <UIcon :name="item.icon" class="w-4 h-4" />
              <span>{{ item.label }}</span>
            </NuxtLink>
          </nav>
        </div>

        <!-- User Area -->
        <div class="flex items-center gap-3">
          <button
            class="p-1.5 rounded-md text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
            @click="toggleTheme"
          >
            <UIcon :name="isDark ? 'i-lucide-sun' : 'i-lucide-moon'" class="w-4 h-4" />
          </button>
          <template v-if="user">
            <div class="flex items-center gap-2">
              <div class="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-semibold">
                {{ (user.name || user.username || 'M').slice(0, 1) }}
              </div>
              <div class="hidden sm:block">
                <div class="text-sm font-medium text-gray-900 dark:text-white leading-tight">{{ user.name }}</div>
                <div class="text-xs text-gray-400 dark:text-gray-500 leading-tight">{{ user.role }}</div>
              </div>
            </div>
            <button
              class="px-2.5 py-1.5 rounded-md text-xs text-gray-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
              @click="handleLogout"
            >
              退出
            </button>
          </template>
          <NuxtLink
            to="/mediator"
            class="px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            登录
          </NuxtLink>
        </div>
      </div>
    </header>

    <!-- Content -->
    <main class="flex-1 min-w-0 p-6">
      <slot />
    </main>
  </div>
</template>
