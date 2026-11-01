<script setup lang="ts">
import type { Collection } from '../services/collections'
import type { ShelfItem } from '~/features/reading/services/shelf'
import { toast } from 'vue-sonner'
import { listMyShelf } from '~/features/reading/services/shelf'
import { errorMessage } from '~/lib/errors'
import { cn } from '~/lib/utils'
import { ko } from '~/locales/ko'
import { ensureBookReview, REVIEW_ID } from '../services/collections'
import { sectionsTemplate } from '../sync/template'

/** REV-01·02·04: 책 고르기 → 템플릿 고르기 → 독후감 만들기. 별점·읽은 기간은 책장에서 가져온다 */
const props = defineProps<{ sid: string, book?: ShelfItem | null }>()
const open = defineModel<boolean>('open', { default: false })
const t = ko.notes.review
const BUILTIN = ['free', 'basic', 'kids', 'debate']
const auth = useAuthStore()
const notes = useNotesStore()
const { $firestore } = useNuxtApp()
const shelf = ref<ShelfItem[] | null>(null)
const picked = ref<ShelfItem | null>(null)
const template = ref('basic')
const pending = ref(false)
const col = computed(() => notes.collections.find(c => c.id === REVIEW_ID) ?? null)
const custom = computed(() => (col.value?.templateIds ?? []).map(id => notes.byId.get(id)).filter(p => !!p && !p.deletedAt))

watch(open, async (v) => {
  if (!v) return
  picked.value = props.book ?? null
  template.value = 'basic'
  if (!props.book) shelf.value = await listMyShelf($firestore, props.sid, auth.user!.uid).catch(() => [])
})

async function start() {
  const b = picked.value
  if (!b) return
  pending.value = true
  try {
    await ensureBookReview($firestore, props.sid, auth.user!.uid)
    const c: Collection = col.value ?? { id: REVIEW_ID, kind: 'system', systemType: 'bookReview', name: '', icon: '', ownerId: auth.user!.uid, scope: props.sid.startsWith('p_') ? 'private' : 'shared', schema: [], views: [], templateIds: [] }
    const id = await notes.createItem(c, {
      ...(b.rating ? { rating: '★'.repeat(b.rating) } : {}),
      ...(b.startedAt ? { startedAt: b.startedAt } : {}),
      ...(b.finishedAt ? { finishedAt: b.finishedAt } : {}),
    }, {
      book: { bookKey: b.bookKey, title: b.title, authors: b.authors ?? [], cover: b.cover ?? '' },
      ...(BUILTIN.includes(template.value) ? { blocks: sectionsTemplate(t.sections[template.value] ?? []) } : { templateId: template.value }),
    })
    open.value = false
    await navigateTo(`/s/${props.sid}/notes/${id}`)
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t.new }}</DialogTitle>
      </DialogHeader>
      <section v-if="!book" class="flex flex-col gap-2">
        <h3 class="text-sm font-medium">
          {{ t.pickBook }}
        </h3>
        <p v-if="shelf && !shelf.length" class="text-muted-foreground text-sm">
          {{ t.noBooks }}
        </p>
        <ul class="flex max-h-60 flex-col gap-1 overflow-y-auto">
          <li v-for="b in shelf ?? []" :key="b.id">
            <button type="button" :class="cn('hover:bg-muted flex w-full items-center gap-2 rounded-md p-1.5 text-left text-sm', picked?.id === b.id && 'bg-muted ring-primary ring-1')" :aria-pressed="picked?.id === b.id" @click="picked = b">
              <img v-if="b.cover" :src="b.cover" alt="" class="h-10 w-7 rounded-sm object-cover">
              <span class="min-w-0 flex-1 truncate">{{ b.title }}</span>
            </button>
          </li>
        </ul>
      </section>
      <p v-else class="text-sm font-medium">
        {{ book.title }}
      </p>
      <section class="flex flex-col gap-2">
        <h3 class="text-sm font-medium">
          {{ t.template }}
        </h3>
        <div class="flex flex-wrap gap-1.5">
          <Button v-for="k in BUILTIN" :key="k" type="button" size="sm" :variant="template === k ? 'secondary' : 'outline'" :aria-pressed="template === k" @click="template = k">
            {{ t.templates[k] }}
          </Button>
          <Button v-for="p in custom" :key="p!.id" type="button" size="sm" :variant="template === p!.id ? 'secondary' : 'outline'" :aria-pressed="template === p!.id" @click="template = p!.id">
            {{ p!.title || ko.notes.untitled }}
          </Button>
        </div>
        <p v-if="t.sections[template]?.length" class="text-muted-foreground text-xs">
          {{ t.sections[template]!.join(' / ') }}
        </p>
      </section>
      <DialogFooter>
        <Button :disabled="pending || !picked" @click="start">
          {{ t.start }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
