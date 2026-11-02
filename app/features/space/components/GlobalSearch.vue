<script setup lang="ts">
import type { SearchHit, SearchType } from '#shared/search'
import { BookOpenIcon, ClipboardCheckIcon, FileTextIcon, LayersIcon, SearchIcon, TargetIcon, TypeIcon } from '@lucide/vue'
import { useDebounceFn, useEventListener } from '@vueuse/core'
import { toast } from 'vue-sonner'
import { hitPath } from '#shared/search'
import { errorMessage } from '~/lib/errors'
import { callFn } from '~/lib/functions'
import { cn } from '~/lib/utils'
import { ko } from '~/locales/ko'

/** CMN-50 통합 검색 (Ctrl+K) */
const props = defineProps<{ sid: string }>()
const t = ko.search
const { $functions } = useNuxtApp()
const open = ref(false)
const q = ref('')
const hits = ref<SearchHit[]>([])
const loading = ref(false)
const active = ref(0)
let seq = 0

const ORDER: SearchType[] = ['page', 'deck', 'card', 'book', 'mission', 'test']
const ICONS = { page: FileTextIcon, deck: LayersIcon, card: TypeIcon, book: BookOpenIcon, mission: TargetIcon, test: ClipboardCheckIcon }
const groups = computed(() => ORDER.map(type => ({ type, items: hits.value.filter(h => h.type === type) })).filter(g => g.items.length))
const flat = computed(() => groups.value.flatMap(g => g.items))

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    open.value = !open.value
  }
})

const run = useDebounceFn(async () => {
  const text = q.value.trim()
  const my = ++seq
  if (!text) {
    hits.value = []
    loading.value = false
    return
  }
  try {
    const r = await callFn($functions, 'searchAll', { spaceId: props.sid, q: text.slice(0, 50) })
    if (my === seq) {
      hits.value = r.hits
      active.value = 0
    }
  }
  catch (e) {
    if (my === seq) {
      hits.value = []
      toast.error(errorMessage(e) ?? ko.errors.unknown)
    }
  }
  finally {
    if (my === seq) loading.value = false
  }
}, 250)

watch(q, () => {
  loading.value = !!q.value.trim()
  run()
})
watch(open, (o) => {
  if (o) return
  q.value = ''
  hits.value = []
})
watch(() => props.sid, () => { open.value = false })

function go(h: SearchHit) {
  open.value = false
  navigateTo(hitPath(props.sid, h))
}

function onKey(e: KeyboardEvent) {
  const n = flat.value.length
  if (!n) return
  if (e.key === 'ArrowDown') active.value = (active.value + 1) % n
  else if (e.key === 'ArrowUp') active.value = (active.value - 1 + n) % n
  else if (e.key === 'Enter' && !e.isComposing) go(flat.value[active.value]!)
  else return
  e.preventDefault()
  nextTick(() => document.querySelector('[data-search-active="true"]')?.scrollIntoView({ block: 'nearest' }))
}
</script>

<template>
  <Button variant="outline" size="sm" class="text-muted-foreground gap-2" :aria-label="t.open" @click="open = true">
    <SearchIcon class="size-4" />
    <span class="hidden sm:inline">{{ t.open }}</span>
    <kbd class="bg-muted hidden rounded px-1.5 font-mono text-[10px] sm:inline">Ctrl K</kbd>
  </Button>
  <Dialog v-model:open="open">
    <DialogContent class="top-[15%] translate-y-0 gap-0 p-0 sm:max-w-xl">
      <DialogHeader class="sr-only">
        <DialogTitle>{{ t.title }}</DialogTitle>
        <DialogDescription>{{ t.desc }}</DialogDescription>
      </DialogHeader>
      <div class="flex items-center gap-2 border-b px-3">
        <SearchIcon class="text-muted-foreground size-4 shrink-0" />
        <input
          id="global-search"
          v-model="q"
          class="h-12 flex-1 bg-transparent text-sm outline-none"
          :placeholder="t.placeholder"
          autocomplete="off"
          maxlength="50"
          @keydown="onKey"
        >
      </div>
      <div class="max-h-[60svh] overflow-y-auto p-2" data-testid="search-results">
        <p v-if="!q.trim()" class="text-muted-foreground p-4 text-center text-sm">{{ t.hint }}</p>
        <p v-else-if="loading && !flat.length" class="text-muted-foreground p-4 text-center text-sm">{{ t.loading }}</p>
        <p v-else-if="!flat.length" class="text-muted-foreground p-4 text-center text-sm">{{ t.empty }}</p>
        <section v-for="g in groups" :key="g.type" class="mb-2">
          <h3 class="text-muted-foreground px-2 py-1 text-xs font-medium">{{ t.types[g.type] }}</h3>
          <button
            v-for="h in g.items"
            :key="`${h.type}_${h.parentId ?? ''}_${h.id}`"
            type="button"
            :data-search-active="flat[active] === h"
            :class="cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm', flat[active] === h ? 'bg-accent' : 'hover:bg-accent/60')"
            @mouseenter="active = flat.indexOf(h)"
            @click="go(h)"
          >
            <component :is="ICONS[h.type]" class="text-muted-foreground size-4 shrink-0" />
            <span class="truncate">{{ h.title || t.untitled }}</span>
            <span v-if="h.sub" class="text-muted-foreground ml-auto shrink-0 truncate text-xs">{{ h.sub }}</span>
          </button>
        </section>
      </div>
    </DialogContent>
  </Dialog>
</template>
