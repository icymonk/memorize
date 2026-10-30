<script setup lang="ts">
import type { StudySettings } from '#shared/study-settings'
import { DEFAULT_STUDY, STUDY_LIMITS, studySettings as studySchema } from '#shared/study-settings'
import { useStudySettings } from '~/features/vocab/composables/useStudySettings'
import type { StorageUsage } from '#shared/schemas/upload'
import type { Upload } from '~/features/files/services/uploads'
import { formatBytes, storageLevel } from '#shared/schemas/upload'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { toast } from 'vue-sonner'
import { getStorageUsage, listMyUploads, removeUpload } from '~/features/files/services/uploads'
import { getMembership, getSpace, getUserSpaceIds, updateMyMembership } from '~/features/space/services/spaces'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'

definePageMeta({ layout: 'focus' })

/** ACC-23 화면, ACC-11·22 워크스페이스별 설정, ACC-20 알림 설정: 종류별 알림함 켜기/끄기. 서버 트리거가 users/{uid}.notifications.{type}.inApp 을 읽는다 */
const t = ko.accountSettings
const auth = useAuthStore()
const { $firestore, $functions } = useNuxtApp()

// CMN-62 저장 공간
const usage = ref<StorageUsage | null>(null)
const uploads = ref<Upload[]>([])
async function loadFiles() {
  const uid = auth.user?.uid
  if (!uid) return
  const [u, list] = await Promise.all([getStorageUsage($firestore, uid), listMyUploads($firestore, uid)]).catch(() => [null, []] as [null, Upload[]])
  usage.value = u
  uploads.value = list
}
onMounted(loadFiles)
async function removeFile(f: Upload) {
  if (!(await confirmDialog(ko.files.removeConfirm(f.name)))) return
  try {
    await removeUpload($functions, f.id)
    toast.success(ko.files.removed)
    await loadFiles()
  }
  catch (e) { toast.error(errorMessage(e) ?? ko.errors.unknown) }
}
const types = ['mention', 'comment', 'feedbackRequest', 'feedback', 'mission', 'missionReview', 'group', 'test'] as const
type Kind = typeof types[number]
const enabled = ref<Record<Kind, boolean>>({ mention: true, comment: true, feedbackRequest: true, feedback: true, mission: true, missionReview: true, group: true, test: true })
const loaded = ref(false)

watch(() => auth.user?.uid, async (uid) => {
  if (!uid) return
  const prefs = (await getDoc(doc($firestore, 'users', uid))).get('notifications') ?? {}
  for (const k of types) enabled.value[k] = prefs[k]?.inApp !== false
  loaded.value = true
}, { immediate: true })

const appearance = useAppearance()
const themes = ['system', 'light', 'dark'] as const
const fontSizes = ['sm', 'md', 'lg'] as const

interface Row { sid: string, name: string, displayName: string, saved: string, hideProgress: boolean }
const rows = ref<Row[] | null>(null)

watch(() => auth.user?.uid, async (uid) => {
  if (!uid) return
  const ids = await getUserSpaceIds($firestore, uid).catch(() => [] as string[])
  const list = await Promise.all(ids.map(async (sid) => {
    const s = await getSpace($firestore, sid).catch(() => null)
    if (!s || s.kind !== 'workspace' || s.deleteScheduledAt) return null
    const m = await getMembership($firestore, sid, uid).catch(() => null)
    if (!m || m.status !== 'active') return null
    return { sid, name: s.name, displayName: m.displayName, saved: m.displayName, hideProgress: m.hideProgress === true }
  }))
  rows.value = list.filter((r): r is Row => !!r)
}, { immediate: true })

