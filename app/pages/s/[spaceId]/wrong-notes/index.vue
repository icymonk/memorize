<script setup lang="ts">
import type { Timestamp } from 'firebase/firestore'
import { OFTEN_WRONG, RESOLVE_STREAK } from '#shared/wrong-notes'
import { BookXIcon, CheckIcon, RotateCcwIcon } from '@lucide/vue'
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { toast } from 'vue-sonner'
import MathText from '~/features/math/components/MathText.vue'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'

/** WRN-01·03·10·11·20~22 오답 노트: 오답/해결 탭, 종류·출처 필터, 정렬, 다시 풀기, 직접 해결·되돌리기 */
interface WrongNote {
  id: string
  refType: 'card' | 'question'
  refId: string
  sources: { type: 'deck' | 'test' | 'problemSet', id: string, name: string }[]
  wrongCount: number
  lastWrongAt?: Timestamp
  resolved: boolean
  consecutiveCorrect?: number
  snapshot: { front?: string, back?: string, prompt?: string }
}

const t = ko.wrongNotes
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()

if (!space.current?.modules?.wrongNotes) {
  await navigateTo(`/s/${space.current!.id}`, { replace: true })
}

const sid = computed(() => space.current!.id)
const notes = ref<WrongNote[]>([])
const loading = ref(true)
const failed = ref(false)
const tab = ref<'open' | 'resolved'>('open')
const kind = ref<'all' | 'card' | 'question'>('all')
const sort = ref<'recent' | 'count'>('recent')
const source = ref('_')
const picked = ref<string[]>([])
const busy = ref(false)

const srcKey = (s: WrongNote['sources'][number]) => `${s.type}:${s.id}`
const allSources = computed(() => {
  const m = new Map<string, WrongNote['sources'][number]>()
  for (const n of notes.value) for (const s of n.sources ?? []) m.set(srcKey(s), s)
  return [...m.entries()]
})
const shown = computed(() => notes.value
  .filter(n => (tab.value === 'resolved') === !!n.resolved && (kind.value === 'all' || n.refType === kind.value)
    && (source.value === '_' || (n.sources ?? []).some(s => srcKey(s) === source.value)))
  .sort((a, b) => sort.value === 'count'
    ? b.wrongCount - a.wrongCount || (b.lastWrongAt?.toMillis() ?? 0) - (a.lastWrongAt?.toMillis() ?? 0)
    : (b.lastWrongAt?.toMillis() ?? 0) - (a.lastWrongAt?.toMillis() ?? 0)))
watch([tab, kind, source], () => (picked.value = []))

async function load() {
  try {
    const snap = await getDocs(query(collection($firestore, 'spaces', sid.value, 'wrongNotes'), where('uid', '==', auth.user!.uid)))
    notes.value = snap.docs.map(d => ({ id: d.id, ...d.data() }) as WrongNote)
  }
  catch {
    failed.value = true
  }
  finally {
    loading.value = false
  }
}
onMounted(load)

const day = (ts?: Timestamp) => (ts ? ts.toDate().toLocaleDateString('ko-KR') : '')
const sourceLink = (s: WrongNote['sources'][number]) =>
  s.type === 'deck' ? `/s/${sid.value}/decks/${s.id}` : s.type === 'test' ? `/s/${sid.value}/tests/${s.id}` : `/s/${sid.value}/math/${s.id}`
const toggle = (id: string, on: boolean) => (picked.value = on ? [...picked.value, id] : picked.value.filter(x => x !== id))
const retryIds = computed(() => (picked.value.length ? picked.value : shown.value.map(n => n.id)).slice(0, 50))
const retry = () => navigateTo({ path: `/s/${sid.value}/wrong-notes/retry`, query: { ids: retryIds.value.join(',') } })

