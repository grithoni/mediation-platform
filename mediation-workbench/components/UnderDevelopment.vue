<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4 pt-20">
    <div class="text-center max-w-lg">
      <div class="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-800/30 flex items-center justify-center mb-6">
        <UIcon name="i-lucide-wrench" class="w-9 h-9 text-blue-500 dark:text-blue-400" />
      </div>
      <h1 class="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mb-3">{{ title }}</h1>
      <p class="text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
        我们正在全力建设中，敬请期待...
      </p>
      <p class="text-xs text-gray-400 dark:text-gray-500 font-mono mb-8">
        如需了解更多信息，请通过"联系我们"页面与我们取得联系
      </p>
      <div class="flex items-center justify-center gap-3">
        <NuxtLink
          to="/"
          class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <UIcon name="i-lucide-home" class="w-4 h-4" />
          返回首页
        </NuxtLink>
        <NuxtLink
          to="/contact"
          class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition-colors"
        >
          <UIcon name="i-lucide-mail" class="w-4 h-4" />
          联系我们
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
