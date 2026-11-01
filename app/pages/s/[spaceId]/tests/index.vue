<script setup lang="ts">
import type { Test } from '~/features/tests/services/tests'
import { PlusIcon } from '@lucide/vue'
import { maxScoreOf } from '#shared/schemas/test'
import { listTests } from '~/features/tests/services/tests'
import { ko } from '~/locales/ko'

/** 테스트 목록: 응시할 시험 / 내가 연 시험 */
const t = ko.exams
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()

if (!space.current?.modules?.tests) {
  await navigateTo(`/s/${space.current!.id}`, { replace: true })
}

const sid = computed(() => space.current!.id)
const personal = computed(() => space.current?.kind === 'personal')
const canHost = computed(() => personal.value || space.can('host'))
const lists = ref<{ hosting: Test[], taking: Test[] }>({ hosting: [], taking: [] })
const tab = ref<'taking' | 'hosting'>(personal.value ? 'hosting' : 'taking')
const loading = ref(true)
const loadError = ref(false)

const shown = computed(() => [...lists.value[tab.value]].sort((a, b) => (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0)))
const fmt = (ms: number) => new Date(ms).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

onMounted(async () => {
  try {
    lists.value = await listTests($firestore, sid.value, auth.user!.uid)
  }
  catch {
    loadError.value = true
  }
  finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center justify-between gap-2">
      <h1 class="text-xl font-semibold">{{ t.title }}</h1>
      <Button v-if="canHost" size="sm" as-child>
        <NuxtLink :to="`/s/${sid}/tests/new`"><PlusIcon /> {{ t.create }}</NuxtLink>
      </Button>
    </div>
    <Tabs v-if="!personal" v-model="tab">
      <TabsList>
        <TabsTrigger v-for="k in (['taking', 'hosting'] as const)" :key="k" :value="k">{{ t.tabs[k] }}</TabsTrigger>
      </TabsList>
    </Tabs>
    <p v-if="loading" class="text-muted-foreground text-sm">{{ t.loading }}</p>
    <p v-else-if="loadError" class="text-destructive text-sm">{{ t.loadFailed }}</p>
    <p v-else-if="!shown.length" class="text-muted-foreground py-8 text-center text-sm">{{ t.empty[tab] }}</p>
    <ul v-else class="flex flex-col divide-y rounded-md border">
      <li v-for="x in shown" :key="x.id">
        <NuxtLink :to="`/s/${sid}/tests/${x.id}`" class="hover:bg-muted/50 flex flex-col gap-1 p-3">
          <div class="flex items-center gap-2">
            <span class="font-medium">{{ x.title }}</span>
            <Badge :variant="x.status === 'open' ? 'default' : 'secondary'">{{ t.status[x.status] }}</Badge>
          </div>
          <span class="text-muted-foreground text-xs">
            {{ t.info(x.questionRefs.length, x.maxScore ?? maxScoreOf(x.questionRefs)) }}
            · {{ x.settings.timeLimitMin ? t.minutes(x.settings.timeLimitMin) : t.noTimeLimit }}
            <template v-if="x.settings.closeAt"> · {{ t.until(fmt(x.settings.closeAt)) }}</template>
          </span>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
