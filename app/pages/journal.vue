<script setup lang="ts">
import type { MyJournal } from '~/features/notes/services/journal'
import { ChevronLeftIcon, ChevronRightIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { bundleMarkdown, downloadText, journalsInRange, printUrl } from '~/features/notes/services/exportPages'
import { listMyJournals } from '~/features/notes/services/journal'
import { errorMessage } from '~/lib/errors'
import { cn } from '~/lib/utils'
import { ko } from '~/locales/ko'

definePageMeta({ layout: 'focus' })

/** NOTE-39 내 일지 모아 보기: 모든 공간의 내 일지를 한 달력에. 나만 본다 */
const t = ko.notes.journal
const week = ko.notes.collections.week
const auth = useAuthStore()
const space = useSpaceStore()
const { $firestore } = useNuxtApp()
const all = ref<MyJournal[]>([])
const loading = ref(true)
const off = ref(new Set<string>())
const month = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayYmd = ymd(new Date())
const COLORS = ['bg-sky-100 text-sky-900', 'bg-amber-100 text-amber-900', 'bg-emerald-100 text-emerald-900', 'bg-rose-100 text-rose-900', 'bg-violet-100 text-violet-900', 'bg-lime-100 text-lime-900']
const mySpaces = computed(() => space.spaces.filter(s => !s.deleteScheduledAt && all.value.some(j => j.sid === s.id)))
const colorOf = (sid: string) => COLORS[Math.max(0, space.spaces.findIndex(s => s.id === sid)) % COLORS.length]
const spaceOf = (sid: string) => space.spaces.find(s => s.id === sid)
const byDay = computed(() => {
  const map = new Map<string, MyJournal[]>()
  for (const j of all.value) {
    if (!j.date || off.value.has(j.sid) || !spaceOf(j.sid)) continue
    map.set(j.date, [...(map.get(j.date) ?? []), j])
  }
  return map
})
const days = computed(() => {
  const first = month.value
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay() + i)
    return { ymd: ymd(d), day: d.getDate(), inMonth: d.getMonth() === first.getMonth() }
  })
})
const shiftMonth = (n: number) => { month.value = new Date(month.value.getFullYear(), month.value.getMonth() + n, 1) }
function toggle(sid: string) {
  const next = new Set(off.value)
  if (next.has(sid)) next.delete(sid)
  else next.add(sid)
  off.value = next
}

/** NOTE-71 일지 묶어 내보내기: 기본 기간은 보고 있는 달 */
const ex = ko.notes.export
const monthEnd = (m: Date) => ymd(new Date(m.getFullYear(), m.getMonth() + 1, 0))
const from = ref(ymd(month.value))
const to = ref(monthEnd(month.value))
watch(month, (m) => { from.value = ymd(m); to.value = monthEnd(m) })
const picked = computed(() => journalsInRange(all.value.filter(j => !off.value.has(j.sid) && spaceOf(j.sid)), from.value, to.value))
const bundling = ref(false)
async function bundleMd() {
  bundling.value = true
  try { downloadText(`${ex.file}-${from.value}~${to.value}.md`, await bundleMarkdown($firestore, picked.value)) }
  catch (error) { toast.error(errorMessage(error) ?? ko.errors.unknown) }
  finally { bundling.value = false }
}
const bundlePdf = () => window.open(printUrl(picked.value), '_blank')

onMounted(async () => {
  try {
    await auth.ensureAccount()
    const [list] = await Promise.all([listMyJournals($firestore, auth.user!.uid), space.loadMySpaces()])
    all.value = list
  }
  catch (error) { toast.error(errorMessage(error) ?? ko.errors.unknown) }
  finally { loading.value = false }
})
</script>

<template>
  <Teleport to="#focus-header">
    <span class="text-sm font-medium">{{ t.mine }}</span>
  </Teleport>
  <div class="mx-auto flex w-full max-w-5xl flex-col gap-3 p-4">
    <p class="text-muted-foreground text-xs">
      {{ t.mineHint }}
    </p>
    <div v-if="mySpaces.length > 1" class="flex flex-wrap gap-2" role="group" :aria-label="t.filter">
      <button
        v-for="s in mySpaces"
        :key="s.id"
        type="button"
        :aria-pressed="!off.has(s.id)"
        :class="cn('rounded-full px-3 py-1 text-xs', colorOf(s.id), off.has(s.id) && 'opacity-40')"
        @click="toggle(s.id)"
      >
        {{ s.icon }} {{ s.name }}
      </button>
    </div>
    <div class="flex items-center gap-2">
      <Button size="icon" variant="ghost" :aria-label="ko.notes.collections.prevMonth" @click="shiftMonth(-1)">
        <ChevronLeftIcon />
      </Button>
      <span class="min-w-28 text-center font-medium">{{ month.getFullYear() }}. {{ month.getMonth() + 1 }}</span>
      <Button size="icon" variant="ghost" :aria-label="ko.notes.collections.nextMonth" @click="shiftMonth(1)">
        <ChevronRightIcon />
      </Button>
    </div>
    <p v-if="loading" class="text-muted-foreground py-10 text-center text-sm">
      …
    </p>
    <p v-else-if="!all.length" class="text-muted-foreground py-10 text-center text-sm">
      {{ t.noJournals }}
    </p>
    <div v-else class="grid grid-cols-7 overflow-hidden rounded-lg border text-sm">
      <div v-for="w in week" :key="w" class="bg-muted/50 text-muted-foreground border-b px-2 py-1 text-xs">
        {{ w }}
      </div>
      <div v-for="d in days" :key="d.ymd" :class="cn('flex min-h-24 flex-col gap-1 border-b border-r p-1', !d.inMonth && 'bg-muted/30 text-muted-foreground')">
        <span :class="cn('w-6 rounded-full text-center text-xs', d.ymd === todayYmd && 'bg-primary text-primary-foreground')">{{ d.day }}</span>
        <NuxtLink
          v-for="j in byDay.get(d.ymd) ?? []"
          :key="`${j.sid}/${j.id}`"
          :to="`/s/${j.sid}/notes/${j.id}`"
          :title="spaceOf(j.sid)?.name"
          :class="cn('truncate rounded px-1.5 py-0.5 text-xs hover:opacity-80', colorOf(j.sid))"
        >
          {{ j.mood ?? j.icon }} {{ j.title || ko.notes.untitled }}
        </NuxtLink>
      </div>
    </div>
    <section v-if="all.length" class="flex flex-wrap items-end gap-2 rounded-lg border p-3" data-testid="journal-bundle">
      <div class="w-full">
        <h2 class="text-sm font-medium">
          {{ ex.bundle }}
        </h2>
        <p class="text-muted-foreground text-xs">
          {{ ex.bundleHint }}
        </p>
      </div>
      <label class="flex flex-col gap-1 text-xs">
        {{ ex.from }}
        <Input v-model="from" type="date" class="h-8 w-40" />
      </label>
      <label class="flex flex-col gap-1 text-xs">
        {{ ex.to }}
        <Input v-model="to" type="date" class="h-8 w-40" />
      </label>
      <span class="text-muted-foreground pb-2 text-xs">{{ ex.count(picked.length) }}</span>
      <Button size="sm" variant="outline" :disabled="!picked.length || bundling" @click="bundleMd">
        {{ ex.markdown }}
      </Button>
      <Button size="sm" variant="outline" :disabled="!picked.length" @click="bundlePdf">
        {{ ex.pdf }}
      </Button>
    </section>
  </div>
</template>
