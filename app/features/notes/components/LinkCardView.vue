<script setup lang="ts">
import type { NodeViewProps } from '@tiptap/vue-3'
import { shelfId } from '#shared/schemas/book'
import { doc, getDoc } from 'firebase/firestore'
import { NodeViewWrapper } from '@tiptap/vue-3'
import { getMission } from '~/features/missions/services/missions'
import { getDeck } from '~/features/vocab/services/decks'
import { cn } from '~/lib/utils'
import { ko } from '~/locales/ko'
import { getPage } from '../services/pages'
import JournalSummary from './JournalSummary.vue'

/** NOTE-07: 연결 블록 카드. 대상 문서를 읽어 제목을 보여 주고, 누르면 그 항목으로 간다 */
const props = defineProps<NodeViewProps>()
const t = ko.notes.link
const { $firestore } = useNuxtApp()
const auth = useAuthStore()
const type = computed(() => props.node.type.name)
const a = computed(() => props.node.attrs as Record<string, string>)
const sid = computed(() => String(props.extension.options.sid ?? ''))
const ICONS: Record<string, string> = { page: '📄', deck: '🗂️', book: '📚', mission: '🎯', summary: '📊' }
const kind = computed(() => type.value === 'pageLink' ? 'page' : type.value === 'todaySummary' ? 'summary' : a.value.refType ?? 'deck')

const state = ref<'loading' | 'ok' | 'noAccess' | 'deleted'>('loading')
const info = ref({ title: '', icon: '' })

async function find(): Promise<{ title: string, icon?: string } | null> {
  const id = type.value === 'pageLink' ? a.value.pageId : a.value.refId
  if (!id) return null
  if (type.value === 'pageLink') {
    const p = await getPage($firestore, sid.value, id)
    return p && !p.deletedAt ? { title: p.title, icon: p.icon ?? '' } : null
  }
  if (kind.value === 'deck') return getDeck($firestore, sid.value, id)
  if (kind.value === 'mission') return getMission($firestore, sid.value, id)
  // 워크스페이스는 책 묶음, 내 공간은 묶음이 없어 내 책장에서 읽는다
  const b = await getDoc(doc($firestore, 'spaces', sid.value, 'books', id)).catch(() => null)
  const d = b?.exists() ? b : await getDoc(doc($firestore, 'spaces', sid.value, 'shelf', shelfId(auth.user!.uid, id)))
  return d.exists() ? { title: String(d.data().title ?? '') } : null
}

watch([type, a, sid], async () => {
  if (type.value === 'todaySummary') return
  state.value = 'loading'
  try {
    const x = await find()
    if (!x) state.value = 'deleted'
    else {
      info.value = { title: x.title, icon: x.icon ?? '' }
      state.value = 'ok'
    }
  }
  catch (e) {
    state.value = (e as { code?: string }).code === 'permission-denied' ? 'noAccess' : 'deleted'
  }
}, { immediate: true })

const to = computed(() => {
  const base = `/s/${sid.value}`
  if (type.value === 'pageLink') return `${base}/notes/${a.value.pageId}`
  if (kind.value === 'book') return `${base}/reading`
  return `${base}/${kind.value === 'deck' ? 'decks' : 'missions'}/${a.value.refId}`
})
const box = computed(() => cn('flex items-center gap-2 rounded-md border px-3 py-2 text-sm no-underline', props.selected && 'ring-ring ring-2'))
</script>

<template>
  <NodeViewWrapper class="my-1">
    <div v-if="type === 'todaySummary'" :class="cn('rounded-md border p-3', selected && 'ring-ring ring-2')">
      <p class="text-muted-foreground mb-1 text-xs">
        {{ ICONS.summary }} {{ t.summaryOf(a.date ?? '') }}
      </p>
      <JournalSummary v-if="a.uid && a.date" :sid="sid" :owner-id="a.uid" :date="a.date" :editable="false" />
    </div>
    <NuxtLink v-else-if="state === 'ok'" :to="to" :class="cn(box, 'hover:bg-muted')">
      <span>{{ info.icon || ICONS[kind] }}</span>
      <span class="truncate font-medium">{{ info.title || t.untitled }}</span>
      <span class="text-muted-foreground ml-auto shrink-0 text-xs">{{ t.kinds[kind] }}</span>
    </NuxtLink>
    <div v-else :class="cn(box, 'text-muted-foreground')">
      <span>{{ ICONS[kind] }}</span>
      <span>{{ state === 'loading' ? '…' : state === 'noAccess' ? t.noAccess : t.deleted }}</span>
    </div>
  </NodeViewWrapper>
</template>
