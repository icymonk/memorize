<script setup lang="ts">
import type { PageVersion } from '../services/versions'
import type { StoredBlock } from '../sync/serialize'
import { toast } from 'vue-sonner'
import { listMembers } from '~/features/space/services/invites'
import { errorMessage } from '~/lib/errors'
import { cn } from '~/lib/utils'
import { ko } from '~/locales/ko'
import { getVersion, listVersions, restoreVersion } from '../services/versions'
import { blocksToMarkdown } from '../sync/serialize'

/** NOTE-63: 이전 버전 보기·되돌리기 */
const props = defineProps<{ sid: string, pageId: string, canRestore: boolean }>()
const emit = defineEmits<{ restored: [] }>()
const open = defineModel<boolean>('open', { default: false })
const t = ko.notes.versions
const { $firestore, $functions } = useNuxtApp()
const versions = ref<PageVersion[]>([])
const names = ref(new Map<string, string>())
const loading = ref(false)
const selected = ref<string | null>(null)
const preview = ref('')
const busy = ref(false)
const confirming = ref(false)

watch(open, async (v) => {
  if (!v) return
  selected.value = null
  preview.value = ''
  loading.value = true
  try {
    const [list, members] = await Promise.all([listVersions($firestore, props.sid, props.pageId), listMembers($firestore, props.sid).catch(() => [])])
    versions.value = list
    names.value = new Map(members.map(m => [m.uid, m.displayName]))
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
  finally {
    loading.value = false
  }
})

async function show(id: string) {
  selected.value = id
  preview.value = ''
  confirming.value = false
  try {
    const { blocks } = await getVersion($functions, props.sid, props.pageId, id)
    if (selected.value === id) preview.value = blocksToMarkdown(blocks as StoredBlock[]).trim() || t.empty
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
}

async function restore() {
  const id = selected.value
  if (!id) return
  busy.value = true
  try {
    await restoreVersion($functions, props.sid, props.pageId, id)
    toast.success(t.restored)
    open.value = false
    confirming.value = false
    emit('restored')
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
  finally {
    busy.value = false
  }
}

const when = (v: PageVersion) => v.createdAt?.toDate().toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) ?? ''
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>{{ t.title }}</DialogTitle>
        <DialogDescription>{{ t.desc }}</DialogDescription>
      </DialogHeader>
      <p v-if="loading" class="text-muted-foreground text-sm">
        {{ t.loading }}
      </p>
      <p v-else-if="!versions.length" class="text-muted-foreground py-6 text-center text-sm">
        {{ t.none }}
      </p>
      <div v-else class="grid gap-3 sm:grid-cols-[14rem_1fr]">
        <ul class="flex max-h-[60svh] flex-col gap-1 overflow-y-auto">
          <li v-for="v in versions" :key="v.id">
            <button
              type="button" data-testid="version-item"
              :class="cn('hover:bg-muted w-full rounded-md px-2 py-1.5 text-left text-sm', selected === v.id && 'bg-muted')"
              @click="show(v.id)"
            >
              <span class="block font-medium">{{ when(v) }}</span>
              <span class="text-muted-foreground block text-xs">
                {{ (v.createdBy && names.get(v.createdBy)) || t.unknown }} · {{ t.blocks(v.blockCount) }}<template v-if="v.reason === 'restore'"> · {{ t.beforeRestore }}</template>
              </span>
            </button>
          </li>
        </ul>
        <div class="flex min-w-0 flex-col gap-2">
          <pre v-if="selected" data-testid="version-preview" class="bg-muted/40 max-h-[55svh] min-h-32 overflow-y-auto rounded-md border p-3 text-sm whitespace-pre-wrap">{{ preview || t.loading }}</pre>
          <p v-else class="text-muted-foreground text-sm">
            {{ t.pick }}
          </p>
          <template v-if="canRestore && selected && preview">
            <div v-if="confirming" class="flex flex-wrap items-center justify-end gap-2">
              <span class="text-sm">{{ t.restoreConfirm }}</span>
              <Button variant="outline" :disabled="busy" @click="confirming = false">
                {{ ko.dialog.cancel }}
              </Button>
              <Button :disabled="busy" @click="restore">
                {{ t.restoreOk }}
              </Button>
            </div>
            <Button v-else class="self-end" @click="confirming = true">
              {{ t.restore }}
            </Button>
          </template>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
