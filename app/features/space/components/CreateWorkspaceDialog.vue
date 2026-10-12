<script setup lang="ts">
import type { ModuleKey, SpaceColor } from '#shared/schemas/space'
import { DEFAULT_WORKSPACE_MODULES, MODULE_KEYS, SPACE_COLORS } from '#shared/schemas/space'
import { toast } from 'vue-sonner'
import { errorMessage } from '~/lib/errors'
import { cn } from '~/lib/utils'
import { ko } from '~/locales/ko'
import { SPACE_COLOR_CLASS, SPACE_ICONS } from '../colors'

const open = defineModel<boolean>('open', { default: false })

const space = useSpaceStore()
const name = ref('')
const icon = ref(SPACE_ICONS[0]!)
const color = ref<SpaceColor>('blue')
const description = ref('')
const modules = ref({ ...DEFAULT_WORKSPACE_MODULES })
const pending = ref(false)

watch(open, (value) => {
  if (!value) return
  name.value = ''
  icon.value = SPACE_ICONS[0]!
  color.value = 'blue'
  description.value = ''
  modules.value = { ...DEFAULT_WORKSPACE_MODULES }
})

function setModule(key: ModuleKey, value: boolean) {
  modules.value = { ...modules.value, [key]: value }
}

async function submit() {
  pending.value = true
  try {
    const spaceId = await space.createWorkspace({
      name: name.value.trim(),
      icon: icon.value,
      color: color.value,
      description: description.value.trim(),
      modules: modules.value,
    })
    toast.success(ko.space.create.created(name.value.trim()))
    open.value = false
    await navigateTo(`/s/${spaceId}`)
  }
  catch (error) {
    toast.error(errorMessage(error) ?? ko.errors.unknown)
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90svh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ ko.space.create.title }}</DialogTitle>
        <DialogDescription>{{ ko.space.create.description }}</DialogDescription>
      </DialogHeader>

      <form id="create-workspace" class="flex flex-col gap-5" @submit.prevent="submit">
        <div class="flex flex-col gap-2">
          <Label for="ws-name">{{ ko.space.create.name }}</Label>
          <Input id="ws-name" v-model="name" required maxlength="40" :placeholder="ko.space.create.namePlaceholder" />
        </div>

        <div class="flex flex-col gap-2">
          <Label>{{ ko.space.create.icon }}</Label>
          <div class="flex flex-wrap gap-1.5" role="radiogroup" :aria-label="ko.space.create.icon">
            <button
              v-for="item in SPACE_ICONS"
              :key="item"
              type="button"
              role="radio"
              :aria-checked="icon === item"
              :class="cn('flex size-9 items-center justify-center rounded-lg border text-lg', icon === item ? 'border-primary ring-primary/30 ring-2' : 'border-transparent hover:bg-muted')"
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
              :class="cn('size-7 rounded-full border', SPACE_COLOR_CLASS[item], color === item && 'ring-primary ring-2 ring-offset-2')"
              @click="color = item"
            />
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <Label for="ws-description">{{ ko.space.create.descriptionLabel }}</Label>
          <Textarea id="ws-description" v-model="description" maxlength="200" rows="2" />
        </div>

        <div class="flex flex-col gap-2">
          <Label>{{ ko.space.create.modules }}</Label>
          <div class="grid grid-cols-2 gap-2">
            <label v-for="key in MODULE_KEYS" :key="key" class="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              {{ ko.space.modules[key] }}
              <Switch :model-value="modules[key]" @update:model-value="(v: boolean) => setModule(key, v)" />
            </label>
          </div>
          <p class="text-muted-foreground text-xs">
            {{ ko.space.create.modulesHint }}
          </p>
        </div>
      </form>

      <DialogFooter>
        <Button variant="outline" type="button" @click="open = false">
          {{ ko.space.create.cancel }}
        </Button>
        <Button type="submit" form="create-workspace" :disabled="pending || !name.trim()">
          {{ ko.space.create.submit }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
