<script setup lang="ts">
import type { ReadingLog } from '../services/logs'
import type { Quote } from '../services/quotes'
import type { ShelfItem } from '../services/shelf'
import { logUnit } from '#shared/schemas/book'
import { StarIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'
import { askFinish, listBookLogs, recordReading } from '../services/logs'
import { addQuote, listQuotes } from '../services/quotes'
import { updateShelf } from '../services/shelf'
import QuoteList from './QuoteList.vue'

/** READ-11: 책별 내 정보 — 현재 위치, 시작일, 완독일, 별점 */
const props = defineProps<{ sid: string, book: ShelfItem | null, today: string, workspace?: boolean, nameOf?: (uid: string) => string, reviews?: boolean }>()
const emit = defineEmits<{ saved: [], review: [book: ShelfItem] }>()
const open = defineModel<boolean>('open', { default: false })

const t = ko.reading
const d = t.detail
const { $firestore } = useNuxtApp()

const pos = ref<number | null>(null)
const startedAt = ref('')
const finishedAt = ref('')
const rating = ref<number | null>(null)
const pending = ref(false)
const auth = useAuthStore()
const L = t.log
const logs = ref<ReadingLog[]>([])
const logDate = ref('')
const logTo = ref<number | null>(null)
const logMinutes = ref<number | null>(null)
const logMemo = ref('')
const logging = ref(false)
const unit = computed(() => logUnit(props.book?.format ?? 'paper'))
const quotes = ref<Quote[]>([])
const qPos = ref<number | null>(null)
const qText = ref('')
const qShare = ref(false)
const quoting = ref(false)
const Q = t.quotes
/** REV-24: 이 책의 독후감 (나에게 보이는 것) */
const notes = useNotesStore()
const bookReviews = computed(() => notes.pages.filter(p => p.type === 'bookReview' && !p.deletedAt && p.book?.bookKey === props.book?.bookKey
  && (p.visibility !== 'private' || p.ownerId === auth.user?.uid)))
const num = (v: string | number | null | undefined) => v === '' || v == null ? null : Number(v)

const key = computed(() => props.book?.format === 'audio' ? 'minutes' : props.book?.format === 'ebook' ? 'percent' : 'page')
const total = computed(() => key.value === 'percent' ? 100 : key.value === 'minutes' ? props.book?.total.minutes : props.book?.total.pages)
const progress = computed(() => pos.value && total.value ? Math.min(100, Math.round(pos.value / total.value * 100)) : null)

watch(open, (v) => {
  if (!v || !props.book) return
  const b = props.book
  pos.value = b.position?.[key.value] ?? null
  startedAt.value = b.startedAt ?? ''
  finishedAt.value = b.finishedAt ?? ''
  rating.value = b.rating ?? null
  logDate.value = props.today
  logTo.value = null
  logMinutes.value = null
  logMemo.value = ''
  logs.value = []
  listBookLogs($firestore, props.sid, auth.user!.uid, b.bookKey).then(l => logs.value = l).catch(() => {})
  qPos.value = pos.value
  qText.value = ''
  qShare.value = false
  quotes.value = []
  loadQuotes(b.bookKey)
})

function loadQuotes(bookKey: string) {
  listQuotes($firestore, props.sid, auth.user!.uid, !!props.workspace, bookKey).then(q => quotes.value = q).catch(() => {})
}

/** READ-30 */
async function saveQuote() {
  const b = props.book
  if (!b || !qText.value.trim()) return
  quoting.value = true
  try {
    await addQuote($firestore, props.sid, auth.user!.uid, b.title, {
      bookKey: b.bookKey,
      date: props.today,
      unit: unit.value,
      position: qPos.value == null ? null : Math.max(0, Math.round(qPos.value)),
      text: qText.value.trim().slice(0, 1000),
      visibility: props.workspace && qShare.value ? 'space' : 'private',
    })
    toast.success(Q.saved)
    qText.value = ''
    loadQuotes(b.bookKey)
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
  finally {
    quoting.value = false
  }
}

/** READ-20·24 */
async function addLog() {
  const b = props.book
  if (!b || logTo.value == null) return
  logging.value = true
  try {
    const input = { bookKey: b.bookKey, date: logDate.value || props.today, unit: unit.value, from: pos.value, to: logTo.value, minutes: Math.max(0, Math.min(1440, Math.round(logMinutes.value ?? 0))), memo: logMemo.value.trim().slice(0, 200) }
    Object.assign(b, await recordReading($firestore, props.sid, auth.user!.uid, b, input))
    pos.value = logTo.value
    toast.success(L.saved)
    const done = await askFinish($firestore, props.sid, b, input, L.finishAsk)
    if (done) {
      Object.assign(b, done)
      toast.success(L.finished)
    }
    logTo.value = null
    logMinutes.value = null
    logMemo.value = ''
    logs.value = await listBookLogs($firestore, props.sid, auth.user!.uid, b.bookKey)
    emit('saved')
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
  finally {
    logging.value = false
  }
}

async function save() {
  if (!props.book) return
  pending.value = true
  try {
    await updateShelf($firestore, props.sid, props.book.id, {
      position: { [key.value]: pos.value },
      startedAt: startedAt.value || null,
      finishedAt: finishedAt.value || null,
      rating: rating.value,
    })
    toast.success(d.saved)
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
    <DialogContent v-if="book" class="max-h-[90vh] overflow-y-auto sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ book.title }}</DialogTitle>
        <DialogDescription>{{ [book.authors.join(', '), t.formats[book.format], t.statuses[book.status]].filter(Boolean).join(' · ') }}</DialogDescription>
      </DialogHeader>
      <section v-if="bookReviews.length" class="flex flex-col gap-1 text-sm">
        <h3 class="text-xs font-medium">
          {{ ko.notes.review.bookReviews }}
        </h3>
        <NuxtLink v-for="r in bookReviews" :key="r.id" :to="`/s/${sid}/notes/${r.id}`" class="hover:bg-muted truncate rounded-md px-2 py-1" @click="open = false">
          {{ r.icon || '📖' }} {{ r.title || ko.notes.untitled }}
        </NuxtLink>
      </section>
      <form id="book-detail" class="flex flex-col gap-3" @submit.prevent="save">
        <Label for="bd-pos">{{ d.position(d.units[book.format] ?? '') }}<template v-if="total"> / {{ total }}</template></Label>
        <Input id="bd-pos" type="number" min="0" :max="total ?? undefined" :model-value="pos ?? undefined" @update:model-value="v => pos = v === '' || v == null ? null : Number(v)" />
        <p v-if="progress !== null" class="text-muted-foreground text-xs">
          {{ d.progress(progress) }}
        </p>
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-2">
            <Label for="bd-start">{{ d.startedAt }}</Label>
            <Input id="bd-start" v-model="startedAt" type="date" />
          </div>
          <div class="flex flex-col gap-2">
            <Label for="bd-end">{{ d.finishedAt }}</Label>
            <Input id="bd-end" v-model="finishedAt" type="date" />
          </div>
        </div>
        <div class="flex items-center gap-1" role="radiogroup" :aria-label="d.rating">
          <span class="mr-2 text-sm">{{ d.rating }}</span>
          <button v-for="n in 5" :key="n" type="button" role="radio" :aria-checked="rating === n" :aria-label="`${n}`" @click="rating = n">
            <StarIcon class="size-5" :class="rating && n <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'" />
          </button>
          <Button v-if="rating" type="button" variant="ghost" size="sm" @click="rating = null">
            {{ d.clearRating }}
          </Button>
        </div>
      </form>
      <DialogFooter>
        <Button v-if="reviews" type="button" variant="outline" @click="emit('review', book)">
          {{ ko.notes.review.write }}
        </Button>
        <Button type="submit" form="book-detail" :disabled="pending">
          {{ d.save }}
        </Button>
      </DialogFooter>
      <section class="flex flex-col gap-3 border-t pt-4">
        <h3 class="text-sm font-medium">
          {{ L.title }}
        </h3>
        <form class="grid grid-cols-2 gap-2" @submit.prevent="addLog">
          <Input v-model="logDate" type="date" :aria-label="L.date" />
          <Input type="number" min="0" :placeholder="L.to(L.units[unit] ?? '')" :aria-label="L.to(L.units[unit] ?? '')" :model-value="logTo ?? undefined" @update:model-value="v => logTo = num(v)" />
          <Input type="number" min="0" max="1440" :placeholder="L.minutes" :aria-label="L.minutes" :model-value="logMinutes ?? undefined" @update:model-value="v => logMinutes = num(v)" />
          <Input v-model="logMemo" maxlength="200" :placeholder="L.memo" :aria-label="L.memo" />
          <Button type="submit" variant="outline" class="col-span-2" :disabled="logging || logTo == null">
            {{ L.save }}
          </Button>
        </form>
        <h3 class="text-sm font-medium">
          {{ L.timeline }}
        </h3>
        <p v-if="!logs.length" class="text-muted-foreground text-xs">
          {{ L.none }}
        </p>
        <ol v-else class="flex max-h-48 flex-col gap-1 overflow-y-auto text-xs">
          <li v-for="l in logs" :key="l.id" class="flex gap-2">
            <span class="text-muted-foreground shrink-0 tabular-nums">{{ l.date }}</span>
            <span>{{ l.from != null ? `${l.from} → ` : '' }}{{ l.to }}{{ L.units[l.unit] }}<template v-if="l.minutes"> · {{ l.minutes }}분</template><template v-if="l.memo"> · {{ l.memo }}</template></span>
          </li>
        </ol>
      </section>
      <section class="flex flex-col gap-3 border-t pt-4">
        <h3 class="text-sm font-medium">
          {{ Q.title }}
        </h3>
        <form class="flex flex-col gap-2" @submit.prevent="saveQuote">
          <Textarea v-model="qText" rows="2" maxlength="1000" :placeholder="Q.text" :aria-label="Q.text" />
          <div class="flex items-center gap-2">
            <Input type="number" min="0" class="w-28" :placeholder="Q.position(L.units[unit] ?? '')" :aria-label="Q.position(L.units[unit] ?? '')" :model-value="qPos ?? undefined" @update:model-value="v => qPos = num(v)" />
            <label v-if="workspace" class="flex items-center gap-1.5 text-xs">
              <input v-model="qShare" type="checkbox" class="accent-primary">
              {{ Q.share }}
            </label>
            <Button type="submit" variant="outline" size="sm" class="ml-auto" :disabled="quoting || !qText.trim()">
              {{ Q.save }}
            </Button>
          </div>
        </form>
        <div class="max-h-56 overflow-y-auto">
          <QuoteList :sid="sid" :quotes="quotes" :name-of="nameOf" @removed="id => quotes = quotes.filter(q => q.id !== id)" />
        </div>
      </section>
    </DialogContent>
  </Dialog>
</template>
