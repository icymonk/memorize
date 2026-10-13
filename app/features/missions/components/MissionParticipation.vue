<script setup lang="ts">
import type { Mission, Submission } from '../services/missions'
import { periodKeys } from '#shared/schemas/mission'
import { toast } from 'vue-sonner'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'
import { isFinished, listMySubmissions, setJoined, submit, withdraw } from '../services/missions'

/** MIS-01·20~24: 내 진행 — 참여하기·그만두기, 회차별 완료 체크·제출·회수 */
const props = defineProps<{ sid: string, mission: Mission, today: string }>()
const emit = defineEmits<{ changed: [] }>()

const t = ko.missions
const auth = useAuthStore()
const notes = useNotesStore()
const { $firestore } = useNuxtApp()

const me = computed(() => auth.user?.uid ?? '')
const m = computed(() => props.mission)
const joined = computed(() => m.value.participantIds.includes(me.value))
const finished = computed(() => isFinished(m.value, props.today))
const subs = ref(new Map<string, Submission>())
const busy = ref(false)
const editing = ref<string | null>(null)
const content = ref('')
const pageId = ref('')

/** 반복 미션은 오늘까지의 최근 14회차, 최신이 위 */
const periods = computed(() => {
  const until = m.value.endDate && m.value.endDate < props.today ? m.value.endDate : props.today
  return periodKeys(m.value, m.value.startDate, until).slice(-14).reverse()
})
const myPages = computed(() => notes.pages.filter(p => p.ownerId === me.value && !p.deletedAt))
const label = (p: string) => p === 'once' ? t.mine.once : p
/** 지난 회차는 늦은 제출을 허용한 경우만 (MIS-23) */
const canAct = (p: string) => !finished.value && (p === 'once' || p === props.today || m.value.allowLate)

async function load() {
  if (!joined.value) return
  const list = await listMySubmissions($firestore, props.sid, m.value.id, me.value).catch(() => [])
  subs.value = new Map(list.map(s => [s.periodKey, s]))
}
onMounted(load)
watch(() => [m.value.id, joined.value], load)

async function run(fn: () => Promise<unknown>, ok?: string) {
  busy.value = true
  try {
    await fn()
    if (ok) toast.success(ok)
    await load()
  }
  catch (e) { toast.error(errorMessage(e) ?? ko.errors.unknown) }
  finally { busy.value = false }
}

const toggleCheck = (p: string) => run(() => subs.value.has(p)
  ? withdraw($firestore, props.sid, m.value.id, me.value, p)
  : submit($firestore, props.sid, m.value, me.value, p, props.today))

function startSubmit(p: string) {
  const cur = subs.value.get(p)
  content.value = cur?.content ?? ''
  pageId.value = cur?.pageId ?? ''
  editing.value = p
}
async function sendSubmit(p: string) {
  await run(() => submit($firestore, props.sid, m.value, me.value, p, props.today, { content: content.value.trim(), pageId: pageId.value || null }), t.mine.submitted)
  editing.value = null
}

async function join(v: boolean) {
  if (!v && !(await confirmDialog(t.mine.leaveConfirm))) return
  await run(() => setJoined($firestore, props.sid, m.value, me.value, v), v ? t.mine.joined : undefined)
  emit('changed')
}
</script>

<template>
  <section class="flex flex-col gap-3" :aria-label="t.mine.title">
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-lg font-semibold">
        {{ t.mine.title }}
      </h2>
      <Button v-if="joined && m.joinable && !m.hostIds.includes(me) && !finished" variant="ghost" size="sm" :disabled="busy" @click="join(false)">
        {{ t.mine.leave }}
      </Button>
    </div>

    <div v-if="!joined" class="flex items-center gap-3 rounded-lg border p-4 text-sm">
      <span class="text-muted-foreground flex-1">{{ t.mine.notParticipant }}</span>
      <Button v-if="m.joinable && !finished" size="sm" :disabled="busy" @click="join(true)">
        {{ t.mine.join }}
      </Button>
    </div>

    <p v-else-if="!periods.length" class="text-muted-foreground text-sm">
      {{ t.mine.notYet }}
    </p>

    <ul v-else class="flex flex-col divide-y rounded-lg border">
      <li v-for="p in periods" :key="p" class="flex flex-col gap-2 p-3">
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span class="w-28 font-medium">{{ label(p) }}</span>
          <template v-if="m.type === 'check'">
            <label class="flex items-center gap-2">
              <input type="checkbox" class="size-4" :checked="subs.has(p)" :disabled="busy || !canAct(p)" @change="toggleCheck(p)">
              {{ t.mine.done }}
            </label>
          </template>
          <template v-else>
            <Badge :variant="subs.get(p)?.status === 'rejected' ? 'destructive' : subs.has(p) ? 'secondary' : 'outline'">
              {{ t.status[subs.get(p)?.status ?? 'none'] }}
            </Badge>
            <Button v-if="canAct(p) && (!subs.has(p) || subs.get(p)!.status === 'rejected')" size="sm" variant="outline" @click="startSubmit(p)">
              {{ subs.has(p) ? t.mine.resubmit : t.mine.submit }}
            </Button>
            <Button v-if="canAct(p) && subs.get(p)?.status === 'submitted'" size="sm" variant="ghost" :disabled="busy" @click="run(() => withdraw($firestore, sid, m.id, me, p))">
              {{ t.mine.withdraw }}
            </Button>
          </template>
          <Badge v-if="subs.get(p)?.late" variant="outline">
            {{ t.mine.late }}
          </Badge>
        </div>
        <p v-if="subs.get(p)?.reason" class="text-destructive text-xs">
          {{ t.mine.reason(subs.get(p)!.reason!) }}
        </p>
        <p v-if="subs.get(p)?.content && editing !== p" class="text-muted-foreground text-sm whitespace-pre-wrap">
          {{ subs.get(p)!.content }}
        </p>
        <form v-if="editing === p" class="flex flex-col gap-2" @submit.prevent="sendSubmit(p)">
          <Label :for="`sub-${p}`">{{ t.mine.content }}</Label>
          <Textarea :id="`sub-${p}`" v-model="content" rows="4" maxlength="5000" />
          <Label :for="`sub-page-${p}`">{{ t.mine.page }}</Label>
          <select :id="`sub-page-${p}`" v-model="pageId" class="border-input bg-background h-9 rounded-md border px-3 text-sm">
            <option value="">
              {{ t.mine.pageNone }}
            </option>
            <option v-for="pg in myPages" :key="pg.id" :value="pg.id">
              {{ pg.icon }} {{ pg.title || ko.notes.untitled }}
            </option>
          </select>
          <p class="text-muted-foreground text-xs">
            {{ t.mine.pageHint }}
          </p>
          <div class="flex gap-2">
            <Button type="submit" size="sm" :disabled="busy || (!content.trim() && !pageId)">
              {{ t.mine.submit }}
            </Button>
            <Button type="button" size="sm" variant="ghost" @click="editing = null">
              {{ ko.dialog.cancel }}
            </Button>
          </div>
        </form>
      </li>
    </ul>
  </section>
</template>
