<script setup lang="ts">
import type { ReadingGroup } from '~/features/reading/services/groups'
import type { ShelfItem } from '~/features/reading/services/shelf'
import type { Member } from '~/features/space/services/invites'
import { dateKey } from '#shared/dates'
import { isAssigned } from '#shared/reading-groups'
import { PlusIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import ReadingGroupFormDialog from '~/features/reading/components/ReadingGroupFormDialog.vue'
import { listReadingGroups } from '~/features/reading/services/groups'
import { listMyShelf } from '~/features/reading/services/shelf'
import { listMembers } from '~/features/space/services/invites'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'

/** READ-40·41 함께 읽기 목록 (워크스페이스) */
const t = ko.reading.groups
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()

if (!space.current?.modules?.reading || space.current.kind !== 'workspace') {
  await navigateTo(`/s/${space.current!.id}/reading`, { replace: true })
}

const sid = computed(() => space.current!.id)
const me = computed(() => auth.user!.uid)
const today = dateKey(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone)
const list = ref<ReadingGroup[] | null>(null)
const members = ref<Member[]>([])
const shelf = ref<ShelfItem[]>([])
const formOpen = ref(false)
const myGroups = computed(() => (members.value.find(m => m.uid === me.value) as (Member & { groupIds?: string[] }) | undefined)?.groupIds ?? [])

async function load() {
  const [g, m, s] = await Promise.all([listReadingGroups($firestore, sid.value), listMembers($firestore, sid.value), listMyShelf($firestore, sid.value, me.value)])
  list.value = g
  members.value = m
  shelf.value = s
}
onMounted(() => load().catch(e => toast.error(errorMessage(e) ?? ko.errors.unknown)))
</script>

<template>
  <div class="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
    <div class="flex flex-wrap items-end justify-between gap-2">
      <div class="flex flex-col gap-1">
        <NuxtLink :to="`/s/${sid}/reading`" class="text-muted-foreground text-sm hover:underline">
          ← {{ ko.reading.title }}
        </NuxtLink>
        <h1 class="text-2xl font-semibold">
          {{ t.title }}
        </h1>
      </div>
      <Button @click="formOpen = true">
        <PlusIcon />{{ t.create }}
      </Button>
    </div>
    <p v-if="list && !list.length" class="text-muted-foreground text-sm">
      {{ t.empty }}
    </p>
    <ul v-else class="grid gap-3 sm:grid-cols-2">
      <li v-for="g in list ?? []" :key="g.id">
        <NuxtLink :to="`/s/${sid}/reading/groups/${g.id}`" class="hover:bg-accent flex gap-3 rounded-lg border p-3">
          <img v-if="g.book.cover" :src="g.book.cover" alt="" class="h-20 w-14 shrink-0 rounded border object-cover">
          <div class="flex min-w-0 flex-col gap-1">
            <span class="truncate font-medium">{{ g.book.title }}</span>
            <span class="text-muted-foreground text-xs">{{ t.period(g.startAt, g.endAt) }} · {{ t.participants(g.participantIds.length) }}</span>
            <span v-if="g.participantIds.includes(me)" class="bg-secondary self-start rounded px-1.5 py-0.5 text-xs">{{ t.participating }}</span>
            <span v-else-if="isAssigned(g, me, myGroups)" class="bg-primary text-primary-foreground self-start rounded px-1.5 py-0.5 text-xs">{{ t.forMe }}</span>
          </div>
        </NuxtLink>
      </li>
    </ul>
    <ReadingGroupFormDialog v-model:open="formOpen" :sid="sid" :members="members" :shelf="shelf" :today="today" @created="id => navigateTo(`/s/${sid}/reading/groups/${id}`)" />
  </div>
</template>
