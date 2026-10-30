<script setup lang="ts">
import type { ScheduleItem } from '#shared/reading-groups'
import type { ReadingGroup } from '~/features/reading/services/groups'
import type { Member } from '~/features/space/services/invites'
import { dateKey } from '#shared/dates'
import { currentItem, isAssigned, scheduleItem } from '#shared/reading-groups'
import { toast } from 'vue-sonner'
import { z } from 'zod'
import ScheduleEditor from '~/features/reading/components/ScheduleEditor.vue'
import { deleteReadingGroup, getReadingGroup, joinReadingGroup, leaveReadingGroup, updateReadingGroup } from '~/features/reading/services/groups'
import { listMyShelf } from '~/features/reading/services/shelf'
import { listMembers } from '~/features/space/services/invites'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'

/** READ-40·41·45 함께 읽기: 참여하기·나가기, 챕터 일정 (진행자만 수정) */
const t = ko.reading.groups
const space = useSpaceStore()
const auth = useAuthStore()
const route = useRoute()
const { $firestore } = useNuxtApp()
const sid = computed(() => space.current!.id)
const gid = computed(() => String(route.params.groupId))
const me = computed(() => auth.user!.uid)
const today = dateKey(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone)

const g = ref<ReadingGroup | null>(null)
const loaded = ref(false)
const members = ref<Member[]>([])
const onShelf = ref(false)
const editing = ref(false)
const draft = ref<ScheduleItem[]>([])
const busy = ref(false)
const myGroups = computed(() => (members.value.find(m => m.uid === me.value) as (Member & { groupIds?: string[] }) | undefined)?.groupIds ?? [])
const isHost = computed(() => !!g.value?.hostIds.includes(me.value))
const joined = computed(() => !!g.value?.participantIds.includes(me.value))
const canJoin = computed(() => !!g.value && !joined.value && !g.value.closedAt && (g.value.joinable || isAssigned(g.value, me.value, myGroups.value)))
const name = (uid: string) => members.value.find(m => m.uid === uid)?.displayName ?? ko.reading.someone
const sorted = computed(() => [...(g.value?.schedule ?? [])].sort((a, b) => a.dueDate.localeCompare(b.dueDate)))
const current = computed(() => (g.value ? currentItem(g.value.schedule, today) : null))
const unitLabel = computed(() => (g.value ? ko.reading.log.units[g.value.unit] ?? '' : ''))

async function load() {
  const [x, m, s] = await Promise.all([getReadingGroup($firestore, sid.value, gid.value), listMembers($firestore, sid.value), listMyShelf($firestore, sid.value, me.value)])
  g.value = x
  members.value = m
  onShelf.value = !!x && s.some(b => b.bookKey === x.bookKey)
  loaded.value = true
}
onMounted(() => load().catch(e => toast.error(errorMessage(e) ?? ko.errors.unknown)))

async function run(fn: () => Promise<unknown>, done: string) {
  busy.value = true
  try {
    await fn()
    toast.success(done)
    await load()
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
  finally {
    busy.value = false
  }
}
const join = () => run(() => joinReadingGroup($firestore, sid.value, me.value, g.value!, onShelf.value, today), t.joined)
const leave = () => run(() => leaveReadingGroup($firestore, sid.value, me.value, g.value!.id), t.left)

function editSchedule() {
  draft.value = g.value!.schedule.map(s => ({ ...s }))
  editing.value = true
}
async function saveSchedule() {
  const p = z.array(scheduleItem).max(52).safeParse(draft.value)
  if (!p.success) {
    toast.error(t.invalid)
    return
  }
  await run(() => updateReadingGroup($firestore, sid.value, g.value!.id, { schedule: p.data }), t.saved)
  editing.value = false
}
async function remove() {
  if (!await confirmDialog(t.removeConfirm)) return
  try {
    await deleteReadingGroup($firestore, sid.value, g.value!.id)
    toast.success(t.removed)
    await navigateTo(`/s/${sid.value}/reading/groups`)
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
    <NuxtLink :to="`/s/${sid}/reading/groups`" class="text-muted-foreground text-sm hover:underline">
      ← {{ t.back }}
    </NuxtLink>
    <p v-if="loaded && !g" class="text-muted-foreground text-sm">
      {{ t.notFound }}
    </p>
    <template v-else-if="g">
      <div class="flex flex-wrap items-start gap-4">
        <img v-if="g.book.cover" :src="g.book.cover" alt="" class="h-28 w-20 rounded border object-cover">
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <h1 class="text-2xl font-semibold">
            {{ g.book.title }}
          </h1>
          <p class="text-muted-foreground text-sm">
            {{ g.book.authors.join(', ') }}
          </p>
          <p class="text-sm">
            {{ t.period(g.startAt, g.endAt) }} · {{ t.participants(g.participantIds.length) }}
          </p>
        </div>
        <div class="flex gap-2">
          <Button v-if="canJoin" :disabled="busy" @click="join">
            {{ t.join }}
          </Button>
          <Button v-else-if="joined && !isHost" variant="outline" :disabled="busy" @click="leave">
            {{ t.leave }}
          </Button>
          <Button v-if="g.createdBy === me" variant="ghost" :disabled="busy" @click="remove">
            {{ t.remove }}
          </Button>
        </div>
      </div>

      <section class="flex flex-col gap-2" data-testid="group-participants">
        <h2 class="font-medium">
          {{ t.participantsTitle }}
        </h2>
        <ul class="flex flex-wrap gap-2">
          <li v-for="u in g.participantIds" :key="u" class="bg-secondary rounded-full px-2.5 py-1 text-sm">
            {{ name(u) }}<span v-if="g.hostIds.includes(u)" class="text-muted-foreground ml-1 text-xs">{{ t.hosts }}</span>
          </li>
        </ul>
      </section>

      <section class="flex flex-col gap-2" data-testid="group-schedule">
        <div class="flex items-center justify-between gap-2">
          <h2 class="font-medium">
            {{ t.schedule }}
          </h2>
          <Button v-if="isHost && !editing" size="sm" variant="outline" @click="editSchedule">
            {{ t.editSchedule }}
          </Button>
        </div>
        <template v-if="editing">
          <ScheduleEditor v-model="draft" :start-at="g.startAt" :end-at="g.endAt" :unit="g.unit" />
          <div class="flex gap-2">
            <Button size="sm" :disabled="busy" @click="saveSchedule">
              {{ t.saveSchedule }}
            </Button>
            <Button size="sm" variant="ghost" @click="editing = false">
              {{ t.cancel }}
            </Button>
          </div>
        </template>
        <p v-else-if="!sorted.length" class="text-muted-foreground text-sm">
          {{ t.noSchedule }}
        </p>
        <ol v-else class="flex flex-col divide-y rounded-lg border">
          <li v-for="s in sorted" :key="s.id" class="flex items-center justify-between gap-2 px-3 py-2 text-sm" :class="current?.id === s.id && 'bg-accent'">
            <span class="font-medium">{{ s.label }}<span v-if="current?.id === s.id" class="text-primary ml-2 text-xs">{{ t.current }}</span></span>
            <span>{{ t.range(s.from, s.to, unitLabel) }}</span>
            <span class="text-muted-foreground">{{ s.dueDate }}</span>
          </li>
        </ol>
      </section>
    </template>
  </div>
</template>
