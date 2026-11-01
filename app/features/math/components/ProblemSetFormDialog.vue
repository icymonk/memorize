<script setup lang="ts">
import type { ProblemSet } from '../services/problemSets'
import { CURRICULUM, findUnit } from '#shared/math/curriculum'
import { HINT_PENALTY_MAX, problemSetInput } from '#shared/schemas/problem-set'
import { toast } from 'vue-sonner'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'
import { saveProblemSet } from '../services/problemSets'

/** MATH-10·13 문제집 만들기·수정: 학년 → 단원(교육과정 목록 또는 직접 쓰기) */
const props = defineProps<{ set?: ProblemSet | null }>()
const emit = defineEmits<{ saved: [id: string] }>()
const open = defineModel<boolean>('open', { default: false })

const t = ko.math.set
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const personal = computed(() => space.current?.kind === 'personal')

const NONE = '_'
const empty = () => ({ title: '', description: '', grade: NONE, mode: 'pick' as 'pick' | 'custom', unit: NONE, concept: NONE, custom: '', share: false, membersEdit: false, hintPenalty: 0 })
const form = ref(empty())
const saving = ref(false)

const grade = computed(() => CURRICULUM.grades.find(g => g.grade === form.value.grade))
const unit = computed(() => grade.value?.areas.flatMap(a => a.units).find(u => u.code === form.value.unit))

watch(open, (v) => {
  if (!v) return
  const s = props.set
  form.value = empty()
  if (!s) return
  const f = findUnit(s.unit?.code)
  form.value = {
    title: s.title,
    description: s.description,
    grade: s.grade ?? NONE,
    mode: s.unit?.custom ? 'custom' : 'pick',
    unit: f?.unit.code ?? NONE,
    concept: f?.concept?.code ?? NONE,
    custom: s.unit?.custom ?? '',
    share: s.visibility === 'space',
    membersEdit: s.editPolicy === 'members',
    hintPenalty: s.hintPenalty ?? 0,
  }
})
watch(() => form.value.grade, (g, old) => {
  if (old !== undefined && g !== old && !grade.value?.areas.some(a => a.units.some(u => u.code === form.value.unit))) form.value.unit = NONE
})
watch(() => form.value.unit, () => {
  if (!unit.value?.children.some(c => c.code === form.value.concept)) form.value.concept = NONE
})

async function submit() {
  const v = form.value
  const code = v.mode === 'pick' && v.unit !== NONE ? (v.concept !== NONE ? v.concept : v.unit) : null
  const custom = v.mode === 'custom' && v.custom.trim() ? v.custom.trim() : null
  const parsed = problemSetInput.safeParse({
    title: v.title,
    description: v.description,
    grade: v.grade === NONE ? null : v.grade,
    unit: code || custom ? { code, custom } : null,
    visibility: !personal.value && v.share ? 'space' : 'private',
    editPolicy: v.membersEdit ? 'members' : 'owner',
    hintPenalty: Math.round(Number(v.hintPenalty) || 0),
  })
  if (!parsed.success) {
    toast.error(ko.errors.invalidInput)
    return
  }
  saving.value = true
  try {
    const id = await saveProblemSet($firestore, space.current!.id, auth.user!.uid, parsed.data, props.set)
    toast.success(t.saved)
    open.value = false
    emit('saved', id)
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90svh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ set ? t.edit : t.create }}</DialogTitle>
      </DialogHeader>
      <form id="set-form" class="flex flex-col gap-4" @submit.prevent="submit">
        <div class="flex flex-col gap-2">
          <Label for="set-title">{{ t.title }}</Label>
          <Input id="set-title" v-model="form.title" maxlength="80" />
        </div>
        <div class="flex flex-col gap-2">
          <Label for="set-desc">{{ t.description }}</Label>
          <Textarea id="set-desc" v-model="form.description" rows="2" maxlength="500" />
        </div>
        <div class="flex flex-col gap-2">
          <Label for="set-grade">{{ t.grade }}</Label>
          <Select v-model="form.grade">
            <SelectTrigger id="set-grade" class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem :value="NONE">{{ t.noGrade }}</SelectItem>
              <SelectItem v-for="g in CURRICULUM.grades" :key="g.grade" :value="g.grade">{{ g.name }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="flex flex-col gap-2">
          <Label>{{ t.unit }}</Label>
          <div class="flex gap-1">
            <Button type="button" size="sm" :variant="form.mode === 'pick' ? 'default' : 'outline'" @click="form.mode = 'pick'">{{ t.unitPick }}</Button>
            <Button type="button" size="sm" :variant="form.mode === 'custom' ? 'default' : 'outline'" @click="form.mode = 'custom'">{{ t.unitCustom }}</Button>
          </div>
          <template v-if="form.mode === 'pick'">
            <Select v-model="form.unit" :disabled="!grade">
              <SelectTrigger class="w-full" :aria-label="t.unit"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem :value="NONE">{{ t.unitNone }}</SelectItem>
                <SelectGroup v-for="a in grade?.areas ?? []" :key="a.name">
                  <SelectLabel>{{ a.name }}</SelectLabel>
                  <SelectItem v-for="u in a.units" :key="u.code" :value="u.code">{{ u.name }}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select v-if="unit?.children.length" v-model="form.concept">
              <SelectTrigger class="w-full" :aria-label="t.concept"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem :value="NONE">{{ t.wholeUnit }}</SelectItem>
                <SelectItem v-for="c in unit.children" :key="c.code" :value="c.code">{{ c.name }}</SelectItem>
              </SelectContent>
            </Select>
          </template>
          <Input v-else v-model="form.custom" maxlength="60" :placeholder="t.unitCustomPlaceholder" :aria-label="t.unitCustom" />
        </div>
        <template v-if="!personal">
          <label class="flex items-start gap-3 text-sm">
            <Switch v-model="form.share" />
            <span class="flex flex-col"><span>{{ t.share }}</span><span class="text-muted-foreground text-xs">{{ t.shareHint }}</span></span>
          </label>
          <label v-if="form.share" class="flex items-start gap-3 text-sm">
            <Switch v-model="form.membersEdit" />
            <span class="flex flex-col"><span>{{ t.membersEdit }}</span><span class="text-muted-foreground text-xs">{{ t.membersEditHint }}</span></span>
          </label>
        </template>
        <div class="flex flex-col gap-2">
          <Label for="set-hint-penalty">{{ t.hintPenalty }}</Label>
          <Input id="set-hint-penalty" v-model.number="form.hintPenalty" type="number" min="0" :max="HINT_PENALTY_MAX" step="5" class="w-28" />
          <p class="text-muted-foreground text-xs">{{ t.hintPenaltyHint }}</p>
        </div>
      </form>
      <DialogFooter>
        <Button type="submit" form="set-form" :disabled="saving">{{ ko.dialog.ok }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
