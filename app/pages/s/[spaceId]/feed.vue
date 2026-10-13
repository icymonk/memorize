<script setup lang="ts">
import type { Activity } from '~/features/home/services/activities'
import { toast } from 'vue-sonner'
import ActivityList from '~/features/home/components/ActivityList.vue'
import { watchFeed } from '~/features/home/services/activities'
import { listMembers } from '~/features/space/services/invites'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'

/** CMN-10: 워크스페이스 활동 피드 (최근 100개) */
const route = useRoute()
const sid = computed(() => route.params.spaceId as string)
const t = ko.home.feed
const { $firestore } = useNuxtApp()
const items = ref<Activity[]>([])
const names = ref<Record<string, string>>({})
const loaded = ref(false)
let stop: (() => void) | undefined

watch(sid, (id) => {
  stop?.()
  loaded.value = false
  stop = watchFeed($firestore, id, 100, (l) => {
    items.value = l
    loaded.value = true
  }, e => toast.error(errorMessage(e) ?? ko.errors.unknown))
  listMembers($firestore, id).then((ms) => { names.value = Object.fromEntries(ms.map(m => [m.uid, m.displayName])) }).catch(() => {})
}, { immediate: true })
onUnmounted(() => stop?.())
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-4">
    <h1 class="text-2xl font-semibold">
      {{ t.title }}
    </h1>
    <ActivityList v-if="items.length" :sid="sid" :items="items" :names="names" />
    <p v-else-if="loaded" class="text-muted-foreground text-sm">
      {{ t.empty }}
    </p>
  </div>
</template>
