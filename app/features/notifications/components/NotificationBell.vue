<script setup lang="ts">
import type { AppNotification } from '../services/notifications'
import { BellIcon } from '@lucide/vue'
import { ko } from '~/locales/ko'
import { watchNotifications } from '../services/notifications'

/** CMN-30: 사이드바 아래 알림 버튼과 읽지 않은 수 */
const t = ko.notifications
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const list = ref<AppNotification[]>([])
const unread = computed(() => list.value.filter(n => !n.read).length)
let stop: (() => void) | undefined

watch(() => auth.user?.uid, (uid) => {
  stop?.()
  list.value = []
  if (uid) stop = watchNotifications($firestore, uid, (l) => { list.value = l }, () => {})
}, { immediate: true })
onUnmounted(() => stop?.())
</script>

<template>
  <SidebarMenu>
    <SidebarMenuItem>
      <SidebarMenuButton as-child :tooltip="t.title">
        <NuxtLink to="/notifications" :aria-label="unread ? t.unread(unread) : t.title">
          <BellIcon />
          <span>{{ t.title }}</span>
          <span v-if="unread" class="ml-auto rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{{ unread > 99 ? '99+' : unread }}</span>
        </NuxtLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  </SidebarMenu>
</template>
