<script setup lang="ts">
import type { Grade } from '#shared/study'
import { ko } from '~/locales/ko'

defineProps<{ grade: Grade, answer: string, canOverride?: boolean }>()
const emit = defineEmits<{ next: [], override: [] }>()
const t = ko.vocab.study
</script>

<template>
  <div
    class="flex flex-col gap-3 rounded-xl border p-4"
    :class="grade === 'wrong' ? 'border-destructive/50 bg-destructive/5' : 'border-emerald-500/50 bg-emerald-500/5'"
  >
    <p class="text-sm font-medium">
      {{ grade === 'exact' ? t.correct : grade === 'typo' ? t.typo(answer) : t.wrong(answer) }}
    </p>
    <div class="flex justify-end gap-2">
      <Button v-if="canOverride && grade === 'wrong'" variant="outline" size="sm" @click="emit('override')">
        {{ t.override }}
      </Button>
      <Button size="sm" autofocus @click="emit('next')">
        {{ t.continue }}
      </Button>
    </div>
  </div>
</template>
