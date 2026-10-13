<script setup lang="ts">
import type { Activity } from '../services/activities'
import { journalStreak } from '#shared/journal'
import { listMembers } from '~/features/space/services/invites'
import { listMyJournals } from '~/features/notes/services/journal'
import { cn } from '~/lib/utils'
import { ko } from '~/locales/ko'
import { listMySessionsSince, localYmd, watchFeed } from '../services/activities'
import ActivityList from './ActivityList.vue'

/** CMN-02·03·04: 오늘의 학습일지, 나의 기록(연속 학습일·이번 주 학습 시간·학습 잔디), 활동 피드 미리보기 */
const props = defineProps<{ sid: string, personal: boolean, notes: boolean }>()
const t = ko.home
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const WEEKS = 12
const today = localYmd(new Date())
const journalId = ref<string | null>(null)
const journalLoaded = ref(false)
const minutesByDay = ref<Record<string, number>>({})
const feed = ref<Activity[]>([])
const names = ref<Record<string, string>>({})
let stop: (() => void) | undefined

const days = computed(() => {
  const end = new Date()
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - end.getDay() - (WEEKS - 1) * 7)
  return Array.from({ length: WEEKS * 7 }, (_, i) => localYmd(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)))
})
const streak = computed(() => journalStreak(Object.keys(minutesByDay.value), today))
const weekMinutes = computed(() => days.value.slice(-7).reduce((n, d) => n + (minutesByDay.value[d] ?? 0), 0))
function level(d: string) {
  const m = minutesByDay.value[d]
  if (m === undefined) return 'bg-muted'
  return m >= 30 ? 'bg-primary' : m >= 10 ? 'bg-primary/70' : 'bg-primary/40'
}

watch(() => props.sid, async (sid) => {
  stop?.()
  feed.value = []
  journalId.value = null
  journalLoaded.value = false
  minutesByDay.value = {}
  const uid = auth.user?.uid
  if (!uid) return
  if (!props.personal) {
    stop = watchFeed($firestore, sid, 5, (l) => { feed.value = l }, () => {})
    listMembers($firestore, sid).then((ms) => { names.value = Object.fromEntries(ms.map(m => [m.uid, m.displayName])) }).catch(() => {})
  }
  if (props.notes) {
    listMyJournals($firestore, uid).then((list) => {
      journalId.value = list.find(j => j.sid === sid && j.date === today)?.id ?? null
      journalLoaded.value = true
    }).catch(() => { journalLoaded.value = true })
  }
  const sessions = await listMySessionsSince($firestore, sid, uid, new Date(`${days.value[0]}T00:00:00`)).catch(() => [])
  const map: Record<string, number> = {}
  for (const s of sessions) map[s.date] = (map[s.date] ?? 0) + s.minutes
  minutesByDay.value = map
}, { immediate: true })
onUnmounted(() => stop?.())
</script>

<template>
  <div class="grid gap-6 sm:grid-cols-2">
    <Card v-if="notes">
      <CardHeader>
        <CardTitle>{{ t.journal.title }}</CardTitle>
        <CardDescription>{{ !journalLoaded ? '' : journalId ? t.journal.done : t.journal.notYet }}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button v-if="journalLoaded" :variant="journalId ? 'outline' : 'default'" as-child>
          <NuxtLink :to="journalId ? `/s/${sid}/notes/${journalId}` : `/s/${sid}/journal`">
            {{ journalId ? t.journal.open : t.journal.write }}
          </NuxtLink>
        </Button>
      </CardFooter>
    </Card>
    <Card :class="cn(!notes && 'sm:col-span-2')">
      <CardHeader>
        <CardTitle>{{ t.record.title }}</CardTitle>
        <CardDescription>{{ t.record.summary(streak, weekMinutes) }}</CardDescription>
      </CardHeader>
      <CardFooter>
        <div class="grid grid-flow-col grid-rows-7 gap-0.5" role="img" :aria-label="t.record.grass(WEEKS)">
          <span v-for="d in days" :key="d" :title="`${d} · ${minutesByDay[d] ?? 0}${t.record.minutes}`" :class="cn('size-2.5 rounded-[2px]', level(d), d > today && 'opacity-0')" />
        </div>
      </CardFooter>
    </Card>
    <Card v-if="!personal" class="sm:col-span-2">
      <CardHeader class="flex flex-row items-center justify-between">
        <CardTitle>{{ t.feed.title }}</CardTitle>
        <NuxtLink :to="`/s/${sid}/feed`" class="text-muted-foreground text-sm hover:underline">
          {{ t.feed.more }}
        </NuxtLink>
      </CardHeader>
      <CardFooter class="block">
        <ActivityList v-if="feed.length" :sid="sid" :items="feed" :names="names" />
        <p v-else class="text-muted-foreground text-sm">
          {{ t.feed.empty }}
        </p>
      </CardFooter>
    </Card>
  </div>
</template>
