<script setup lang="ts">
import type { Quote } from '~/features/reading/services/quotes'
import { listQuotes } from '~/features/reading/services/quotes'
import { ko } from '~/locales/ko'

/** REV-05: 이 책에서 저장한 내 구절을 골라 인용으로 넣는다 */
const props = defineProps<{ sid: string, bookKey: string }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ pick: [text: string] }>()
const t = ko.notes.review
const units = ko.reading.log.units
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const quotes = ref<Quote[] | null>(null)

watch(open, async (v) => {
  if (!v) return
  quotes.value = null
  quotes.value = await listQuotes($firestore, props.sid, auth.user!.uid, false, props.bookKey).catch(() => [])
})

function pick(q: Quote) {
  emit('pick', q.position != null ? `${q.text} (${q.position}${units[q.unit] ?? ''})` : q.text)
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[80vh] overflow-y-auto sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t.quotePick }}</DialogTitle>
      </DialogHeader>
      <p v-if="!quotes" class="text-muted-foreground text-sm">
        …
      </p>
      <p v-else-if="!quotes.length" class="text-muted-foreground text-sm">
        {{ t.noQuotes }}
      </p>
      <ul v-else class="flex flex-col gap-1">
        <li v-for="q in quotes" :key="q.id">
          <button type="button" class="hover:bg-muted w-full rounded-md border-l-2 px-3 py-1.5 text-left text-sm whitespace-pre-wrap" @click="pick(q)">
            {{ q.text }}
            <span v-if="q.position != null" class="text-muted-foreground text-xs"> · {{ q.position }}{{ units[q.unit] }}</span>
          </button>
        </li>
      </ul>
    </DialogContent>
  </Dialog>
</template>
