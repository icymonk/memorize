<script setup lang="ts">
import type { Page } from '../services/pages'
import { ChevronRightIcon, FileTextIcon, MoreHorizontalIcon, PlusIcon, StarIcon, Trash2Icon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { errorMessage } from '~/lib/errors'
import { cn } from '~/lib/utils'
import { ko } from '~/locales/ko'

/** NOTE-20: 사이드바 페이지 트리 한 줄. 끌어서 다른 페이지 안(가운데)이나 앞·뒤(위·아래 가장자리)로 옮긴다 */
const props = defineProps<{ page: Page, depth: number, sid: string }>()
const t = ko.notes
const notes = useNotesStore()
const auth = useAuthStore()
const space = useSpaceStore()
const route = useRoute()

const children = computed(() => notes.childrenOf(props.page.id, props.page.root))
const open = computed(() => notes.expanded.has(props.page.id))
const active = computed(() => 'pageId' in route.params && route.params.pageId === props.page.id)
const canTrash = computed(() => props.page.ownerId === auth.user?.uid || ['owner', 'manager'].includes(space.membership?.access ?? ''))
const drop = ref<'before' | 'inside' | 'after' | null>(null)

function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData('application/x-memorize-page', props.page.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onDragOver(e: DragEvent) {
  if (!e.dataTransfer?.types.includes('application/x-memorize-page')) return
  e.preventDefault()
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const y = (e.clientY - r.top) / r.height
  drop.value = y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'inside'
}
async function onDrop(e: DragEvent) {
  const where = drop.value
  drop.value = null
  const id = e.dataTransfer?.getData('application/x-memorize-page')
  if (!id || !where || id === props.page.id || props.page.ancestorIds?.includes(id)) return
  try { await notes.move(id, props.page, where, props.page.root) }
  catch (error) { toast.error(errorMessage(error) ?? t.moveFailed) }
}

async function addChild() {
  try {
    const id = await notes.create(props.page.root, props.page)
    await navigateTo(`/s/${props.sid}/notes/${id}`)
  }
  catch (error) { toast.error(errorMessage(error) ?? ko.errors.unknown) }
}
async function toTrash() {
  if (!(await confirmDialog(t.trashConfirm(props.page.title || t.untitled)))) return
  try {
    await notes.trash(props.page.id)
    toast.success(t.trashed)
    if (active.value) await navigateTo(`/s/${props.sid}/notes`)
  }
  catch (error) { toast.error(errorMessage(error) ?? ko.errors.unknown) }
}
</script>

<template>
  <li>
    <div
      draggable="true"
      :class="cn('group/page relative flex h-7 items-center gap-1 rounded-md pr-1 text-sm', active ? 'bg-sidebar-accent font-medium' : 'hover:bg-sidebar-accent/60', drop === 'inside' && 'ring-primary ring-2')"
      :style="{ paddingLeft: `${depth * 12 + 4}px` }"
      @dragstart.stop="onDragStart"
      @dragover="onDragOver"
      @dragleave="drop = null"
      @drop.prevent.stop="onDrop"
    >
      <span v-if="drop === 'before'" class="bg-primary absolute inset-x-0 top-0 h-0.5" />
      <span v-if="drop === 'after'" class="bg-primary absolute inset-x-0 bottom-0 h-0.5" />
      <button type="button" class="text-muted-foreground hover:bg-sidebar-accent flex size-5 shrink-0 items-center justify-center rounded" :aria-expanded="open" @click="notes.toggleExpanded(page.id)">
        <ChevronRightIcon :class="cn('size-3.5 transition-transform', open && 'rotate-90', !children.length && 'opacity-30')" />
      </button>
      <NuxtLink :to="`/s/${sid}/notes/${page.id}`" class="flex min-w-0 flex-1 items-center gap-1.5">
        <span v-if="page.icon" class="shrink-0 text-sm leading-none">{{ page.icon }}</span>
        <FileTextIcon v-else class="text-muted-foreground size-4 shrink-0" />
        <span class="truncate">{{ page.title || t.untitled }}</span>
      </NuxtLink>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <button type="button" class="text-muted-foreground hover:bg-sidebar-accent hidden size-5 items-center justify-center rounded group-hover/page:flex data-[state=open]:flex" :aria-label="t.more">
            <MoreHorizontalIcon class="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem @select="notes.toggleFavorite(page.id)">
            <StarIcon class="size-4" />{{ notes.isFavorite(page.id) ? t.removeFavorite : t.addFavorite }}
          </DropdownMenuItem>
          <DropdownMenuItem v-if="canTrash" class="text-destructive" @select="toTrash">
            <Trash2Icon class="size-4" />{{ t.moveToTrash }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button type="button" class="text-muted-foreground hover:bg-sidebar-accent hidden size-5 items-center justify-center rounded group-hover/page:flex" :aria-label="t.addSubpage" :title="t.addSubpage" @click="addChild">
        <PlusIcon class="size-3.5" />
      </button>
    </div>
    <ul v-if="open && children.length">
      <PageTreeItem v-for="c in children" :key="c.id" :page="c" :depth="depth + 1" :sid="sid" />
    </ul>
  </li>
</template>
