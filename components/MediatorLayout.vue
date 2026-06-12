<script setup lang="ts">
const { user, logout, isLoading } = useAuth()
</script>

<template>
  <div class="min-h-screen flex flex-col bg-white dark:bg-gray-950">
    <!-- Top Navbar -->
    <header class="sticky top-0 z-40 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-12">
          <!-- Logo / Platform Name -->
          <div class="flex items-center gap-2.5">
            <UIcon name="i-lucide-scale" class="w-5 h-5 text-[#1e3a5f] dark:text-gray-400" />
            <span class="text-base font-semibold text-gray-900 dark:text-white">全时在线的纠纷解决专家</span>
            <span class="text-xs font-mono text-gray-400 dark:text-gray-500 hidden sm:inline">admin</span>
          </div>

          <!-- User info + Logout -->
          <div class="flex items-center gap-3">
            <div v-if="user" class="hidden sm:flex flex-col items-end">
              <span class="text-sm font-medium text-gray-700 dark:text-gray-200">{{ user.name }}</span>
              <span class="text-xs text-gray-400 dark:text-gray-500 font-mono">{{ user.username }}</span>
            </div>
            <UAvatar
              v-if="user"
              :alt="user.name"
              size="xs"
              class="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            />
            <UButton
              label="退出"
              icon="i-lucide-log-out"
              variant="ghost"
              color="neutral"
              size="md"
              :loading="isLoading"
              @click="logout"
            />
          </div>
        </div>
      </div>
    </header>

    <!-- Main content -->
    <main class="flex-1 bg-white dark:bg-gray-900">
      <slot />
    </main>
  </div>
</template>
