<script setup lang="ts">
import type { ShelfItem } from '../services/shelf'
import { StarIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'
import { updateShelf } from '../services/shelf'

/** READ-11: 책별 내 정보 — 현재 위치, 시작일, 완독일, 별점 */
const props = defineProps<{ sid: string, book: ShelfItem | null }>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { default: false })

const t = ko.reading
const d = t.detail
const { $firestore } = useNuxtApp()

const pos = ref<number | null>(null)
const startedAt = ref('')
const finishedAt = ref('')
const rating = ref<number | null>(null)
const pending = ref(false)

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
})

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
    <DialogContent v-if="book" class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ book.title }}</DialogTitle>
        <DialogDescription>{{ [book.authors.join(', '), t.formats[book.format], t.statuses[book.status]].filter(Boolean).join(' · ') }}</DialogDescription>
      </DialogHeader>
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
        <Button type="submit" form="book-detail" :disabled="pending">
          {{ d.save }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
