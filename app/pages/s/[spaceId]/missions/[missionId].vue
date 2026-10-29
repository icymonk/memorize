<script setup lang="ts">
import type { Mission } from '~/features/missions/services/missions'
import type { Member } from '~/features/space/services/invites'
import { dateKey } from '#shared/dates'
import { ArrowLeftIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import MissionFormDialog from '~/features/missions/components/MissionFormDialog.vue'
import MissionBoard from '~/features/missions/components/MissionBoard.vue'
import MissionParticipation from '~/features/missions/components/MissionParticipation.vue'
import { deleteMission, getMission, isFinished, setMissionClosed } from '~/features/missions/services/missions'
import { listMembers } from '~/features/space/services/invites'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'

/** 미션 상세: 설명·일정·대상, 진행자는 수정·조기 종료 (MIS-34). 현황판·검토는 2-E3 */
const t = ko.missions
const route = useRoute()
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()

const sid = computed(() => route.params.spaceId as string)
const id = computed(() => route.params.missionId as string)
const today = dateKey(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone)

const mission = ref<Mission | null>(null)
const members = ref<Member[]>([])
const loading = ref(true)
const editOpen = ref(false)
const busy = ref(false)

const me = computed(() => auth.user?.uid ?? '')
const isHost = computed(() => !!mission.value?.hostIds.includes(me.value))
const name = computed(() => new Map(members.value.map(m => [m.uid, m.displayName])))
const names = (ids: string[]) => ids.map(u => name.value.get(u) ?? '?').join(', ')
const schedule = computed(() => {
  const m = mission.value
  if (!m) return ''
  const rec = m.recurrence.kind === 'weekly'
    ? `${t.recurrences.weekly} (${m.recurrence.weekdays.map(d => t.weekdays[d]).join('·')})`
    : t.recurrences[m.recurrence.kind]
  return `${rec} · ${t.period(m.startDate, m.endDate)}`
})

async function load() {
  loading.value = true
  try {
    const [m, mb] = await Promise.all([getMission($firestore, sid.value, id.value), listMembers($firestore, sid.value)])
    mission.value = m
    members.value = mb
  }
  catch {
    mission.value = null
  }
  finally {
    loading.value = false
  }
}
onMounted(load)
watch(id, load)

async function toggleClosed() {
  const m = mission.value!
  if (!m.closedAt && !(await confirmDialog(t.closeConfirm, { destructive: true }))) return
  busy.value = true
  try {
    await setMissionClosed($firestore, sid.value, m.id, !m.closedAt)
    await load()
  }
  catch (e) { toast.error(errorMessage(e) ?? ko.errors.unknown) }
  finally { busy.value = false }
}

async function remove() {
  if (!(await confirmDialog(t.deleteConfirm, { destructive: true }))) return
  try {
    await deleteMission($firestore, sid.value, mission.value!.id)
    await navigateTo(`/s/${sid.value}/missions`, { replace: true })
  }
  catch (e) { toast.error(errorMessage(e) ?? ko.errors.unknown) }
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
    <NuxtLink :to="`/s/${sid}/missions`" class="text-muted-foreground flex items-center gap-1 text-sm">
      <ArrowLeftIcon class="size-4" />
      {{ t.title }}
    </NuxtLink>

    <p v-if="loading" class="text-muted-foreground text-sm">
      …
    </p>
    <p v-else-if="!mission" class="text-muted-foreground text-sm">
      {{ t.notFound }}
    </p>
    <template v-else>
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="flex flex-col gap-2">
          <h1 class="text-2xl font-semibold">
            {{ mission.title }}
          </h1>
          <div class="flex flex-wrap gap-2">
            <Badge variant="secondary">
              {{ t.typeShort[mission.type] }}
            </Badge>
            <Badge v-if="mission.isPersonal" variant="outline">
              {{ t.personal }}
            </Badge>
            <Badge v-if="mission.closedAt" variant="destructive">
              {{ t.closed }}
            </Badge>
            <Badge v-else-if="isFinished(mission, today)" variant="outline">
              {{ t.ended }}
            </Badge>
          </div>
        </div>
        <div v-if="isHost" class="flex gap-2">
          <Button v-if="mission.type !== 'auto'" variant="outline" size="sm" @click="editOpen = true">
            {{ t.edit }}
          </Button>
          <Button variant="outline" size="sm" :disabled="busy" @click="toggleClosed">
            {{ mission.closedAt ? t.reopen : t.close }}
          </Button>
          <Button v-if="mission.isPersonal" variant="ghost" size="sm" @click="remove">
            {{ t.delete }}
          </Button>
        </div>
      </div>

      <p class="text-muted-foreground text-sm">
        {{ schedule }}
      </p>
      <p v-if="mission.description" class="text-sm whitespace-pre-wrap">
        {{ mission.description }}
      </p>
      <Button v-if="mission.linked?.type === 'test'" variant="outline" size="sm" class="self-start" as-child>
        <NuxtLink :to="`/s/${sid}/tests/${mission.linked.id}`">{{ t.mine.goTest }}</NuxtLink>
      </Button>

      <dl v-if="!mission.isPersonal" class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt class="text-muted-foreground">
          {{ t.hosts }}
        </dt>
        <dd>{{ names(mission.hostIds) }}</dd>
        <template v-if="mission.reviewerIds.length">
          <dt class="text-muted-foreground">
            {{ t.reviewersLabel }}
          </dt>
          <dd>{{ names(mission.reviewerIds) }}</dd>
        </template>
        <dt class="text-muted-foreground">
          {{ t.participantsLabel }}
        </dt>
        <dd>{{ names(mission.participantIds) || '-' }}</dd>
      </dl>

      <MissionBoard v-if="mission.hostIds.includes(auth.user?.uid ?? '') || mission.reviewerIds.includes(auth.user?.uid ?? '')" :sid="sid" :mission="mission" :today="today" :name="name" />

      <MissionParticipation :sid="sid" :mission="mission" :today="today" @changed="load" />

      <MissionFormDialog
        v-if="mission.type !== 'auto'"
        v-model:open="editOpen" :mission="mission" :members="members" :personal="mission.isPersonal" :today="today"
        @saved="load"
      />
    </template>
  </div>
</template>
