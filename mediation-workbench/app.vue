<script setup lang="ts">
const route = useRoute()
const layout = computed(() => {
  // All routes use the party layout (mediator/admin workspaces removed)
  return 'party'
})

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
