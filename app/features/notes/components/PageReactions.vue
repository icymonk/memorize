<script setup lang="ts">
import type { Reaction } from '../services/reactions'
import { toast } from 'vue-sonner'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'
import { REACTIONS, toggleReaction, watchPageReactions } from '../services/reactions'

/** CMN-21: 페이지 반응 (한 사람당 하나) */
const props = defineProps<{ sid: string, pageId: string }>()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const list = ref<Reaction[]>([])
const pending = ref(false)
let stop: (() => void) | undefined
onMounted(() => { stop = watchPageReactions($firestore, props.sid, props.pageId, (l) => { list.value = l }, () => {}) })
onBeforeUnmount(() => stop?.())

const mine = computed(() => list.value.find(r => r.uid === auth.user?.uid)?.emoji)
const count = (e: string) => list.value.filter(r => r.emoji === e).length

async function toggle(emoji: string) {
  pending.value = true
  try { await toggleReaction($firestore, props.sid, auth.user!.uid, props.pageId, emoji, mine.value) }
  catch (error) { toast.error(errorMessage(error) ?? ko.errors.unknown) }
  finally { pending.value = false }
}
</script>

<template>
  <div class="mt-6 flex flex-wrap gap-1.5" role="group" :aria-label="ko.notes.reactions.label">
    <button
      v-for="e in REACTIONS"
      :key="e"
      type="button"
      class="flex h-8 items-center gap-1 rounded-full border px-2.5 text-sm transition-colors hover:bg-accent disabled:opacity-50"
      :class="mine === e && 'border-primary bg-primary/10'"
      :aria-pressed="mine === e"
      :disabled="pending"
      @click="toggle(e)"
    >
      <span>{{ e }}</span>
      <span v-if="count(e)" class="text-muted-foreground text-xs tabular-nums">{{ count(e) }}</span>
    </button>
  </div>
</template>
