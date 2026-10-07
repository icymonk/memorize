<script setup lang="ts">
import { ko } from '~/locales/ko'
</script>

<template>
  <div class="bg-muted/40 flex min-h-svh flex-col items-center justify-center gap-6 p-6">
    <NuxtLink to="/" class="text-lg font-semibold tracking-tight">
      {{ ko.app.name }}
    </NuxtLink>
    <div class="w-full max-w-sm">
      <slot />
    </div>
  </div>
</template>
