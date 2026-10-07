<script setup lang="ts">
import { XIcon } from '@lucide/vue'

const router = useRouter()
</script>

<template>
  <div class="flex min-h-svh flex-col">
    <header class="flex h-12 items-center px-3">
      <Button variant="ghost" size="icon" aria-label="나가기" @click="router.back()">
        <XIcon />
      </Button>
      <div id="focus-header" class="flex flex-1 items-center justify-center" />
      <div class="size-9" />
    </header>
    <main class="flex flex-1 flex-col">
      <slot />
    </main>
  </div>
</template>
