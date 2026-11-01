<script setup lang="ts">
import type { ReadingStats } from '#shared/reading'
import { BOOK_FORMATS } from '#shared/schemas/book'
import { readingStats } from '#shared/reading'
import { localYmd } from '~/features/home/services/activities'
import { cn } from '~/lib/utils'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { toast } from 'vue-sonner'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'
import { listMyLogs } from '../services/logs'
import { listMyShelf } from '../services/shelf'

/** READ-50: 내 독서 통계 */
const props = defineProps<{ sid: string }>()
const t = ko.reading.stats
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const WEEKS = 12
const year = new Date().getFullYear()
const today = localYmd(new Date())
const stats = ref<ReadingStats | null>(null)

async function load() {
  const [shelf, logs] = await Promise.all([listMyShelf($firestore, props.sid, auth.user!.uid), listMyLogs($firestore, props.sid, auth.user!.uid)])
  stats.value = readingStats(shelf, logs, year)
}
watch(() => props.sid, () => load().catch(() => {}), { immediate: true })

// READ-51 연간 목표 (users/{uid}.readingGoal). 달성은 내 공간과 모든 워크스페이스의 올해 완독을 합친다
const goal = ref<number | null>(null)
const goalDraft = ref<number | null>(null)
const editingGoal = ref(false)
const doneThisYear = ref<number | null>(null)
async function loadGoal() {
  const uid = auth.user!.uid
  const snap = await getDoc(doc($firestore, 'users', uid))
  const g = snap.get('readingGoal') as { year?: number, books?: number } | undefined
  goal.value = g?.year === year && typeof g.books === 'number' ? g.books : null
  const sids = [...new Set([`p_${uid}`, ...((snap.get('spaceIds') as string[] | undefined) ?? [])])]
  const shelves = await Promise.all(sids.map(s => listMyShelf($firestore, s, uid).catch(() => [])))
  doneThisYear.value = new Set(shelves.flat().filter(b => b.status === 'done' && b.finishedAt?.startsWith(`${year}-`)).map(b => b.bookKey)).size
}
onMounted(() => loadGoal().catch(() => {}))
function editGoal() {
  goalDraft.value = goal.value ?? 12
  editingGoal.value = true
}
async function saveGoal() {
  const n = Math.round(Number(goalDraft.value))
  if (!(n >= 1 && n <= 365)) {
    toast.error(t.goal.invalid)
    return
  }
  try {
    await updateDoc(doc($firestore, 'users', auth.user!.uid), { readingGoal: { year, books: n } })
    goal.value = n
    editingGoal.value = false
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
}

const days = computed(() => {
  const end = new Date()
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - end.getDay() - (WEEKS - 1) * 7)
  return Array.from({ length: WEEKS * 7 }, (_, i) => localYmd(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)))
})
const maxMonth = computed(() => Math.max(1, ...(stats.value?.finishedByMonth ?? [])))
function level(d: string) {
  const m = stats.value?.minutesByDay[d]
  if (m === undefined) return 'bg-muted'
  return m >= 30 ? 'bg-primary' : m >= 10 ? 'bg-primary/70' : 'bg-primary/40'
}
</script>

<template>
  <p v-if="!stats" class="text-muted-foreground text-sm">
    …
  </p>
  <div v-else class="flex flex-col gap-6">
    <section class="flex flex-col gap-2 rounded-lg border p-3" data-testid="reading-goal">
      <div class="flex items-center justify-between gap-2">
        <h2 class="font-medium">
          {{ goal ? t.goal.title(year, goal) : t.goal.none(year) }}
        </h2>
        <Button v-if="!editingGoal" size="sm" variant="outline" @click="editGoal">
          {{ goal ? t.goal.edit : t.goal.set }}
        </Button>
      </div>
      <form v-if="editingGoal" class="flex items-center gap-2" @submit.prevent="saveGoal">
        <Input type="number" min="1" max="365" class="w-24" :aria-label="t.goal.books" :model-value="goalDraft ?? undefined" @update:model-value="v => goalDraft = Number(v)" />
        <span class="text-sm">{{ t.goal.unit }}</span>
        <Button type="submit" size="sm">
          {{ t.goal.save }}
        </Button>
        <Button type="button" size="sm" variant="ghost" @click="editingGoal = false">
          {{ t.goal.cancel }}
        </Button>
      </form>
      <template v-if="goal && doneThisYear != null">
        <div class="bg-muted h-2 overflow-hidden rounded-full">
          <div class="bg-primary h-full" :style="{ width: `${Math.min(100, (doneThisYear / goal) * 100)}%` }" />
        </div>
        <p class="text-muted-foreground text-xs">
          {{ t.goal.progress(doneThisYear, goal) }}
        </p>
      </template>
    </section>
    <section class="flex flex-col gap-2">
      <h2 class="font-medium">
        {{ t.finished(year, stats.finished) }}
      </h2>
      <div class="flex h-28 items-end gap-1.5">
        <div v-for="(n, i) in stats.finishedByMonth" :key="i" class="flex flex-1 flex-col items-center gap-1">
          <span class="text-muted-foreground text-[10px] tabular-nums">{{ n || '' }}</span>
          <div class="bg-primary/70 w-full rounded-sm" :style="{ height: `${(n / maxMonth) * 72}px` }" />
          <span class="text-muted-foreground text-[10px]">{{ t.month(i + 1) }}</span>
        </div>
      </div>
    </section>
    <dl class="grid grid-cols-3 gap-3 text-sm">
      <div class="rounded-lg border p-3">
        <dt class="text-muted-foreground text-xs">
          {{ t.pages }}
        </dt>
        <dd class="text-lg font-semibold">
          {{ t.pagesValue(stats.pages) }}
        </dd>
      </div>
      <div class="rounded-lg border p-3">
        <dt class="text-muted-foreground text-xs">
          {{ t.minutes }}
        </dt>
        <dd class="text-lg font-semibold">
          {{ t.minutesValue(stats.minutes) }}
        </dd>
      </div>
      <div class="rounded-lg border p-3">
        <dt class="text-muted-foreground text-xs">
          {{ t.avg }}
        </dt>
        <dd class="text-lg font-semibold">
          {{ t.minutesValue(stats.avgMinutes) }}
        </dd>
      </div>
    </dl>
    <section class="flex flex-col gap-2">
      <h2 class="text-sm font-medium">
        {{ t.calendar(WEEKS) }}
      </h2>
      <div class="grid w-fit grid-flow-col grid-rows-7 gap-0.5" role="img" :aria-label="t.calendar(WEEKS)">
        <span v-for="d in days" :key="d" :title="`${d} · ${t.minutesValue(stats.minutesByDay[d] ?? 0)}`" :class="cn('size-3 rounded-[2px]', level(d), d > today && 'opacity-0')" />
      </div>
    </section>
    <section class="flex flex-col gap-2">
      <h2 class="text-sm font-medium">
        {{ t.formats }}
      </h2>
      <p class="text-muted-foreground flex gap-4 text-sm">
        <span v-for="f in BOOK_FORMATS" :key="f">{{ ko.reading.formats[f] }} {{ t.count(stats.formats[f]) }}</span>
      </p>
    </section>
  </div>
</template>
