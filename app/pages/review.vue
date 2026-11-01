<script setup lang="ts">
import { useStudySettings } from '~/features/vocab/composables/useStudySettings'
import type { ModeResult, ReviewItem } from '~/features/vocab/components/study/types'
import { endOfToday } from '#shared/srs'
import { toast } from 'vue-sonner'
import ReviewResult from '~/features/vocab/components/study/ReviewResult.vue'
import ReviewSession from '~/features/vocab/components/study/ReviewSession.vue'
import { attachCards, listAllDueStates } from '~/features/vocab/services/srs'
import { recordSession } from '~/features/vocab/services/study'
import { ko } from '~/locales/ko'

const studySettings = useStudySettings()

definePageMeta({ layout: 'focus' })

/** WS-53 전체 오늘의 복습: 내 공간 + 모든 워크스페이스 */
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const items = ref<ReviewItem[]>([])
const loading = ref(true)
const result = ref<ModeResult | null>(null)
let startedAt = new Date()
const home = computed(() => auth.account ? `/s/${auth.account.personalSpaceId}/decks` : '/')

onMounted(async () => {
  try {
    await auth.ensureAccount()
    items.value = await attachCards($firestore, await listAllDueStates($firestore, auth.user!.uid, endOfToday(Date.now()), (await studySettings.load()).dailyReviewCards))
    startedAt = new Date()
  }
  finally {
    loading.value = false
  }
})

/** VOC-32 전체 복습 결과도 공간별로 기록한다 (활동 피드·학습일지 요약) */
async function onDone(r: ModeResult) {
  result.value = r
  const durationSec = (Date.now() - startedAt.getTime()) / 1000
  const missed = new Set(r.missed ?? [])
  const bySid = new Map<string, ReviewItem[]>()
  for (const i of items.value) bySid.set(i.sid, [...(bySid.get(i.sid) ?? []), i])
  try {
    await Promise.all([...bySid].map(([sid, list]) => recordSession($firestore, sid, auth.user!.uid, {
      mode: 'review',
      cards: list.length,
      correct: list.filter(i => !missed.has(i.card.id)).length,
      durationSec: durationSec * list.length / items.value.length,
      startedAt,
    })))
  }
  catch {
    toast.error(ko.vocab.study.saveFailed)
  }
}
</script>

<template>
  <Teleport v-if="!loading" to="#focus-header">
    <span v-if="!items.length || result" class="text-sm font-medium">{{ ko.vocab.review.allTitle }}</span>
  </Teleport>
  <div v-if="loading" class="text-muted-foreground p-10 text-center text-sm">
    …
  </div>
  <ReviewResult v-else-if="result" :result="result" :back="home" />
  <div v-else-if="!items.length" class="flex flex-col items-center gap-4 p-10 text-center">
    <p class="text-muted-foreground text-sm">
      {{ ko.vocab.review.empty }}
    </p>
    <Button variant="outline" as-child>
      <NuxtLink :to="home">
        {{ ko.vocab.study.result.back }}
      </NuxtLink>
    </Button>
  </div>
  <ReviewSession v-else :items="items" :uid="auth.user!.uid" @done="onDone" />
</template>
