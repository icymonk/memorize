<script setup lang="ts">
import type { Mission } from '~/features/missions/services/missions'
import type { Member } from '~/features/space/services/invites'
import { dateKey } from '#shared/dates'
import { PlusIcon, UserIcon } from '@lucide/vue'
import MissionFormDialog from '~/features/missions/components/MissionFormDialog.vue'
import { isFinished, listMissions } from '~/features/missions/services/missions'
import { listMembers } from '~/features/space/services/invites'
import { ko } from '~/locales/ko'

/** MIS-20 미션 목록: 참여 중 / 내가 연 미션 / 참여 가능 / 완료, 마감 순 */
const t = ko.missions
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()

if (!space.current?.modules?.missions) {
  await navigateTo(`/s/${space.current!.id}`, { replace: true })
}

const sid = computed(() => space.current!.id)
const uid = computed(() => auth.user!.uid)
const personal = computed(() => space.current?.kind === 'personal')
const canHost = computed(() => space.can('host'))
const today = dateKey(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone)

const missions = ref<Mission[]>([])
const members = ref<Member[]>([])
const loading = ref(true)
const loadError = ref(false)
const tab = ref<'active' | 'hosting' | 'joinable' | 'done'>('active')
const formOpen = ref(false)
const goal = ref(false)

const byDeadline = (a: Mission, b: Mission) => (a.endDate ?? '9999').localeCompare(b.endDate ?? '9999') || a.title.localeCompare(b.title, 'ko')
const lists = computed(() => {
  const open = missions.value.filter(m => !isFinished(m, today))
  return {
    active: open.filter(m => m.participantIds.includes(uid.value)).sort(byDeadline),
    hosting: open.filter(m => m.hostIds.includes(uid.value) && !m.isPersonal).sort(byDeadline),
    joinable: open.filter(m => m.joinable && !m.participantIds.includes(uid.value)).sort(byDeadline),
    done: missions.value.filter(m => isFinished(m, today) && (m.participantIds.includes(uid.value) || m.hostIds.includes(uid.value)))
      .sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? '')),
  }
})

async function load() {
  loading.value = true
  try {
    const [ms, mb] = await Promise.all([listMissions($firestore, sid.value, uid.value), listMembers($firestore, sid.value)])
    missions.value = ms
    members.value = mb
    loadError.value = false
  }
  catch {
    loadError.value = true
  }
  finally {
    loading.value = false
  }
}
onMounted(load)
watch(sid, load)

function openForm(personalGoal: boolean) {
  goal.value = personalGoal
  formOpen.value = true
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-2xl font-semibold">
        {{ t.title }}
      </h1>
      <div class="flex gap-2">
        <Button variant="outline" @click="openForm(true)">
          <UserIcon />
          {{ t.createGoal }}
        </Button>
        <Button v-if="!personal" :disabled="!canHost" :title="canHost ? undefined : t.noHostPermission" @click="openForm(false)">
          <PlusIcon />
          {{ t.create }}
        </Button>
      </div>
    </div>

    <Tabs v-model="tab">
      <TabsList>
        <TabsTrigger v-for="(label, key) in t.tabs" :key="key" :value="key">
          {{ label }} <span class="text-muted-foreground ml-1 text-xs">{{ lists[key as keyof typeof lists].length }}</span>
        </TabsTrigger>
      </TabsList>
    </Tabs>

    <p v-if="loading" class="text-muted-foreground text-sm">
      …
    </p>
    <p v-else-if="loadError" class="text-destructive text-sm">
      {{ t.loadFailed }}
    </p>
    <p v-else-if="!lists[tab].length" class="text-muted-foreground py-10 text-center text-sm">
      {{ t.empty }}
    </p>
    <ul v-else class="flex flex-col gap-2">
      <li v-for="m in lists[tab]" :key="m.id">
        <NuxtLink :to="`/s/${sid}/missions/${m.id}`" class="hover:bg-muted/50 flex flex-col gap-1 rounded-lg border p-4">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-medium">{{ m.title }}</span>
            <Badge variant="secondary">
              {{ t.typeShort[m.type] }}
            </Badge>
            <Badge v-if="m.recurrence.kind !== 'once'" variant="outline">
              {{ t.recurrences[m.recurrence.kind] }}
            </Badge>
            <Badge v-if="m.isPersonal" variant="outline">
              {{ t.personal }}
            </Badge>
            <Badge v-if="m.closedAt" variant="destructive">
              {{ t.closed }}
            </Badge>
          </div>
          <span class="text-muted-foreground text-xs">
            {{ t.period(m.startDate, m.endDate) }}<template v-if="!m.isPersonal"> · {{ t.participants(m.participantIds.length) }}</template>
          </span>
        </NuxtLink>
      </li>
    </ul>

    <MissionFormDialog
      v-model:open="formOpen" :members="members" :personal="goal || personal" :today="today"
      @saved="(id) => navigateTo(`/s/${sid}/missions/${id}`)"
    />
  </div>
</template>
