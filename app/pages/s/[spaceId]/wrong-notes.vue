<script setup lang="ts">
import type { Timestamp } from 'firebase/firestore'
import { BookXIcon } from '@lucide/vue'
import { collection, getDocs, query, where } from 'firebase/firestore'
import MathText from '~/features/math/components/MathText.vue'
import { ko } from '~/locales/ko'

/** WRN-01·03·10·11 오답 노트: 자동으로 모인 틀린 카드·문제, 틀린 횟수·마지막 날·출처. 다시 풀기·해결은 3-C2 */
interface WrongNote {
  id: string
  refType: 'card' | 'question'
  refId: string
  sources: { type: 'deck' | 'test' | 'problemSet', id: string, name: string }[]
  wrongCount: number
  lastWrongAt?: Timestamp
  resolved: boolean
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
const kind = ref<'all' | 'card' | 'question'>('all')
const shown = computed(() => notes.value.filter(n => !n.resolved && (kind.value === 'all' || n.refType === kind.value)))

onMounted(async () => {
  try {
    const snap = await getDocs(query(collection($firestore, 'spaces', sid.value, 'wrongNotes'), where('uid', '==', auth.user!.uid)))
    notes.value = snap.docs.map(d => ({ id: d.id, ...d.data() }) as WrongNote)
      .sort((a, b) => (b.lastWrongAt?.toMillis() ?? 0) - (a.lastWrongAt?.toMillis() ?? 0))
  }
  catch {
    failed.value = true
  }
  finally {
    loading.value = false
  }
})
const day = (ts?: Timestamp) => (ts ? ts.toDate().toLocaleDateString('ko-KR') : '')
const sourceLink = (s: WrongNote['sources'][number]) =>
  s.type === 'deck' ? `/s/${sid.value}/decks/${s.id}` : s.type === 'test' ? `/s/${sid.value}/tests/${s.id}` : `/s/${sid.value}/math/${s.id}`
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
    <div class="flex flex-col gap-1">
      <h1 class="flex items-center gap-2 text-xl font-semibold"><BookXIcon class="size-5" /> {{ t.title }}</h1>
      <p class="text-muted-foreground text-sm">{{ t.intro }}</p>
    </div>
    <div class="flex gap-1">
      <Button v-for="k in (['all', 'card', 'question'] as const)" :key="k" size="sm" :variant="kind === k ? 'default' : 'outline'" @click="kind = k">{{ t.kinds[k] }}</Button>
    </div>
    <Skeleton v-if="loading" class="h-24 w-full" />
    <p v-else-if="failed" class="text-destructive text-sm">{{ t.loadFailed }}</p>
    <p v-else-if="!shown.length" class="text-muted-foreground text-sm">{{ t.empty }}</p>
    <ul v-else class="flex flex-col gap-2">
      <li v-for="n in shown" :key="n.id" class="flex flex-col gap-1 rounded-md border p-3 text-sm" data-testid="wrong-note">
        <p v-if="n.refType === 'card'" class="font-medium">{{ n.snapshot.front }} <span class="text-muted-foreground font-normal">— {{ n.snapshot.back }}</span></p>
        <p v-else class="whitespace-pre-line"><MathText :text="n.snapshot.prompt ?? ''" /></p>
        <div class="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline">{{ t.kinds[n.refType] }}</Badge>
          <Badge v-if="n.wrongCount >= 3" variant="destructive">{{ t.often }}</Badge>
          <span>{{ t.count(n.wrongCount) }}</span>
          <span v-if="n.lastWrongAt">· {{ t.last(day(n.lastWrongAt)) }}</span>
          <NuxtLink v-for="s in n.sources" :key="`${s.type}-${s.id}`" :to="sourceLink(s)" class="hover:underline">· {{ t.sources[s.type] }} {{ s.name }}</NuxtLink>
        </div>
      </li>
    </ul>
  </div>
</template>
