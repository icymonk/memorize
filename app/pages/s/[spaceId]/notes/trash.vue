<script setup lang="ts">
import type { Page } from '~/features/notes/services/pages'
import { ArrowLeftIcon, FileTextIcon, Undo2Icon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { listTrash } from '~/features/notes/services/pages'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'

/** NOTE-22: 내가 버린 페이지. 복원하면 함께 버린 하위 페이지도 돌아온다 */
const t = ko.notes
const space = useSpaceStore()
const auth = useAuthStore()
const notes = useNotesStore()
const { $firestore } = useNuxtApp()
const sid = computed(() => space.current!.id)
const items = ref<Page[]>([])
const loading = ref(true)
const busy = ref<string | null>(null)

/** 함께 버린 하위 페이지는 맨 위 페이지 아래에 묶여 있으니 맨 위만 보여 준다 */
const roots = computed(() => items.value
  .filter(p => !p.trashRootId || p.trashRootId === p.id)
  .toSorted((a, b) => (b.deletedAt?.toMillis() ?? 0) - (a.deletedAt?.toMillis() ?? 0)))

async function load() {
  loading.value = true
  try { items.value = await listTrash($firestore, sid.value, auth.user!.uid) }
  catch { items.value = [] }
  finally { loading.value = false }
}
onMounted(load)

async function restore(p: Page) {
  busy.value = p.id
  try {
    await notes.restore(p.id)
    toast.success(t.restored)
    await load()
  }
  catch (error) { toast.error(errorMessage(error) ?? ko.errors.unknown) }
  finally { busy.value = null }
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-4">
    <NuxtLink :to="`/s/${sid}/notes`" class="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm">
      <ArrowLeftIcon class="size-4" />{{ t.back }}
    </NuxtLink>
    <h1 class="text-2xl font-semibold">
      {{ t.trash }}
    </h1>
    <p class="text-muted-foreground text-sm">
      {{ t.trashHint }}
    </p>
    <div v-if="loading" class="flex flex-col gap-2">
      <Skeleton v-for="i in 3" :key="i" class="h-12 w-full" />
    </div>
    <p v-else-if="!roots.length" class="text-muted-foreground py-12 text-center text-sm">
      {{ t.trashEmpty }}
    </p>
    <ul v-else class="divide-y rounded-lg border">
      <li v-for="p in roots" :key="p.id" class="flex items-center gap-3 px-4 py-3">
        <FileTextIcon class="text-muted-foreground size-4 shrink-0" />
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="truncate font-medium">{{ p.title || t.untitled }}</span>
          <span class="text-muted-foreground text-xs">{{ t.deletedOn(p.deletedAt!.toDate().toLocaleDateString('ko-KR')) }}</span>
        </span>
        <Button variant="outline" size="sm" :disabled="busy === p.id" @click="restore(p)">
          <Undo2Icon />{{ t.restore }}
        </Button>
      </li>
    </ul>
  </div>
</template>
