<script setup lang="ts">
import type { Activity } from '../services/activities'
import type { Reaction } from '~/features/notes/services/reactions'
import { SmilePlusIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { REACTIONS, toggleFeedReaction, watchFeedReactions } from '~/features/notes/services/reactions'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'

/** CMN-10·13: 큰 활동은 카드처럼, 작은 활동은 한 줄로. 같은 사람의 같은 날 작은 활동은 한 줄로 묶는다 */
const props = defineProps<{ sid: string, items: Activity[], names: Record<string, string> }>()
const t = ko.home.feed

type Row = { key: string, size: 'major' | 'minor', text: string, link: string | null, at: Activity['createdAt'] }
/** CMN-12 반응 대상: 큰 활동은 활동 ID, 같은 날 묶음은 `d_{uid}_{date}` */
const target = (r: Row) => r.size === 'major' ? r.key : `d_${r.key}`

const name = (uid: string) => props.names[uid] ?? t.someone

function link(a: Activity) {
  if (!a.refId) return null
  if (a.refType === 'deck') return `/s/${props.sid}/decks/${a.refId}`
  if (a.refType === 'page') return `/s/${props.sid}/notes/${a.refId}`
  if (a.refType === 'mission') return `/s/${props.sid}/missions/${a.refId}`
  if (a.refType === 'book') return `/s/${props.sid}/reading`
  return null
}

function part(list: Activity[]) {
  const cards: Record<string, number> = {}
  let journals = 0
  const missions = new Set<string>()
  const books = new Set<string>()
  for (const a of list) {
    if (a.type === 'session') cards[a.data.mode] = (cards[a.data.mode] ?? 0) + (a.data.cards ?? 0)
    else if (a.type === 'journal') journals++
    else if (a.type === 'missionDone') missions.add(a.data.title ?? '')
    else if (a.type === 'readingLog') books.add(a.data.title ?? '')
  }
  const parts = Object.entries(cards).map(([mode, n]) => t.cards(n, ko.vocab.study.modes[mode] ?? ''))
  if (journals) parts.push(t.journalPart)
  if (missions.size) parts.push(t.missionPart([...missions]))
  if (books.size) parts.push(t.readingPart([...books]))
  return parts.join(', ')
}

const rows = computed<Row[]>(() => {
  const out: Row[] = []
  const groups = new Map<string, Activity[]>()
  for (const a of props.items) {
    if (a.size === 'major') {
      const text = a.type === 'bookReview' ? t.reviewPublished(name(a.uid), a.data.title ?? '') : t.deckCreated(name(a.uid), a.data.title ?? '')
      out.push({ key: a.id, size: 'major', text, link: link(a), at: a.createdAt })
      continue
    }
    const key = `${a.uid}_${a.date}`
    const g = groups.get(key)
    if (g) { g.push(a); continue }
    const list = [a]
    groups.set(key, list)
    out.push({ key, size: 'minor', text: '', link: null, at: a.createdAt })
  }
  for (const r of out) {
    const list = r.size === 'minor' ? groups.get(r.key) : undefined
    if (!list) continue
    r.text = `${name(list[0]!.uid)} · ${part(list)}`
    r.link = list.length === 1 ? link(list[0]!) : null
  }
  return out
})

const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const reactions = ref<Record<string, Reaction[]>>({})
const picking = ref<string | null>(null)
const busy = ref(false)
const targets = computed(() => rows.value.map(target).join('|'))
watch(targets, (ids, _, onCleanup) => {
  if (!ids) return
  onCleanup(watchFeedReactions($firestore, props.sid, ids.split('|'), (m) => { reactions.value = m }))
}, { immediate: true })

const mineOf = (id: string) => reactions.value[id]?.find(x => x.uid === auth.user?.uid)?.emoji
function counts(id: string) {
  const c = new Map<string, number>()
  for (const x of reactions.value[id] ?? []) c.set(x.emoji, (c.get(x.emoji) ?? 0) + 1)
  return [...c]
}
async function react(id: string, emoji: string) {
  picking.value = null
  busy.value = true
  try { await toggleFeedReaction($firestore, props.sid, auth.user!.uid, id, emoji, mineOf(id)) }
  catch (error) { toast.error(errorMessage(error) ?? ko.errors.unknown) }
  finally { busy.value = false }
}

const when = (r: Row) => r.at?.toDate().toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) ?? ''
</script>

<template>
  <ul class="flex flex-col gap-1">
    <li v-for="r in rows" :key="r.key">
      <component
        :is="r.link ? 'NuxtLink' : 'div'"
        :to="r.link ?? undefined"
        class="hover:bg-muted/60 flex items-baseline gap-2 rounded-md px-2"
        :class="r.size === 'major' ? 'bg-muted/40 border py-3 font-medium' : 'py-1.5 text-sm'"
      >
        <span class="min-w-0 flex-1">{{ r.text }}</span>
        <span class="text-muted-foreground shrink-0 text-xs">{{ when(r) }}</span>
      </component>
      <div class="flex flex-wrap items-center gap-1 px-2 pt-0.5">
        <button
          v-for="[e, n] in counts(target(r))"
          :key="e"
          type="button"
          class="hover:bg-accent flex h-6 items-center gap-1 rounded-full border px-2 text-xs disabled:opacity-50"
          :class="mineOf(target(r)) === e && 'border-primary bg-primary/10'"
          :aria-pressed="mineOf(target(r)) === e"
          :disabled="busy"
          @click="react(target(r), e)"
        >
          <span>{{ e }}</span><span class="text-muted-foreground tabular-nums">{{ n }}</span>
        </button>
        <template v-if="picking === target(r)">
          <button v-for="e in REACTIONS" :key="e" type="button" class="hover:bg-accent h-6 rounded-full px-1.5 text-sm" :disabled="busy" @click="react(target(r), e)">
            {{ e }}
          </button>
        </template>
        <button
          type="button"
          class="text-muted-foreground hover:bg-accent hover:text-foreground flex h-6 w-6 items-center justify-center rounded-full"
          :aria-label="t.react"
          :aria-expanded="picking === target(r)"
          @click="picking = picking === target(r) ? null : target(r)"
        >
          <SmilePlusIcon class="size-3.5" />
        </button>
      </div>
    </li>
  </ul>
</template>
