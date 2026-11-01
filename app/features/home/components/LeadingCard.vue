<script setup lang="ts">
import type { LeadingMission } from '../services/leading'
import type { Page } from '~/features/notes/services/pages'
import { ko } from '~/locales/ko'
import { localYmd } from '../services/activities'
import { listFeedbackAsked, listLeadingMissions } from '../services/leading'
import { listGradingQueue } from '~/features/tests/services/attempts'

/** CMN-06: 내가 이끄는 것 — 내가 연 미션 현황, 검토 대기, 피드백 요청받은 글, 채점 대기 시험. 항목이 있을 때만 보인다 */
const props = defineProps<{ sid: string, missions: boolean, tests?: boolean }>()
const t = ko.home.leading
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const today = localYmd(new Date())
const ms = ref<LeadingMission[]>([])
const pages = ref<Page[]>([])
const grading = ref<{ id: string, title: string, pending: number }[]>([])

watch(() => [props.sid, props.missions, props.tests] as const, async ([sid, missionsOn, testsOn]) => {
  ms.value = []
  pages.value = []
  grading.value = []
  const uid = auth.user?.uid
  if (!uid) return
  const [m, p, g] = await Promise.all([
    missionsOn ? listLeadingMissions($firestore, sid, uid, today).catch(() => []) : [],
    listFeedbackAsked($firestore, sid, uid).catch(() => []),
    testsOn ? listGradingQueue($firestore, sid, uid).catch(() => []) : [],
  ])
  if (sid !== props.sid) return
  ms.value = m
  pages.value = p
  grading.value = g
}, { immediate: true })

const pending = computed(() => ms.value.reduce((n, x) => n + x.pending, 0))
const periodLabel = (p: string) => p === 'once' ? '' : p === today ? t.today : p
</script>

<template>
  <Card v-if="ms.length || pages.length || grading.length">
    <CardHeader>
      <CardTitle>{{ t.title }}</CardTitle>
      <CardDescription>{{ t.summary(pending, pages.length, grading.reduce((n, x) => n + x.pending, 0)) }}</CardDescription>
    </CardHeader>
    <CardFooter class="block space-y-4">
      <ul v-if="ms.length" class="divide-y" :aria-label="t.missions">
        <li v-for="x in ms" :key="x.mission.id" class="flex flex-wrap items-center gap-2 py-2 text-sm">
          <NuxtLink :to="`/s/${sid}/missions/${x.mission.id}`" class="min-w-0 flex-1 truncate font-medium hover:underline">
            {{ x.mission.title }}
          </NuxtLink>
          <span v-if="x.host && x.period" class="text-muted-foreground text-xs">
            {{ t.progress(periodLabel(x.period), x.done, x.total) }}
          </span>
          <span v-else-if="x.host" class="text-muted-foreground text-xs">{{ t.notStarted }}</span>
          <Badge v-if="x.pending" variant="secondary">
            {{ t.pending(x.pending) }}
          </Badge>
        </li>
      </ul>
      <div v-if="grading.length" class="space-y-1">
        <p class="text-sm font-medium">
          {{ t.grading }}
        </p>
        <ul class="space-y-1">
          <li v-for="g in grading" :key="g.id" class="flex items-center gap-2 text-sm">
            <NuxtLink :to="`/s/${sid}/tests/${g.id}`" class="min-w-0 flex-1 truncate hover:underline">{{ g.title }}</NuxtLink>
            <Badge variant="secondary">{{ ko.exams.grade.needsGrading(g.pending) }}</Badge>
          </li>
        </ul>
      </div>
      <div v-if="pages.length" class="space-y-1">
        <p class="text-sm font-medium">
          {{ t.feedback }}
        </p>
        <ul class="space-y-1">
          <li v-for="p in pages" :key="p.id" class="text-sm">
            <NuxtLink :to="`/s/${sid}/notes/${p.id}`" class="hover:underline">
              {{ p.icon ? `${p.icon} ` : '' }}{{ p.title || t.untitled }}
            </NuxtLink>
          </li>
        </ul>
      </div>
    </CardFooter>
  </Card>
</template>
