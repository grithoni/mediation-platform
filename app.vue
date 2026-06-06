<script setup lang="ts">
const config = useRuntimeConfig()
const appMode = config.public.appMode as 'party' | 'mediator'
const layout = appMode === 'mediator' ? 'mediator' : 'party'

// Sync colorMode to <html> class so Tailwind's `dark:` variants work
const colorMode = useColorMode()
useHead({
  htmlAttrs: {
    class: () => colorMode.value === 'dark' ? 'dark' : '',
  },
})
</script>

<template>
  <UApp>
    <NuxtLayout :name="layout">
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
