<script setup lang="ts">
const config = useRuntimeConfig()
const appMode = config.public.appMode as 'party' | 'mediator'
const layout = appMode === 'mediator' ? 'mediator' : 'party'
</script>

<template>
  <UApp>
    <NuxtLayout :name="layout">
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
