<script setup lang="ts">
import type { ReadingStats } from '#shared/reading'
import { BOOK_FORMATS } from '#shared/schemas/book'
import { readingStats } from '#shared/reading'
import { localYmd } from '~/features/home/services/activities'
import { cn } from '~/lib/utils'
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
