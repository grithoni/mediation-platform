<script setup lang="ts">
const config = useRuntimeConfig()
const appMode = config.public.appMode as 'party' | 'mediator'
const layout = appMode === 'mediator' ? 'mediator' : 'party'

// Sync colorMode to <html> class so Tailwind's `dark:` variants work.
// Direct DOM manipulation is more reliable than useHead because
// @nuxtjs/color-mode also sets the html class and may conflict.
const colorMode = useColorMode()
if (import.meta.client) {
  watchEffect(() => {
    document.documentElement.classList.toggle('dark', colorMode.value === 'dark')
  })
}
</script>

<template>
  <UApp>
    <NuxtLayout :name="layout">
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
