<script setup lang="ts">
import type { Modules, SpaceColor, SpaceSettings } from '#shared/schemas/space'
import { LIMITS } from '#shared/limits'
import { DEFAULT_SPACE_SETTINGS, MODULE_KEYS, SPACE_COLORS, spaceGeneralSchema } from '#shared/schemas/space'
import { toast } from 'vue-sonner'
import { SPACE_COLOR_CLASS, SPACE_ICONS } from '~/features/space/colors'
import { errorMessage } from '~/lib/errors'
import { cn } from '~/lib/utils'
import { ko } from '~/locales/ko'
import { XIcon } from '@lucide/vue'
import { useTags } from '~/features/space/composables/useTags'
import { deleteTag, TAG_CLASS } from '~/features/space/services/tags'

const t = ko.space.settings
const space = useSpaceStore()

if (space.current?.kind !== 'workspace') {
  await navigateTo(space.current ? `/s/${space.current.id}` : '/', { replace: true })
}

const canManage = computed(() => space.can('manage'))
const canDelete = computed(() => space.can('delete'))
const tags = useTags()
const { $firestore: fs } = useNuxtApp()

const name = ref('')
const icon = ref('')
const color = ref<SpaceColor>('blue')
const description = ref('')
const modules = ref<Modules>({} as Modules)
const settings = ref<SpaceSettings>({ ...DEFAULT_SPACE_SETTINGS })
const confirmName = ref('')
const saving = ref<string | null>(null)

function resetForm() {
  const s = space.current
  if (!s) return
  name.value = s.name
  icon.value = s.icon
  color.value = s.color ?? 'blue'
  description.value = s.description ?? ''
  modules.value = { ...s.modules }
  const { ranking: _ranking, ...rest } = s.settings ?? {}
  settings.value = { ...DEFAULT_SPACE_SETTINGS, ...rest }
}
watch(() => space.current?.id, resetForm, { immediate: true })

const icons = computed(() => SPACE_ICONS.includes(icon.value) ? SPACE_ICONS : [icon.value, ...SPACE_ICONS])
const generalValid = computed(() => spaceGeneralSchema.safeParse({ name: name.value, icon: icon.value, color: color.value, description: description.value }).success)
const scheduledAt = computed(() => space.current?.deleteScheduledAt?.toDate() ?? null)
const settingKeys = ['whoCanInvite', 'whoCanCreate', 'whoCanHost'] as const

async function run(section: string, fn: () => Promise<unknown>, success: string) {
  saving.value = section
  try {
    await fn()
    toast.success(success)
  }
  catch (error) {
    toast.error(errorMessage(error) ?? ko.errors.unknown)
  }
  finally {
    saving.value = null
  }
}

const saveGeneral = () => run('general', () => space.update(spaceGeneralSchema.parse({
  name: name.value,
  icon: icon.value,
  color: color.value,
  description: description.value,
})), t.saved)
const saveModules = () => run('modules', () => space.update({ modules: modules.value }), t.saved)
const saveSettings = () => run('settings', () => space.update({ settings: { ...space.current?.settings, ...settings.value } }), t.saved)
const scheduleDeletion = () => run('delete', async () => {
  await space.scheduleDeletion(confirmName.value)
  confirmName.value = ''
}, t.deleteRequested)
const cancelDeletion = () => run('delete', () => space.cancelDeletion(), t.deleteCancelled)

async function leave() {
  const s = space.current
  if (!s || !(await confirmDialog(ko.members.leave.confirm(s.name)))) return
  await run('leave', async () => {
    await space.leave()
    await navigateTo('/', { replace: true })
  }, ko.members.leave.done)
}
</script>