async function setResolved(n: WrongNote, resolved: boolean) {
  busy.value = true
  try {
    await updateDoc(doc($firestore, 'spaces', sid.value, 'wrongNotes', n.id), { resolved, resolvedAt: resolved ? serverTimestamp() : null, consecutiveCorrect: 0 })
    n.resolved = resolved
    n.consecutiveCorrect = 0
    toast.success(resolved ? t.resolvedToast : t.unresolvedToast)
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
    <div class="flex flex-col gap-1">
      <h1 class="flex items-center gap-2 text-xl font-semibold"><BookXIcon class="size-5" /> {{ t.title }}</h1>
      <p class="text-muted-foreground text-sm">{{ t.intro }}</p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <div class="flex gap-1" role="tablist">
        <Button v-for="k in (['open', 'resolved'] as const)" :key="k" size="sm" role="tab" :aria-selected="tab === k" :variant="tab === k ? 'default' : 'outline'" @click="tab = k">{{ t.tabs[k] }}</Button>
      </div>
      <div class="flex gap-1">
        <Button v-for="k in (['all', 'card', 'question'] as const)" :key="k" size="sm" :variant="kind === k ? 'secondary' : 'ghost'" @click="kind = k">{{ t.kinds[k] }}</Button>
      </div>
      <Select v-model="sort">
        <SelectTrigger class="h-8 w-32" :aria-label="t.sort.recent"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="recent">{{ t.sort.recent }}</SelectItem>
          <SelectItem value="count">{{ t.sort.count }}</SelectItem>
        </SelectContent>
      </Select>
      <Select v-if="allSources.length" v-model="source">
        <SelectTrigger class="h-8 w-44" :aria-label="t.allSources"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="_">{{ t.allSources }}</SelectItem>
          <SelectItem v-for="[k, s] in allSources" :key="k" :value="k">{{ t.sources[s.type] }} {{ s.name }}</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <Skeleton v-if="loading" class="h-24 w-full" />
    <p v-else-if="failed" class="text-destructive text-sm">{{ t.loadFailed }}</p>
    <p v-else-if="!shown.length" class="text-muted-foreground text-sm">{{ t.empty }}</p>
    <template v-else>
      <Button v-if="tab === 'open'" class="self-start" @click="retry"><RotateCcwIcon /> {{ picked.length ? t.retry(retryIds.length) : t.retryAll }}</Button>
      <ul class="flex flex-col gap-2">
        <li v-for="n in shown" :key="n.id" class="flex items-start gap-2 rounded-md border p-3 text-sm" data-testid="wrong-note">
          <input v-if="tab === 'open'" type="checkbox" class="mt-1" :aria-label="t.pick" :checked="picked.includes(n.id)" @change="toggle(n.id, ($event.target as HTMLInputElement).checked)">
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <p v-if="n.refType === 'card'" class="font-medium">{{ n.snapshot.front }} <span class="text-muted-foreground font-normal">— {{ n.snapshot.back }}</span></p>
            <p v-else class="whitespace-pre-line"><MathText :text="n.snapshot.prompt ?? ''" /></p>
            <div class="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">{{ t.kinds[n.refType] }}</Badge>
              <Badge v-if="n.wrongCount >= OFTEN_WRONG" variant="destructive">{{ t.often }}</Badge>
              <span>{{ t.count(n.wrongCount) }}</span>
              <span v-if="n.lastWrongAt">· {{ t.last(day(n.lastWrongAt)) }}</span>
              <span v-if="!n.resolved && n.consecutiveCorrect">· {{ t.streak(n.consecutiveCorrect, RESOLVE_STREAK) }}</span>
              <NuxtLink v-for="s in n.sources" :key="srcKey(s)" :to="sourceLink(s)" class="hover:underline">· {{ t.sources[s.type] }} {{ s.name }}</NuxtLink>
            </div>
          </div>
          <Button v-if="!n.resolved" variant="ghost" size="sm" :disabled="busy" @click="setResolved(n, true)"><CheckIcon /> {{ t.resolve }}</Button>
          <Button v-else variant="ghost" size="sm" :disabled="busy" @click="setResolved(n, false)"><RotateCcwIcon /> {{ t.unresolve }}</Button>
        </li>
      </ul>
    </template>
  </div>
</template>
