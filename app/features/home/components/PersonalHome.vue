<script setup lang="ts">
import type { Page } from '~/features/notes/services/pages'
import type { ShelfItem } from '~/features/reading/services/shelf'
import { isPeriodDay } from '#shared/schemas/mission'
import { listMissions } from '~/features/missions/services/missions'
import { getPage, getPrefs } from '~/features/notes/services/pages'
import { listMyShelf } from '~/features/reading/services/shelf'
import { getSpace, getUserSpaceIds } from '~/features/space/services/spaces'
import { ko } from '~/locales/ko'
import { localYmd } from '../services/activities'

/** WS-54: 내 공간 홈 — 모든 공간의 오늘 할 미션, 내 일지 모아 보기, 최근 노트, 읽는 중인 책 */
const props = defineProps<{ sid: string }>()
const t = ko.personalHome
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
type Todo = { key: string, space: string, title: string, link: string }
const todos = ref<Todo[] | null>(null)
const recent = ref<Page[]>([])
const reading = ref<ShelfItem[]>([])

async function loadTodos(uid: string) {
  const today = localYmd(new Date())
  const ids = await getUserSpaceIds($firestore, uid).catch(() => [] as string[])
  const lists = await Promise.all([...new Set([props.sid, ...ids])].map(async (sid) => {
    const s = await getSpace($firestore, sid).catch(() => null)
    if (!s || s.deleteScheduledAt || s.modules?.missions === false) return []
    const ms = await listMissions($firestore, sid, uid).catch(() => [])
    return ms.filter(m => !m.closedAt && m.participantIds.includes(uid) && isPeriodDay(m, today))
      .map(m => ({ key: `${sid}/${m.id}`, space: s.kind === 'personal' ? t.mySpace : s.name, title: m.title, link: `/s/${sid}/missions/${m.id}` }))
  }))
  todos.value = lists.flat()
}

watch(() => props.sid, async (sid) => {
  const uid = auth.user?.uid
  if (!uid) return
  todos.value = null
  loadTodos(uid)
  listMyShelf($firestore, sid, uid).then((l) => { reading.value = l.filter(b => b.status === 'reading') }).catch(() => {})
  const prefs = await getPrefs($firestore, sid, uid).catch(() => null)
  const pages = await Promise.all((prefs?.recentPageIds ?? []).slice(0, 5).map(id => getPage($firestore, sid, id).catch(() => null)))
  recent.value = pages.filter((p): p is Page => !!p)
}, { immediate: true })
</script>

<template>
  <div class="grid gap-6 sm:grid-cols-2">
    <Card class="sm:col-span-2">
      <CardHeader class="flex flex-row items-center justify-between">
        <CardTitle>{{ t.todo }}</CardTitle>
        <NuxtLink to="/journal" class="text-muted-foreground text-sm hover:underline">
          {{ t.journals }}
        </NuxtLink>
      </CardHeader>
      <CardContent class="flex flex-col gap-1">
        <NuxtLink v-for="x in todos ?? []" :key="x.key" :to="x.link" class="hover:bg-muted flex items-center gap-2 rounded-md px-2 py-1 text-sm">
          <span class="text-muted-foreground shrink-0 text-xs">{{ x.space }}</span>
          <span class="truncate">🎯 {{ x.title }}</span>
        </NuxtLink>
        <p v-if="todos && !todos.length" class="text-muted-foreground text-sm">
          {{ t.todoEmpty }}
        </p>
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle>{{ t.recent }}</CardTitle>
      </CardHeader>
      <CardContent class="flex flex-col gap-1">
        <NuxtLink v-for="p in recent" :key="p.id" :to="`/s/${sid}/notes/${p.id}`" class="hover:bg-muted truncate rounded-md px-2 py-1 text-sm">
          {{ p.icon || '📄' }} {{ p.title || t.untitled }}
        </NuxtLink>
        <p v-if="!recent.length" class="text-muted-foreground text-sm">
          {{ t.empty }}
        </p>
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle>{{ t.reading }}</CardTitle>
      </CardHeader>
      <CardContent class="flex flex-col gap-1">
        <NuxtLink v-for="b in reading" :key="b.id" :to="`/s/${sid}/reading`" class="hover:bg-muted truncate rounded-md px-2 py-1 text-sm">
          📖 {{ b.title }}
        </NuxtLink>
        <p v-if="!reading.length" class="text-muted-foreground text-sm">
          {{ t.empty }}
        </p>
      </CardContent>
    </Card>
  </div>
</template>
