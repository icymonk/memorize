<script setup lang="ts">
import type { Page } from '~/features/notes/services/pages'
import { FileTextIcon, LockIcon, PlusIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { createPage, listPages } from '~/features/notes/services/pages'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'

/** NOTE-01: 노트 페이지 목록 (페이지 계층·즐겨찾기·휴지통은 1-C3) */
const t = ko.notes
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()

if (space.current?.modules?.notes === false) {
  await navigateTo(`/s/${space.current.id}`, { replace: true })
}

const sid = computed(() => space.current!.id)
const uid = computed(() => auth.user!.uid)
const personal = computed(() => space.current?.kind === 'personal')
const canCreate = computed(() => space.can('create'))
const pages = ref<Page[]>([])
const loading = ref(true)
const loadError = ref(false)
const creating = ref(false)

const shown = computed(() => pages.value.toSorted((a, b) => (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0)))

async function load() {
  loading.value = true
  try {
    pages.value = await listPages($firestore, sid.value, uid.value)
    loadError.value = false
  }
  catch {
    loadError.value = true
  }
  finally {
    loading.value = false
  }
}
onMounted(load)
watch(sid, load)

async function create() {
  creating.value = true
  try {
    const id = await createPage($firestore, sid.value, uid.value, personal.value)
    await navigateTo(`/s/${sid.value}/notes/${id}`)
  }
  catch (error) {
    toast.error(errorMessage(error) ?? ko.errors.unknown)
  }
  finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-semibold">
        {{ t.title }}
      </h1>
      <div class="flex flex-col items-end gap-1">
        <Button :disabled="!canCreate || creating" @click="create">
          <PlusIcon />
          {{ t.create }}
        </Button>
        <p v-if="!canCreate" class="text-muted-foreground text-xs">
          {{ t.noCreatePermission }}
        </p>
      </div>
    </div>

    <p v-if="loadError" class="text-destructive text-sm">
      {{ ko.errors.unknown }}
    </p>
    <div v-else-if="loading" class="flex flex-col gap-2">
      <Skeleton v-for="i in 3" :key="i" class="h-16 w-full" />
    </div>
    <p v-else-if="!shown.length" class="text-muted-foreground py-12 text-center text-sm">
      {{ t.empty }}
    </p>
    <ul v-else class="divide-y rounded-lg border">
      <li v-for="p in shown" :key="p.id">
        <NuxtLink :to="`/s/${sid}/notes/${p.id}`" class="hover:bg-muted/50 flex items-start gap-3 px-4 py-3">
          <span class="mt-0.5 text-lg leading-none">
            <template v-if="p.icon">{{ p.icon }}</template>
            <FileTextIcon v-else class="text-muted-foreground size-5" />
          </span>
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="flex items-center gap-1.5 font-medium">
              <span class="truncate">{{ p.title || t.untitled }}</span>
              <LockIcon v-if="p.visibility === 'private' && !personal" class="text-muted-foreground size-3.5 shrink-0" :aria-label="t.private" />
            </span>
            <span v-if="p.excerpt" class="text-muted-foreground line-clamp-2 text-sm">{{ p.excerpt }}</span>
          </span>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
