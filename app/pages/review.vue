<script setup lang="ts">
import type { ModeResult, ReviewItem } from '~/features/vocab/components/study/types'
import { DAILY_LIMITS, endOfToday } from '#shared/srs'
import ReviewResult from '~/features/vocab/components/study/ReviewResult.vue'
import ReviewSession from '~/features/vocab/components/study/ReviewSession.vue'
import { attachCards, listAllDueStates } from '~/features/vocab/services/srs'
import { ko } from '~/locales/ko'

definePageMeta({ layout: 'focus' })

/** WS-53 전체 오늘의 복습: 내 공간 + 모든 워크스페이스 */
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const items = ref<ReviewItem[]>([])
const loading = ref(true)
const result = ref<ModeResult | null>(null)
const home = computed(() => auth.account ? `/s/${auth.account.personalSpaceId}` : '/')

onMounted(async () => {
  try {
    await auth.ensureAccount()
    items.value = await attachCards($firestore, await listAllDueStates($firestore, auth.user!.uid, endOfToday(Date.now()), DAILY_LIMITS.reviewCards))
  }
  finally {
    loading.value = false
  }
})
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
  <ReviewSession v-else :items="items" :uid="auth.user!.uid" @done="result = $event" />
</template>