<template>
  <div v-if="space.current" class="mx-auto flex w-full max-w-2xl flex-col gap-6">
    <h1 class="text-2xl font-semibold">
      {{ t.title }}
    </h1>
    <p v-if="!canManage" class="bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm">
      {{ t.readOnly }}
    </p>

    <Card>
      <CardHeader>
        <CardTitle>{{ t.general }}</CardTitle>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <fieldset :disabled="!canManage" class="flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <Label for="s-name">{{ ko.space.create.name }}</Label>
            <Input id="s-name" v-model="name" maxlength="40" />
          </div>
          <div class="flex flex-col gap-2">
            <Label>{{ ko.space.create.icon }}</Label>
            <div class="flex flex-wrap gap-1.5" role="radiogroup" :aria-label="ko.space.create.icon">
              <button
                v-for="item in icons"
                :key="item"
                type="button"
                role="radio"
                :aria-checked="icon === item"
                :class="cn('flex size-9 items-center justify-center rounded-lg border text-lg disabled:opacity-60', icon === item ? 'border-primary ring-primary/30 ring-2' : 'border-transparent hover:bg-muted')"
                @click="icon = item"
              >
                {{ item }}
              </button>
            </div>
          </div>
          <div class="flex flex-col gap-2">
            <Label>{{ ko.space.create.color }}</Label>
            <div class="flex flex-wrap gap-2" role="radiogroup" :aria-label="ko.space.create.color">
              <button
                v-for="item in SPACE_COLORS"
                :key="item"
                type="button"
                role="radio"
                :aria-label="item"
                :aria-checked="color === item"
                :class="cn('size-7 rounded-full border disabled:opacity-60', SPACE_COLOR_CLASS[item], color === item && 'ring-primary ring-2 ring-offset-2')"
                @click="color = item"
              />
            </div>
          </div>
          <div class="flex flex-col gap-2">
            <Label for="s-description">{{ ko.space.create.descriptionLabel }}</Label>
            <Textarea id="s-description" v-model="description" maxlength="200" rows="2" />
          </div>
        </fieldset>
      </CardContent>
      <CardFooter v-if="canManage" class="justify-end">
        <Button :disabled="saving === 'general' || !generalValid" @click="saveGeneral">
          {{ t.save }}
        </Button>
      </CardFooter>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>{{ t.modules }}</CardTitle>
        <CardDescription>{{ t.modulesHint }}</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-2 gap-2">
          <label v-for="key in MODULE_KEYS" :key="key" class="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
            {{ ko.space.modules[key] }}
            <Switch :disabled="!canManage" :model-value="modules[key]" @update:model-value="(v: boolean) => modules = { ...modules, [key]: v }" />
          </label>
        </div>
      </CardContent>
      <CardFooter v-if="canManage" class="justify-end">
        <Button :disabled="saving === 'modules'" @click="saveModules">
          {{ t.save }}
        </Button>
      </CardFooter>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>{{ t.operation }}</CardTitle>
      </CardHeader>
      <CardContent class="flex flex-col gap-5">
        <div class="flex flex-col gap-2">
          <Label>{{ t.joinPolicy }}</Label>
          <RadioGroup v-model="settings.joinPolicy" :disabled="!canManage" class="flex flex-col gap-2">
            <div v-for="(label, value) in t.joinPolicyOptions" :key="value" class="flex items-center gap-2">
              <RadioGroupItem :id="`join-${value}`" :value="value" />
              <Label :for="`join-${value}`" class="font-normal">{{ label }}</Label>
            </div>
          </RadioGroup>
        </div>
        <div v-for="key in settingKeys" :key="key" class="flex flex-col gap-2">
          <Label>{{ t[key] }}</Label>
          <RadioGroup v-model="settings[key]" :disabled="!canManage" class="flex flex-wrap gap-4">
            <div v-for="(label, value) in t.whoOptions" :key="value" class="flex items-center gap-2">
              <RadioGroupItem :id="`${key}-${value}`" :value="value" />
              <Label :for="`${key}-${value}`" class="font-normal">{{ label }}</Label>
            </div>
          </RadioGroup>
        </div>
        <div class="flex flex-col gap-2">
          <Label>{{ t.progressSharing }}</Label>
          <RadioGroup v-model="settings.progressSharing" :disabled="!canManage" class="flex flex-wrap gap-4">
            <div v-for="(label, value) in t.progressSharingOptions" :key="value" class="flex items-center gap-2">
              <RadioGroupItem :id="`progress-${value}`" :value="value" />
              <Label :for="`progress-${value}`" class="font-normal">{{ label }}</Label>
            </div>
          </RadioGroup>
        </div>
      </CardContent>
      <CardFooter v-if="canManage" class="justify-end">
        <Button :disabled="saving === 'settings'" @click="saveSettings">
          {{ t.save }}
        </Button>
      </CardFooter>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>{{ t.capacity }}</CardTitle>
        <CardDescription>{{ t.capacityHint }}</CardDescription>
      </CardHeader>
      <CardContent class="text-sm">
        {{ t.capacityValue(space.current.memberCount, space.current.maxMembers ?? LIMITS.workspaceMaxMembers) }}
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>{{ t.tags }}</CardTitle>
        <CardDescription>{{ t.tagsHint }}</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-wrap gap-1.5 text-sm">
        <span v-for="tag in tags" :key="tag.id" class="flex items-center gap-1 rounded-full px-2.5 py-0.5" :class="TAG_CLASS[tag.color] ?? TAG_CLASS.gray">
          #{{ tag.name }}
          <button v-if="canManage" type="button" :aria-label="t.tagDelete(tag.name)" :disabled="saving === 'tags'" class="hover:opacity-70" @click="run('tags', () => deleteTag(fs, space.current!.id, tag.id), t.tagDeleted)">
            <XIcon class="size-3" />
          </button>
        </span>
        <p v-if="!tags.length" class="text-muted-foreground">
          {{ t.tagsEmpty }}
        </p>
      </CardContent>
    </Card>

    <Card class="border-destructive/40">
      <CardHeader>
        <CardTitle class="text-destructive">
          {{ t.danger }}
        </CardTitle>
        <CardDescription>{{ t.deleteDescription(LIMITS.workspaceDeleteGraceDays) }}</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-3">
        <div class="flex flex-col gap-2 border-b pb-4">
          <p class="text-sm font-medium">
            {{ ko.members.leave.title }}
          </p>
          <p class="text-muted-foreground text-sm">
            {{ canDelete ? ko.members.leave.ownerHint : ko.members.leave.description }}
          </p>
          <div v-if="!canDelete">
            <Button variant="outline" :disabled="saving === 'leave'" @click="leave">
              {{ ko.members.leave.button }}
            </Button>
          </div>
        </div>
        <p class="text-sm font-medium">
          {{ t.deleteTitle }}
        </p>
        <template v-if="scheduledAt">
          <p class="text-destructive text-sm font-medium">
            {{ t.deleteScheduled(scheduledAt.toLocaleDateString('ko-KR')) }}
          </p>
          <div v-if="canDelete">
            <Button variant="outline" :disabled="saving === 'delete'" @click="cancelDeletion">
              {{ t.deleteCancel }}
            </Button>
          </div>
        </template>
        <template v-else-if="canDelete">
          <Label for="s-confirm" class="font-normal">{{ t.deleteConfirmLabel(space.current.name) }}</Label>
          <div class="flex gap-2">
            <Input id="s-confirm" v-model="confirmName" autocomplete="off" />
            <Button variant="destructive" :disabled="saving === 'delete' || confirmName.trim() !== space.current.name" @click="scheduleDeletion">
              {{ t.deleteButton }}
            </Button>
          </div>
        </template>
        <p v-else class="text-muted-foreground text-sm">
          {{ t.ownerOnly }}
        </p>
      </CardContent>
    </Card>
  </div>
</template>
