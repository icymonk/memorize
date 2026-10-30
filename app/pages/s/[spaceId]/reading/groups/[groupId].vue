<script setup lang="ts">
import type { ScheduleItem } from '#shared/reading-groups'
import type { GroupComment, ReadingGroup } from '~/features/reading/services/groups'
import type { ShelfItem } from '~/features/reading/services/shelf'
import type { Member } from '~/features/space/services/invites'
import { dateKey } from '#shared/dates'
import { currentItem, expectedPosition, isAssigned, isSpoiler, pace, readerPosition, scheduleEnd, scheduleItem } from '#shared/reading-groups'
import { Trash2Icon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { z } from 'zod'
import ScheduleEditor from '~/features/reading/components/ScheduleEditor.vue'
import { addGroupComment, deleteReadingGroup, getParticipantShelves, getReadingGroup, joinReadingGroup, leaveReadingGroup, removeGroupComment, updateReadingGroup, watchGroupComments } from '~/features/reading/services/groups'
import { listMembers } from '~/features/space/services/invites'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'

/** READ-40~45 함께 읽기: 참여하기·나가기, 진행 현황, 챕터 일정(진행자만 수정)·챕터별 이야기 */
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
const shelves = ref<Record<string, ShelfItem | null>>({})
const editing = ref(false)
const draft = ref<ScheduleItem[]>([])
const busy = ref(false)
const comments = ref<GroupComment[]>([])
const openItem = ref<string | null>(null)
const revealed = ref<string[]>([])
const text = ref('')
const myGroups = computed(() => (members.value.find(m => m.uid === me.value) as (Member & { groupIds?: string[] }) | undefined)?.groupIds ?? [])
const isHost = computed(() => !!g.value?.hostIds.includes(me.value))
const joined = computed(() => !!g.value?.participantIds.includes(me.value))
const canJoin = computed(() => !!g.value && !joined.value && !g.value.closedAt && (g.value.joinable || isAssigned(g.value, me.value, myGroups.value)))
const name = (uid: string) => members.value.find(m => m.uid === uid)?.displayName ?? ko.reading.someone
const sorted = computed(() => [...(g.value?.schedule ?? [])].sort((a, b) => a.dueDate.localeCompare(b.dueDate)))
const current = computed(() => (g.value ? currentItem(g.value.schedule, today) : null))
const unitLabel = computed(() => (g.value ? ko.reading.log.units[g.value.unit] ?? '' : ''))

const total = computed(() => (g.value ? scheduleEnd(g.value.schedule) ?? (g.value.unit === 'percent' ? 100 : null) : null))
const expected = computed(() => (g.value ? expectedPosition(g.value.schedule, g.value.startAt, today) : null))
const posOf = (uid: string) => (g.value ? readerPosition(shelves.value[uid], g.value.unit, total.value) : 0)
const progress = computed(() => (g.value?.participantIds ?? []).map((uid) => {
  const pos = posOf(uid)
  return { uid, pos, pct: total.value ? Math.min(100, Math.round((pos / total.value) * 100)) : null, pace: pace(pos, expected.value, total.value) }
}))
const myPos = computed(() => posOf(me.value))
const myDone = computed(() => shelves.value[me.value]?.status === 'done')
const talkOf = (itemId: string) => comments.value.filter(c => c.itemId === itemId)
const hidden = (s: ScheduleItem) => isSpoiler(s, myPos.value, myDone.value) && !revealed.value.includes(s.id)
const paceClass: Record<string, string> = { ahead: 'text-emerald-700 dark:text-emerald-400', onTrack: 'text-muted-foreground', behind: 'text-destructive' }

async function load() {
  const x = await getReadingGroup($firestore, sid.value, gid.value)
  const [m, s] = await Promise.all([listMembers($firestore, sid.value), x ? getParticipantShelves($firestore, sid.value, x.bookKey, [...new Set([...x.participantIds, me.value])]) : {}])
  g.value = x
  members.value = m
  shelves.value = s
  loaded.value = true
}
onMounted(() => load().catch(e => toast.error(errorMessage(e) ?? ko.errors.unknown)))

let stop: (() => void) | null = null
watch(joined, (v) => {
  stop?.()
  stop = null
  comments.value = []
  if (v) stop = watchGroupComments($firestore, sid.value, gid.value, list => comments.value = list, e => toast.error(errorMessage(e) ?? ko.errors.unknown))
})
onBeforeUnmount(() => stop?.())

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
const join = () => run(() => joinReadingGroup($firestore, sid.value, me.value, g.value!, !!shelves.value[me.value], today), t.joined)
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

function toggleTalk(id: string) {
  openItem.value = openItem.value === id ? null : id
  text.value = ''
}
async function send(itemId: string) {
  const body = text.value.trim().slice(0, 1000)
  if (!body) return
  try {
    await addGroupComment($firestore, sid.value, gid.value, me.value, itemId, body)
    text.value = ''
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
}
async function removeTalk(c: GroupComment) {
  if (!await confirmDialog(t.removeCommentConfirm)) return
  await removeGroupComment($firestore, sid.value, gid.value, c.id).catch(e => toast.error(errorMessage(e) ?? ko.errors.unknown))
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

      <section class="flex flex-col gap-2" data-testid="group-progress">
        <div class="flex items-baseline justify-between gap-2">
          <h2 class="font-medium">
            {{ t.progressTitle }}
          </h2>
          <span v-if="expected != null" class="text-muted-foreground text-xs">{{ t.expected(expected, unitLabel) }}</span>
        </div>
        <ul class="flex flex-col gap-2">
          <li v-for="r in progress" :key="r.uid" class="flex flex-col gap-1">
            <div class="flex items-center justify-between gap-2 text-sm">
              <span>{{ name(r.uid) }}<span v-if="g.hostIds.includes(r.uid)" class="text-muted-foreground ml-1 text-xs">{{ t.hosts }}</span></span>
              <span class="flex items-center gap-2">
                <span class="text-muted-foreground text-xs">{{ t.position(r.pos, total, unitLabel) }}</span>
                <span v-if="r.pace" class="text-xs font-medium" :class="paceClass[r.pace]">{{ t.pace[r.pace] }}</span>
              </span>
            </div>
            <div v-if="r.pct != null" class="bg-secondary h-2 overflow-hidden rounded-full" role="progressbar" :aria-valuenow="r.pct" aria-valuemin="0" aria-valuemax="100" :aria-label="name(r.uid)">
              <div class="bg-primary h-full" :style="{ width: `${r.pct}%` }" />
            </div>
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
          <li v-for="s in sorted" :key="s.id" :class="current?.id === s.id && 'bg-accent/50'">
            <button type="button" class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm" :aria-expanded="openItem === s.id" @click="toggleTalk(s.id)">
              <span class="font-medium">{{ s.label }}<span v-if="current?.id === s.id" class="text-primary ml-2 text-xs">{{ t.current }}</span></span>
              <span>{{ t.range(s.from, s.to, unitLabel) }}</span>
              <span class="text-muted-foreground">{{ s.dueDate }}</span>
              <span v-if="joined" class="text-muted-foreground text-xs">{{ t.talkCount(talkOf(s.id).length) }}</span>
            </button>
            <div v-if="openItem === s.id" class="flex flex-col gap-2 border-t px-3 py-3" :data-testid="`talk-${s.id}`">
              <p v-if="!joined" class="text-muted-foreground text-sm">
                {{ t.joinToTalk }}
              </p>
              <template v-else>
                <div v-if="hidden(s) && talkOf(s.id).some(c => c.uid !== me)" class="bg-muted flex flex-wrap items-center justify-between gap-2 rounded-md p-3 text-sm">
                  <span>{{ t.spoiler }}</span>
                  <Button size="sm" variant="outline" @click="revealed = [...revealed, s.id]">
                    {{ t.reveal }}
                  </Button>
                </div>
                <ul v-else class="flex flex-col gap-2">
                  <li v-for="c in talkOf(s.id)" :key="c.id" class="flex items-start justify-between gap-2 text-sm">
                    <p class="whitespace-pre-wrap">
                      <span class="font-medium">{{ name(c.uid) }}</span> {{ c.body }}
                    </p>
                    <Button v-if="c.uid === me || isHost" variant="ghost" size="icon" class="size-7 shrink-0" :aria-label="t.removeComment" @click="removeTalk(c)">
                      <Trash2Icon />
                    </Button>
                  </li>
                </ul>
                <form class="flex gap-2" @submit.prevent="send(s.id)">
                  <Input v-model="text" maxlength="1000" :placeholder="t.talkPlaceholder" :aria-label="t.talkPlaceholder" />
                  <Button type="submit" size="sm" :disabled="!text.trim()">
                    {{ t.send }}
                  </Button>
                </form>
              </template>
            </div>
          </li>
        </ol>
      </section>
    </template>
  </div>
</template>
