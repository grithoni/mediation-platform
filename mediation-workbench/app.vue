<script setup lang="ts">
const route = useRoute()
const layout = computed(() => {
  // /mediator routes use the mediator layout, everything else uses the party layout
  return route.path.startsWith('/mediator') ? 'mediator' : 'party'
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
