<script setup lang="ts">
import type { Activity } from '~/features/home/services/activities'
import type { Page } from '~/features/notes/services/pages'
import type { Member } from '~/features/space/services/invites'
import type { Deck } from '~/features/vocab/services/decks'
import ActivityList from '~/features/home/components/ActivityList.vue'
import { listMemberActivities } from '~/features/home/services/activities'
import { listPages } from '~/features/notes/services/pages'
import { listMembers } from '~/features/space/services/invites'
import { listDecks } from '~/features/vocab/services/decks'
import { ko } from '~/locales/ko'

/** WS-21: 멤버 프로필 — 이 워크스페이스에서의 활동, 공개 노트, 만든 단어장. 진도를 숨긴 멤버의 학습 기록은 규칙에서 빠진다 */
definePageMeta({ key: r => r.fullPath })
const t = ko.memberProfile
const route = useRoute()
const sid = route.params.spaceId as string
const target = route.params.uid as string
const { $firestore } = useNuxtApp()
const auth = useAuthStore()
const space = useSpaceStore()
const members = ref<Member[]>([])
const decks = ref<Deck[]>([])
const notes = ref<Page[]>([])
const activities = ref<Activity[]>([])
const loading = ref(true)
const member = computed(() => members.value.find(m => m.uid === target && m.status === 'active'))
const names = computed(() => Object.fromEntries(members.value.map(m => [m.uid, m.displayName])))
const hidesProgress = computed(() => (member.value as { hideProgress?: boolean } | undefined)?.hideProgress === true)

onMounted(async () => {
  const me = auth.user!.uid
  members.value = await listMembers($firestore, sid).catch(() => [])
  const myGroups = members.value.find(m => m.uid === me)?.groupIds ?? []
  const mods = space.current?.modules
  const [d, p, a] = await Promise.all([
    mods?.vocab === false ? [] : listDecks($firestore, sid, me, myGroups.slice(0, 10)).catch(() => []),
    mods?.notes === false ? [] : listPages($firestore, sid, me).catch(() => []),
    listMemberActivities($firestore, sid, target).catch(() => []),
  ])
  decks.value = d.filter(x => x.createdBy === target && x.visibility !== 'private')
  notes.value = p.filter(x => x.ownerId === target && x.visibility !== 'private' && x.type !== 'item')
  activities.value = a
  loading.value = false
})
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
    <NuxtLink :to="`/s/${sid}/members`" class="text-muted-foreground text-sm hover:underline">
      ← {{ t.back }}
    </NuxtLink>
    <p v-if="loading" class="text-muted-foreground text-sm">
      …
    </p>
    <p v-else-if="!member" class="text-muted-foreground text-sm">
      {{ t.notFound }}
    </p>
    <template v-else>
      <div class="flex items-center gap-3">
        <Avatar class="size-12">
          <AvatarImage v-if="member.photoURL" :src="member.photoURL" :alt="member.displayName" />
          <AvatarFallback>{{ member.displayName.slice(0, 1) }}</AvatarFallback>
        </Avatar>
        <div>
          <h1 class="text-xl font-semibold">
            {{ member.displayName }}
          </h1>
          <p class="text-muted-foreground text-sm">
            {{ t.summary(decks.length, notes.length) }}
          </p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{{ t.activity }}</CardTitle>
          <CardDescription v-if="hidesProgress">
            {{ t.hiddenProgress }}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActivityList v-if="activities.length" :sid="sid" :items="activities" :names="names" />
          <p v-else class="text-muted-foreground text-sm">
            {{ t.empty }}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{{ t.notes }}</CardTitle>
        </CardHeader>
        <CardContent class="flex flex-col gap-1">
          <NuxtLink v-for="n in notes" :key="n.id" :to="`/s/${sid}/notes/${n.id}`" class="hover:bg-muted truncate rounded-md px-2 py-1 text-sm">
            {{ n.icon || '📄' }} {{ n.title || t.untitled }}
          </NuxtLink>
          <p v-if="!notes.length" class="text-muted-foreground text-sm">
            {{ t.empty }}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{{ t.decks }}</CardTitle>
        </CardHeader>
        <CardContent class="flex flex-col gap-1">
          <NuxtLink v-for="d in decks" :key="d.id" :to="`/s/${sid}/decks/${d.id}`" class="hover:bg-muted truncate rounded-md px-2 py-1 text-sm">
            📚 {{ d.title }}
          </NuxtLink>
          <p v-if="!decks.length" class="text-muted-foreground text-sm">
            {{ t.empty }}
          </p>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
