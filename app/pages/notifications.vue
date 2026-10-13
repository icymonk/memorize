<script setup lang="ts">
import type { AppNotification } from '~/features/notifications/services/notifications'
import { toast } from 'vue-sonner'
import { markRead, removeNotification, watchNotifications } from '~/features/notifications/services/notifications'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'

definePageMeta({ layout: 'focus' })

/** CMN-30 알림함: 누르면 읽음으로 바꾸고 해당 페이지로 */
const t = ko.notifications
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const list = ref<AppNotification[]>([])
const loaded = ref(false)
let stop: (() => void) | undefined

watch(() => auth.user?.uid, (uid) => {
  stop?.()
  if (uid) {
    stop = watchNotifications($firestore, uid, (l) => {
      list.value = l
      loaded.value = true
    }, e => toast.error(errorMessage(e) ?? ko.errors.unknown))
  }
}, { immediate: true })
onUnmounted(() => stop?.())

const uid = () => auth.user!.uid

async function open(n: AppNotification) {
  if (!n.read) markRead($firestore, uid(), n.id).catch(() => {})
  await navigateTo(n.refPath)
}

async function markAll() {
  try {
    await Promise.all(list.value.filter(n => !n.read).map(n => markRead($firestore, uid(), n.id)))
  }
  catch (e) { toast.error(errorMessage(e) ?? ko.errors.unknown) }
}

async function remove(n: AppNotification) {
  try { await removeNotification($firestore, uid(), n.id) }
  catch (e) { toast.error(errorMessage(e) ?? ko.errors.unknown) }
}

const when = (n: AppNotification) => n.createdAt?.toDate().toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) ?? ''
</script>

<template>
  <div class="mx-auto w-full max-w-2xl space-y-4 p-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold">
        {{ t.title }}
      </h1>
      <Button v-if="list.some(n => !n.read)" variant="ghost" size="sm" @click="markAll">
        {{ t.markAll }}
      </Button>
    </div>
    <p v-if="loaded && !list.length" class="text-sm text-muted-foreground">
      {{ t.empty }}
    </p>
    <ul class="divide-y rounded-md border">
      <li v-for="n in list" :key="n.id" class="flex items-start gap-3 p-3" :class="n.read ? 'opacity-70' : 'bg-muted/40'">
        <button type="button" class="min-w-0 flex-1 text-left" @click="open(n)">
          <p class="text-sm" :class="n.read ? '' : 'font-medium'">
            {{ n.title }}
          </p>
          <p class="truncate text-sm text-muted-foreground">
            {{ n.body }}
          </p>
          <p class="text-xs text-muted-foreground">
            {{ when(n) }}
          </p>
        </button>
        <Button variant="ghost" size="sm" @click="remove(n)">
          {{ t.remove }}
        </Button>
      </li>
    </ul>
  </div>
</template>
