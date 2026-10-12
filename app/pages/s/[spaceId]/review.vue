<script setup lang="ts">
import type { ModeResult, ReviewItem } from '~/features/vocab/components/study/types'
import { DAILY_LIMITS, endOfToday } from '#shared/srs'
import { toast } from 'vue-sonner'
import ReviewResult from '~/features/vocab/components/study/ReviewResult.vue'
import ReviewSession from '~/features/vocab/components/study/ReviewSession.vue'
import { attachCards, listDueStates } from '~/features/vocab/services/srs'
import { recordSession } from '~/features/vocab/services/study'
import { ko } from '~/locales/ko'

definePageMeta({ layout: 'focus' })

/** VOC-44 이 공간의 오늘의 복습 */
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const sid = computed(() => space.current!.id)
const uid = computed(() => auth.user!.uid)
const items = ref<ReviewItem[]>([])
const loading = ref(true)
const result = ref<ModeResult | null>(null)
const startedAt = new Date()

onMounted(async () => {
  try {
    items.value = await attachCards($firestore, await listDueStates($firestore, sid.value, uid.value, endOfToday(Date.now()), DAILY_LIMITS.reviewCards))
  }
  finally {
    loading.value = false
  }
})

async function onDone(r: ModeResult) {
  result.value = r
  await recordSession($firestore, sid.value, uid.value, { mode: 'review', cards: r.cards, correct: r.correct, durationSec: (Date.now() - startedAt.getTime()) / 1000, startedAt })
    .catch(() => toast.error(ko.vocab.study.saveFailed))
}
</script>

<template>
  <Teleport v-if="!loading" to="#focus-header">
    <span v-if="!items.length || result" class="text-sm font-medium">{{ ko.vocab.review.title }}</span>
  </Teleport>
  <div v-if="loading" class="text-muted-foreground p-10 text-center text-sm">
    …
  </div>
  <ReviewResult v-else-if="result" :result="result" :back="`/s/${sid}/decks`" />
  <div v-else-if="!items.length" class="flex flex-col items-center gap-4 p-10 text-center">
    <p class="text-muted-foreground text-sm">
      {{ ko.vocab.review.empty }}
    </p>
    <Button variant="outline" as-child>
      <NuxtLink :to="`/s/${sid}/decks`">
        {{ ko.vocab.study.result.back }}
      </NuxtLink>
    </Button>
  </div>
  <ReviewSession v-else :items="items" :uid="uid" @done="onDone" />
</template>
