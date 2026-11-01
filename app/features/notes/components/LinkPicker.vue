<script setup lang="ts">
import type { LinkBlock } from '../extensions/link-card'
import { localYmd } from '~/features/home/services/activities'
import { listMissions } from '~/features/missions/services/missions'
import { listMyShelf } from '~/features/reading/services/shelf'
import { listDecks } from '~/features/vocab/services/decks'
import { cn } from '~/lib/utils'
import { ko } from '~/locales/ko'

/** NOTE-07: 연결할 페이지·단어장·책·미션을 고르거나 오늘의 학습 요약을 넣는다 */
const props = defineProps<{ sid: string, pageId: string }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ pick: [block: LinkBlock] }>()
const t = ko.notes.link
const auth = useAuthStore()
const notes = useNotesStore()
const space = useSpaceStore()
const { $firestore } = useNuxtApp()

const LINK_KINDS = ['page', 'deck', 'book', 'mission', 'summary'] as const
type LinkKind = typeof LINK_KINDS[number]
interface Item { key: string, title: string, icon: string, block: LinkBlock }
const kind = ref<LinkKind>('page')
const q = ref('')
const items = ref<Item[] | null>(null)
const mods = computed(() => space.current?.modules)
const kinds = computed(() => LINK_KINDS.filter(k =>
  (k !== 'deck' || mods.value?.vocab !== false)
  && (k !== 'book' || mods.value?.reading !== false)
  && (k !== 'mission' || mods.value?.missions !== false)))

async function load(k: LinkKind): Promise<Item[]> {
  const uid = auth.user!.uid
  if (k === 'page') {
    return notes.pages.filter(p => p.id !== props.pageId && !p.deletedAt)
      .map(p => ({ key: p.id, title: p.title ?? '', icon: p.icon ?? '', block: { type: 'pageLink', attrs: { pageId: p.id } } }))
  }
  if (k === 'deck') {
    const ds = await listDecks($firestore, props.sid, uid, space.membership?.groupIds ?? [])
    return ds.map(d => ({ key: d.id, title: d.title, icon: '', block: { type: 'appEmbed', attrs: { refType: 'deck', refId: d.id } } }))
  }
  if (k === 'book') {
    const bs = await listMyShelf($firestore, props.sid, uid)
    return bs.map(b => ({ key: b.bookKey, title: b.title, icon: '', block: { type: 'appEmbed', attrs: { refType: 'book', refId: b.bookKey } } }))
  }
  if (k === 'mission') {
    const ms = await listMissions($firestore, props.sid, uid)
    return ms.map(m => ({ key: m.id, title: m.title, icon: '', block: { type: 'appEmbed', attrs: { refType: 'mission', refId: m.id } } }))
  }
  return []
}

watch([open, kind], async ([v, k]) => {
  if (!v) return
  items.value = null
  items.value = await load(k).catch(() => [])
})
watch(open, (v) => {
  if (v) q.value = ''
})

const shown = computed(() => {
  const s = q.value.trim().toLowerCase()
  return (items.value ?? []).filter(i => !s || i.title.toLowerCase().includes(s)).slice(0, 50)
})

function pick(i: Item) {
  emit('pick', i.block)
  open.value = false
}
function pickSummary() {
  emit('pick', { type: 'todaySummary', attrs: { uid: auth.user!.uid, date: localYmd(new Date()) } })
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[80vh] overflow-y-auto sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t.title }}</DialogTitle>
      </DialogHeader>
      <div class="flex flex-wrap gap-1">
        <Button
          v-for="k in kinds"
          :key="k"
          size="sm"
          :variant="kind === k ? 'secondary' : 'ghost'"
          @click="kind = k"
        >
          {{ t.kinds[k] }}
        </Button>
      </div>
      <div v-if="kind === 'summary'" class="flex flex-col gap-2">
        <p class="text-muted-foreground text-sm">
          {{ t.summaryHint }}
        </p>
        <Button @click="pickSummary">
          {{ t.summaryInsert }}
        </Button>
      </div>
      <template v-else>
        <Input v-model="q" :placeholder="t.search" />
        <p v-if="!items" class="text-muted-foreground text-sm">
          …
        </p>
        <p v-else-if="!shown.length" class="text-muted-foreground text-sm">
          {{ t.empty }}
        </p>
        <ul v-else class="flex flex-col gap-0.5">
          <li v-for="i in shown" :key="i.key">
            <button type="button" :class="cn('hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm')" @click="pick(i)">
              <span v-if="i.icon">{{ i.icon }}</span>
              <span class="truncate">{{ i.title || t.untitled }}</span>
            </button>
          </li>
        </ul>
      </template>
    </DialogContent>
  </Dialog>
</template>