async function saveMember(r: Row, patch: { displayName?: string, hideProgress?: boolean }, undo: () => void) {
  try {
    await updateMyMembership($firestore, r.sid, auth.user!.uid, patch)
    if (patch.displayName) r.saved = patch.displayName
    toast.success(t.saved)
  }
  catch (e) {
    undo()
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
}

function saveName(r: Row) {
  const name = r.displayName.trim()
  if (!name || name.length > 40) {
    r.displayName = r.saved
    return
  }
  if (name !== r.saved) saveMember(r, { displayName: name }, () => { r.displayName = r.saved })
}

function setHide(r: Row, v: boolean) {
  r.hideProgress = v
  saveMember(r, { hideProgress: v }, () => { r.hideProgress = !v })
}

// ACC-24 학습 설정
const studyStore = useStudySettings()
const study = ref<StudySettings>({ ...DEFAULT_STUDY })
const studyLoaded = ref(false)
const studySaving = ref(false)
const studySaved = ref(false)
watch(study, () => (studySaved.value = false), { deep: true })
onMounted(async () => {
  study.value = { ...(await studyStore.load()) }
  studyLoaded.value = true
})
async function saveStudy() {
  const p = studySchema.safeParse(study.value)
  if (!p.success) {
    toast.error(t.study.invalid(STUDY_LIMITS.newMax, STUDY_LIMITS.reviewMin, STUDY_LIMITS.reviewMax))
    return
  }
  studySaving.value = true
  try {
    await updateDoc(doc($firestore, 'users', auth.user!.uid), { study: p.data })
    studyStore.set(p.data)
    studySaved.value = true
    toast.success(t.saved)
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
  finally {
    studySaving.value = false
  }
}

async function toggle(k: Kind, v: boolean) {
  const prev = enabled.value[k]
  enabled.value[k] = v
  try {
    await updateDoc(doc($firestore, 'users', auth.user!.uid), { [`notifications.${k}.inApp`]: v })
    toast.success(t.saved)
  }
  catch (e) {
    enabled.value[k] = prev
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-2xl space-y-6 p-6">
    <h1 class="text-2xl font-semibold">
      {{ t.title }}
    </h1>
    <section class="space-y-3">
      <h2 class="text-lg font-medium">
        {{ t.appearance }}
      </h2>
      <p class="text-sm text-muted-foreground">
        {{ t.appearanceHint }}
      </p>
      <div class="space-y-3 rounded-md border p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm font-medium">
            {{ t.theme.label }}
          </p>
          <div class="flex gap-1">
            <Button v-for="v in themes" :key="v" size="sm" :variant="appearance.theme === v ? 'default' : 'outline'" @click="appearance.theme = v">
              {{ t.theme[v] }}
            </Button>
          </div>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm font-medium">
            {{ t.fontSize.label }}
          </p>
          <div class="flex gap-1">
            <Button v-for="v in fontSizes" :key="v" size="sm" :variant="appearance.fontSize === v ? 'default' : 'outline'" @click="appearance.fontSize = v">
              {{ t.fontSize[v] }}
            </Button>
          </div>
        </div>
      </div>
    </section>
    <section class="space-y-3">
      <h2 class="text-lg font-medium">
        {{ t.workspaces }}
      </h2>
      <p class="text-sm text-muted-foreground">
        {{ t.workspacesHint }}
      </p>
      <p v-if="rows && !rows.length" class="text-sm text-muted-foreground">
        {{ t.noWorkspaces }}
      </p>
      <ul v-else-if="rows" class="divide-y rounded-md border">
        <li v-for="r in rows" :key="r.sid" class="space-y-3 p-3">
          <p class="text-sm font-medium">
            {{ r.name }}
          </p>
          <div class="flex items-center gap-3">
            <Label :for="`name-${r.sid}`" class="shrink-0 text-sm text-muted-foreground">{{ t.displayName }}</Label>
            <Input :id="`name-${r.sid}`" v-model="r.displayName" maxlength="40" class="h-8" @blur="saveName(r)" @keydown.enter="($event.target as HTMLInputElement).blur()" />
          </div>
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-sm">
                {{ t.hideProgress }}
              </p>
              <p class="text-sm text-muted-foreground">
                {{ t.hideProgressDesc }}
              </p>
            </div>
            <Switch :model-value="r.hideProgress" :aria-label="t.hideProgress" @update:model-value="(v: boolean) => setHide(r, v)" />
          </div>
        </li>
      </ul>
    </section>
    <section class="space-y-3">
      <h2 class="text-lg font-medium">
        {{ ko.files.title }}
      </h2>
      <p class="text-sm text-muted-foreground">
        {{ ko.files.hint }}
      </p>
      <template v-if="usage">
        <div class="bg-muted h-2 overflow-hidden rounded-full">
          <div class="h-full" :class="storageLevel(usage.usedBytes, usage.limitBytes) === 'ok' ? 'bg-primary' : 'bg-destructive'" :style="{ width: `${Math.min(100, usage.usedBytes / usage.limitBytes * 100)}%` }" />
        </div>
        <p class="text-sm">
          {{ ko.files.usage(formatBytes(usage.usedBytes), formatBytes(usage.limitBytes)) }}
        </p>
        <p v-if="storageLevel(usage.usedBytes, usage.limitBytes) !== 'ok'" class="text-destructive text-sm">
          {{ ko.files.warn }}
        </p>
      </template>
      <p v-if="!uploads.length" class="text-sm text-muted-foreground">
        {{ ko.files.empty }}
      </p>
      <template v-else>
        <p class="text-sm font-medium">
          {{ ko.files.largest }}
        </p>
        <ul class="divide-y rounded-md border">
          <li v-for="f in uploads.slice(0, 50)" :key="f.id" class="flex items-center gap-3 p-2">
            <span class="min-w-0 flex-1 truncate text-sm" :title="f.name">{{ f.name }}</span>
            <span class="text-muted-foreground text-xs">{{ formatBytes(f.size) }}</span>
            <Button variant="ghost" size="sm" @click="removeFile(f)">
              {{ ko.files.remove }}
            </Button>
          </li>
        </ul>
      </template>
    </section>
    <section class="space-y-3">
      <h2 class="text-lg font-medium">
        {{ ko.former.title }}
      </h2>
      <p class="text-sm text-muted-foreground">
        {{ ko.former.hint }}
      </p>
      <Button variant="outline" size="sm" as-child>
        <NuxtLink to="/former">
          {{ ko.former.open }}
        </NuxtLink>
      </Button>
    </section>
    <section class="space-y-3">
      <h2 class="text-lg font-medium">
        {{ t.notifications }}
      </h2>
      <p class="text-sm text-muted-foreground">
        {{ t.hint }}
      </p>
      <ul class="divide-y rounded-md border">
        <li v-for="k in types" :key="k" class="flex items-center justify-between gap-4 p-3">
          <div>
            <p class="text-sm font-medium">
              {{ t.types[k].label }}
            </p>
            <p class="text-sm text-muted-foreground">
              {{ t.types[k].desc }}
            </p>
          </div>
          <Switch :disabled="!loaded" :model-value="enabled[k]" :aria-label="t.types[k].label" @update:model-value="(v: boolean) => toggle(k, v)" />
        </li>
      </ul>
    </section>
    <section class="space-y-3" data-testid="study-settings">
      <h2 class="text-lg font-medium">
        {{ t.study.title }}
      </h2>
      <p class="text-sm text-muted-foreground">
        {{ t.study.desc }}
      </p>
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="space-y-1">
          <Label for="study-new">{{ t.study.newCards }}</Label>
          <Input id="study-new" type="number" min="0" :max="STUDY_LIMITS.newMax" :disabled="!studyLoaded" :model-value="study.dailyNewCards" @update:model-value="v => study.dailyNewCards = Number(v)" />
        </div>
        <div class="space-y-1">
          <Label for="study-review">{{ t.study.reviewCards }}</Label>
          <Input id="study-review" type="number" :min="STUDY_LIMITS.reviewMin" :max="STUDY_LIMITS.reviewMax" :disabled="!studyLoaded" :model-value="study.dailyReviewCards" @update:model-value="v => study.dailyReviewCards = Number(v)" />
        </div>
        <div class="space-y-1">
          <Label for="study-front">{{ t.study.front }}</Label>
          <select id="study-front" v-model="study.flashcardFront" :disabled="!studyLoaded" class="border-input bg-background h-9 w-full rounded-md border px-3 text-sm">
            <option value="front">{{ t.study.fronts.front }}</option>
            <option value="back">{{ t.study.fronts.back }}</option>
          </select>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <Button size="sm" :disabled="!studyLoaded || studySaving" @click="saveStudy">
          {{ t.study.save }}
        </Button>
        <span v-if="studySaved" class="text-sm text-muted-foreground">{{ t.study.savedNote }}</span>
      </div>
    </section>
  </div>
</template>
