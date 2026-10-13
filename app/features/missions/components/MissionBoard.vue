<script setup lang="ts">
import type { Mission, Submission } from '../services/missions'
import { periodKeys } from '#shared/schemas/mission'
import { toast } from 'vue-sonner'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'
import { listSubmissions, review } from '../services/missions'

/** MIS-30·31: 진행자·리뷰어용 현황판(참여자 × 최근 회차)과 검토 대기 목록 */
const props = defineProps<{ sid: string, mission: Mission, today: string, name: Map<string, string> }>()

const t = ko.missions
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const me = computed(() => auth.user?.uid ?? '')
const subs = ref<Submission[]>([])
const busy = ref(false)

const periods = computed(() => {
  const m = props.mission
  const until = m.endDate && m.endDate < props.today ? m.endDate : props.today
  return periodKeys(m, m.startDate, until).slice(-7).reverse()
})
const byKey = computed(() => new Map(subs.value.map(s => [`${s.uid}_${s.periodKey}`, s])))
const queue = computed(() => subs.value.filter(s => s.status === 'submitted' && s.reviewerUids.includes(me.value)))
const doneCount = (p: string) => props.mission.participantIds.filter(u => ['done', 'approved'].includes(byKey.value.get(`${u}_${p}`)?.status ?? '')).length

async function load() {
  subs.value = await listSubmissions($firestore, props.sid, props.mission.id).catch(() => [])
}
onMounted(load)
watch(() => props.mission.id, load)

async function decide(s: Submission, approve: boolean) {
  let reason = ''
  if (!approve) {
    const r = await promptDialog(`${t.board.rejectTitle} — ${t.board.rejectHint}`)
    if (r === null) return
    reason = r
  }
  busy.value = true
  try {
    await review($firestore, props.sid, props.mission.id, s.id, me.value, approve, reason)
    toast.success(t.board.reviewed)
    await load()
  }
  catch (e) { toast.error(errorMessage(e) ?? ko.errors.unknown) }
  finally { busy.value = false }
}
</script>

<template>
  <section class="flex flex-col gap-3" :aria-label="t.board.title">
    <h2 class="text-lg font-semibold">
      {{ t.board.title }}
    </h2>
    <p v-if="!mission.participantIds.length" class="text-muted-foreground text-sm">
      {{ t.board.empty }}
    </p>
    <div v-else class="overflow-x-auto rounded-lg border">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b">
            <th class="p-2 text-left font-medium">
              {{ t.board.member }}
            </th>
            <th v-for="p in periods" :key="p" class="p-2 text-left font-medium whitespace-nowrap">
              {{ p === 'once' ? t.mine.once : p.slice(5) }}
              <div class="text-muted-foreground text-xs font-normal">
                {{ t.board.rate(doneCount(p), mission.participantIds.length) }}
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in mission.participantIds" :key="u" class="border-b last:border-0">
            <td class="p-2 whitespace-nowrap">
              {{ name.get(u) ?? '?' }}
            </td>
            <td v-for="p in periods" :key="p" class="p-2">
              <Badge :variant="byKey.get(`${u}_${p}`) ? 'secondary' : 'outline'">
                {{ t.status[byKey.get(`${u}_${p}`)?.status ?? 'none'] }}
              </Badge>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <template v-if="queue.length">
      <h3 class="font-medium">
        {{ t.board.queue(queue.length) }}
      </h3>
      <ul class="flex flex-col divide-y rounded-lg border">
        <li v-for="s in queue" :key="s.id" class="flex flex-col gap-2 p-3 text-sm">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-medium">{{ name.get(s.uid) ?? '?' }}</span>
            <span class="text-muted-foreground">{{ s.periodKey === 'once' ? t.mine.once : s.periodKey }}</span>
            <Badge v-if="s.late" variant="outline">
              {{ t.mine.late }}
            </Badge>
            <NuxtLink v-if="s.pageId" :to="`/s/${sid}/notes/${s.pageId}`" class="text-primary underline">
              {{ t.board.openNote }}
            </NuxtLink>
            <span class="flex-1" />
            <Button size="sm" :disabled="busy" @click="decide(s, true)">
              {{ t.board.approve }}
            </Button>
            <Button size="sm" variant="outline" :disabled="busy" @click="decide(s, false)">
              {{ t.board.reject }}
            </Button>
          </div>
          <p v-if="s.content" class="whitespace-pre-wrap">
            {{ s.content }}
          </p>
        </li>
      </ul>
    </template>
  </section>
</template>
