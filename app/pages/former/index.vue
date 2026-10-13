<script setup lang="ts">
import type { Page } from '~/features/notes/services/pages'
import type { FormerSpace } from '~/features/space/services/former'
import { listFormerSpaces, listMyPagesIn } from '~/features/space/services/former'
import { ko } from '~/locales/ko'

/** ACC-32: 이전 워크스페이스에서 내가 쓴 노트·학습일지·독후감 */
definePageMeta({ layout: 'focus' })
const t = ko.former
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const spaces = ref<(FormerSpace & { pages: Page[] })[] | null>(null)

watch(() => auth.user?.uid, async (uid) => {
  if (!uid) return
  const list = await listFormerSpaces($firestore, uid).catch(() => [])
  spaces.value = await Promise.all(list.map(async s => ({ ...s, pages: await listMyPagesIn($firestore, s.id, uid).catch(() => []) })))
}, { immediate: true })
</script>

<template>
  <div class="mx-auto w-full max-w-2xl space-y-6 p-6">
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold">
        {{ t.title }}
      </h1>
      <p class="text-sm text-muted-foreground">
        {{ t.hint }}
      </p>
    </div>
    <p v-if="spaces && !spaces.length" class="text-sm text-muted-foreground">
      {{ t.empty }}
    </p>
    <section v-for="s in spaces ?? []" :key="s.id" class="space-y-2">
      <h2 class="text-lg font-medium">
        {{ s.name }}
        <span v-if="s.leftAt" class="text-sm font-normal text-muted-foreground">· {{ t.leftAt(s.leftAt.toDate().toLocaleDateString('ko-KR')) }}</span>
      </h2>
      <p v-if="!s.pages.length" class="text-sm text-muted-foreground">
        {{ t.noPages }}
      </p>
      <ul v-else class="divide-y rounded-md border">
        <li v-for="p in s.pages" :key="p.id">
          <NuxtLink :to="`/former/${s.id}/${p.id}`" class="hover:bg-muted flex items-center gap-2 p-3 text-sm">
            <span>{{ p.icon || '📄' }}</span>
            <span class="truncate">{{ p.title || t.untitled }}</span>
            <span class="ml-auto shrink-0 text-xs text-muted-foreground">{{ t.types[p.type as keyof typeof t.types] }}</span>
          </NuxtLink>
        </li>
      </ul>
    </section>
  </div>
</template>
