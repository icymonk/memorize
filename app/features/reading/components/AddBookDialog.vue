<script setup lang="ts">
import type { BookHit, ShelfInput } from '#shared/schemas/book'
import { BOOK_FORMATS, SHELF_STATUS, shelfInput } from '#shared/schemas/book'
import { SearchIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { errorMessage } from '~/lib/errors'
import { callFn } from '~/lib/functions'
import { ko } from '~/locales/ko'
import { addToShelf } from '../services/shelf'

/** READ-01·02·05: 검색해서 담기 / 직접 등록 */
const props = defineProps<{ sid: string }>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { default: false })

const t = ko.reading
const auth = useAuthStore()
const { $firestore, $functions } = useNuxtApp()

const q = ref('')
const hits = ref<BookHit[] | null>(null)
const searching = ref(false)
const form = ref<ShelfInput>(shelfInput.parse({ title: '-' }))
const authors = ref('')
const pending = ref(false)

watch(open, (v) => {
  if (!v) return
  q.value = ''
  hits.value = null
  form.value = { ...shelfInput.parse({ title: '-' }), title: '' }
  authors.value = ''
})

async function search() {
  if (!q.value.trim()) return
  searching.value = true
  try {
    hits.value = (await callFn($functions, 'searchBooks', { query: q.value.trim() })).items
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
  finally {
    searching.value = false
  }
}

function pick(b: BookHit) {
  form.value = { ...form.value, title: b.title.slice(0, 200), publisher: b.publisher.slice(0, 100), cover: b.cover, isbn13: b.isbn13, total: { pages: b.pages, minutes: null } }
  authors.value = b.authors.join(', ')
  hits.value = null
}

async function save() {
  const parsed = shelfInput.safeParse({ ...form.value, authors: authors.value.split(',').map(s => s.trim()).filter(Boolean) })
  if (!parsed.success) {
    toast.error(t.invalid)
    return
  }
  pending.value = true
  try {
    await addToShelf($firestore, props.sid, auth.user!.uid, parsed.data)
    toast.success(t.added)
    open.value = false
    emit('saved')
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
    <DialogContent class="max-h-[90svh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ t.add }}</DialogTitle>
        <DialogDescription>{{ t.addHint }}</DialogDescription>
      </DialogHeader>
      <form class="flex gap-2" @submit.prevent="search">
        <Input v-model="q" :placeholder="t.searchPlaceholder" :aria-label="t.searchPlaceholder" />
        <Button type="submit" variant="outline" :disabled="searching">
          <SearchIcon />
          {{ t.search }}
        </Button>
      </form>
      <ul v-if="hits" class="flex max-h-64 flex-col gap-1 overflow-y-auto">
        <li v-if="!hits.length" class="text-muted-foreground py-4 text-center text-sm">
          {{ t.noHits }}
        </li>
        <li v-for="(b, i) in hits" :key="i">
          <button type="button" class="hover:bg-muted flex w-full items-center gap-3 rounded-md p-2 text-left" @click="pick(b)">
            <img v-if="b.cover" :src="b.cover" alt="" class="h-14 w-10 rounded object-cover">
            <span class="bg-muted h-14 w-10 rounded" v-else />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium">{{ b.title }}</span>
              <span class="text-muted-foreground block truncate text-xs">{{ [b.authors.join(', '), b.publisher].filter(Boolean).join(' · ') }}</span>
            </span>
          </button>
        </li>
      </ul>
      <form id="book-form" class="flex flex-col gap-3" @submit.prevent="save">
        <div class="flex gap-3">
          <img v-if="form.cover" :src="form.cover" alt="" class="h-24 w-16 shrink-0 rounded object-cover">
          <div class="flex flex-1 flex-col gap-2">
            <Label for="book-title">{{ t.fields.title }}</Label>
            <Input id="book-title" v-model="form.title" required maxlength="200" />
            <Label for="book-authors">{{ t.fields.authors }}</Label>
            <Input id="book-authors" v-model="authors" :placeholder="t.fields.authorsHint" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-2">
            <Label for="book-format">{{ t.fields.format }}</Label>
            <select id="book-format" v-model="form.format" class="border-input h-9 rounded-md border bg-transparent px-2 text-sm">
              <option v-for="k in BOOK_FORMATS" :key="k" :value="k">
                {{ t.formats[k] }}
              </option>
            </select>
          </div>
          <div class="flex flex-col gap-2">
            <Label for="book-status">{{ t.fields.status }}</Label>
            <select id="book-status" v-model="form.status" class="border-input h-9 rounded-md border bg-transparent px-2 text-sm">
              <option v-for="k in SHELF_STATUS" :key="k" :value="k">
                {{ t.statuses[k] }}
              </option>
            </select>
          </div>
          <div v-if="form.format !== 'audio'" class="flex flex-col gap-2">
            <Label for="book-pages">{{ t.fields.pages }}</Label>
            <Input id="book-pages" :model-value="form.total.pages ?? undefined" @update:model-value="v => form.total.pages = v === '' || v == null ? null : Number(v)" type="number" min="1" />
          </div>
          <div v-else class="flex flex-col gap-2">
            <Label for="book-minutes">{{ t.fields.minutes }}</Label>
            <Input id="book-minutes" :model-value="form.total.minutes ?? undefined" @update:model-value="v => form.total.minutes = v === '' || v == null ? null : Number(v)" type="number" min="1" />
          </div>
          <div class="flex flex-col gap-2">
            <Label for="book-publisher">{{ t.fields.publisher }}</Label>
            <Input id="book-publisher" v-model="form.publisher" maxlength="100" />
          </div>
        </div>
      </form>
      <DialogFooter>
        <Button type="submit" form="book-form" :disabled="pending || !form.title.trim()">
          {{ t.save }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
