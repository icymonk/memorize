<script setup lang="ts">
import 'vue-sonner/style.css'

useAppearance()
</script>

<template>
  <NuxtRouteAnnouncer />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <Sonner rich-colors position="top-center" />
  <AppDialogs />
</template>
