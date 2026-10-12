<script setup lang="ts">
import type { ModeResult } from './types'
import { ko } from '~/locales/ko'

const props = defineProps<{ result: ModeResult, back: string }>()
const t = ko.vocab.study
const accuracy = computed(() => props.result.cards ? Math.round(props.result.correct / props.result.cards * 100) : 0)
</script>

<template>
  <div class="mx-auto flex w-full max-w-md flex-col gap-6 p-6 text-center">
    <h1 class="text-2xl font-semibold">
      {{ t.result.title }}
    </h1>
    <dl class="grid grid-cols-2 gap-2">
      <div class="rounded-xl border p-3">
        <dt class="text-muted-foreground text-xs">
          {{ t.result.cards }}
        </dt>
        <dd class="text-xl font-semibold tabular-nums">
          {{ result.cards }}
        </dd>
      </div>
      <div class="rounded-xl border p-3">
        <dt class="text-muted-foreground text-xs">
          {{ t.result.accuracy }}
        </dt>
        <dd class="text-xl font-semibold tabular-nums">
          {{ accuracy }}%
        </dd>
      </div>
    </dl>
    <Button as-child>
      <NuxtLink :to="back">
        {{ t.result.back }}
      </NuxtLink>
    </Button>
  </div>
</template>
