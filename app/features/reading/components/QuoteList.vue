<script setup lang="ts">
import type { Quote } from '../services/quotes'
import { LockIcon, Trash2Icon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'
import { deleteQuote } from '../services/quotes'

/** READ-30·31: 구절 목록 (지우기는 내 것만) */
const props = defineProps<{ sid: string, quotes: Quote[], nameOf?: (uid: string) => string, showTitle?: boolean }>()
const emit = defineEmits<{ removed: [id: string] }>()
const t = ko.reading
const auth = useAuthStore()
const { $firestore } = useNuxtApp()

async function remove(q: Quote) {
  if (!await confirmDialog(t.quotes.removeConfirm)) return
  try {
    await deleteQuote($firestore, props.sid, q.id)
    emit('removed', q.id)
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
}
</script>

<template>
  <p v-if="!quotes.length" class="text-muted-foreground text-xs">
    {{ t.quotes.none }}
  </p>
  <ul v-else class="flex flex-col gap-2">
    <li v-for="q in quotes" :key="q.id" class="group flex gap-2 rounded-md border-l-2 py-1 pl-3">
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <p class="text-sm whitespace-pre-wrap">
          {{ q.text }}
        </p>
        <p class="text-muted-foreground flex items-center gap-1 text-xs">
          <LockIcon v-if="q.visibility === 'private'" class="size-3" :aria-label="t.quotes.private" />
          <span>{{ [showTitle ? `『${q.title}』` : '', q.position != null ? `${q.position}${t.log.units[q.unit]}` : '', nameOf && q.uid !== auth.user?.uid ? nameOf(q.uid) : ''].filter(Boolean).join(' · ') }}</span>
        </p>
      </div>
      <Button v-if="q.uid === auth.user?.uid" variant="ghost" size="icon" class="size-7 shrink-0" :aria-label="t.quotes.remove" @click="remove(q)">
        <Trash2Icon />
      </Button>
    </li>
  </ul>
</template>
