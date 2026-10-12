<script setup lang="ts">
import type { Member } from '~/features/space/services/invites'
import type { Page } from '../services/pages'
import { toast } from 'vue-sonner'
import { listMembers } from '~/features/space/services/invites'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'
import { updateSharing } from '../services/pages'

/** NOTE-50·54: 공개 범위와 공동 편집자 (작성자만) */
const props = defineProps<{ page: Page }>()
const emit = defineEmits<{ saved: [Partial<Page>] }>()
const open = defineModel<boolean>('open', { default: false })
const t = ko.notes.share
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()

const members = ref<Member[]>([])
const visibility = ref<Page['visibility']>('private')
const sharedWith = ref<string[]>([])
const editorIds = ref<string[]>([])
const editPolicy = ref<'everyone' | 'editors'>('everyone')
const pending = ref(false)
const personal = computed(() => space.current?.kind === 'personal')
const others = computed(() => members.value.filter(m => m.uid !== auth.user?.uid && m.status === 'active'))

watch(open, async (v) => {
  if (!v) return
  visibility.value = props.page.visibility
  sharedWith.value = [...(props.page.sharedWith ?? [])]
  editorIds.value = [...(props.page.editorIds ?? [])]
  editPolicy.value = props.page.editPolicy ?? 'everyone'
  if (!personal.value && !members.value.length) members.value = await listMembers($firestore, space.current!.id).catch(() => [])
})

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter(x => x !== id) : [...list, id])

async function save() {
  pending.value = true
  try {
    const patch = {
      visibility: visibility.value,
      sharedWith: visibility.value === 'people' ? sharedWith.value : [],
      editorIds: editorIds.value,
      editPolicy: editPolicy.value,
    }
    await updateSharing($firestore, space.current!.id, props.page.id, patch)
    toast.success(ko.vocab.saved)
    emit('saved', patch)
    open.value = false
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
    <DialogContent class="max-h-[90svh] overflow-y-auto sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t.title }}</DialogTitle>
        <DialogDescription>{{ page.title || ko.notes.untitled }}</DialogDescription>
      </DialogHeader>
      <p v-if="personal" class="text-muted-foreground text-sm">
        {{ t.personalOnly }}
      </p>
      <div v-else class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <Label>{{ t.visibility }}</Label>
          <label v-for="v in (['private', 'people', 'space'] as const)" :key="v" class="flex items-center gap-2 text-sm">
            <input v-model="visibility" type="radio" :value="v">
            {{ t.visibilities[v] }}
          </label>
        </div>
        <div v-if="visibility === 'people'" class="flex flex-col gap-1">
          <Label>{{ t.people }}</Label>
          <label v-for="m in others" :key="m.uid" class="flex items-center gap-2 text-sm">
            <input type="checkbox" :checked="sharedWith.includes(m.uid)" @change="sharedWith = toggle(sharedWith, m.uid)">
            {{ m.displayName }}
          </label>
        </div>
        <div class="flex flex-col gap-1">
          <Label>{{ t.editors }}</Label>
          <p class="text-muted-foreground text-xs">
            {{ t.editorsHint }}
          </p>
          <label v-for="m in others" :key="m.uid" class="flex items-center gap-2 text-sm">
            <input type="checkbox" :checked="editorIds.includes(m.uid)" @change="editorIds = toggle(editorIds, m.uid)">
            {{ m.displayName }}
          </label>
        </div>
        <div v-if="page.root === 'shared'" class="flex flex-col gap-2">
          <Label>{{ t.editPolicy }}</Label>
          <label v-for="p in (['everyone', 'editors'] as const)" :key="p" class="flex items-center gap-2 text-sm">
            <input v-model="editPolicy" type="radio" :value="p">
            {{ t.policies[p] }}
          </label>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="open = false">
          {{ ko.vocab.cancel }}
        </Button>
        <Button v-if="!personal" :disabled="pending" @click="save">
          {{ ko.vocab.save }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
