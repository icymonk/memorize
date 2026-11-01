<script setup lang="ts">
import type { ProblemSet } from '~/features/math/services/problemSets'
import { unitLabel } from '#shared/math/curriculum'
import { FileQuestionIcon, PlusIcon, SigmaIcon, SparklesIcon } from '@lucide/vue'
import MathInputDialog from '~/features/math/components/MathInputDialog.vue'
import MathText from '~/features/math/components/MathText.vue'
import ProblemSetFormDialog from '~/features/math/components/ProblemSetFormDialog.vue'
import { listProblemSets } from '~/features/math/services/problemSets'
import { ko } from '~/locales/ko'

/** 수학 홈 (MATH-01·02·10·15): 문제집 목록, 문제집 만들기, 단원별 만들기 */
const t = ko.math.home
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()

if (!space.current?.modules?.math) {
  await navigateTo(`/s/${space.current!.id}`, { replace: true })
}

const sid = computed(() => space.current!.id)
const tests = computed(() => !!space.current?.modules?.tests)
const canCreate = computed(() => space.can('create'))
const sets = ref<ProblemSet[]>([])
const loading = ref(true)
const loadError = ref(false)
const formOpen = ref(false)
const draft = ref('')
const inputOpen = ref(false)

async function load() {
  loading.value = true
  loadError.value = false
  try {
    sets.value = await listProblemSets($firestore, sid.value, auth.user!.uid)
  }
  catch {
    loadError.value = true
  }
  finally {
    loading.value = false
  }
}
onMounted(load)

const created = (id: string) => navigateTo(`/s/${sid.value}/math/${id}`)

function insert(latex: string, display: boolean) {
  const tex = display ? `$$${latex}$$` : `$${latex}$`
  draft.value = draft.value ? `${draft.value} ${tex}` : tex
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
    <div class="flex flex-col gap-1">
      <h1 class="flex items-center gap-2 text-xl font-semibold"><SigmaIcon class="size-5" /> {{ t.title }}</h1>
      <p class="text-muted-foreground text-sm">{{ t.intro }}</p>
    </div>

    <Card>
      <CardHeader class="flex flex-row items-start justify-between gap-2">
        <div class="flex flex-col gap-1.5">
          <CardTitle>{{ t.sets }}</CardTitle>
          <CardDescription>{{ t.setsSoon }}</CardDescription>
        </div>
        <div v-if="tests && canCreate" class="flex flex-wrap justify-end gap-1">
          <Button as-child size="sm" variant="outline"><NuxtLink :to="`/s/${sid}/math/generate`"><SparklesIcon /> {{ t.generate }}</NuxtLink></Button>
          <Button size="sm" @click="formOpen = true"><PlusIcon /> {{ t.createSet }}</Button>
        </div>
      </CardHeader>
      <CardContent class="flex flex-col gap-2">
        <p v-if="!tests" class="text-muted-foreground text-sm">{{ t.testsOff }}</p>
        <template v-else-if="loading">
          <Skeleton v-for="i in 3" :key="i" class="h-14 w-full" />
        </template>
        <p v-else-if="loadError" class="text-destructive text-sm">{{ t.loadFailed }}</p>
        <p v-else-if="!sets.length" class="text-muted-foreground text-sm">{{ t.noSets }}</p>
        <NuxtLink
          v-for="s in sets"
          v-else
          :key="s.id"
          :to="`/s/${sid}/math/${s.id}`"
          class="hover:bg-accent flex items-center justify-between gap-2 rounded-md border p-3"
        >
          <span class="flex min-w-0 flex-col">
            <span class="truncate font-medium">{{ s.title }}</span>
            <span class="text-muted-foreground truncate text-xs">{{ unitLabel(s.unit) || '—' }}</span>
          </span>
          <span class="flex shrink-0 items-center gap-2 text-xs">
            <Badge v-if="s.visibility === 'space'" variant="secondary">{{ ko.math.set.public }}</Badge>
            <span class="text-muted-foreground">{{ t.count(s.questionIds.length) }}</span>
          </span>
        </NuxtLink>
        <Button v-if="tests" as-child variant="ghost" size="sm" class="self-start">
          <NuxtLink :to="`/s/${sid}/questions`"><FileQuestionIcon /> {{ t.questions }}</NuxtLink>
        </Button>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>{{ t.tryTitle }}</CardTitle>
      </CardHeader>
      <CardContent class="flex flex-col gap-3">
        <Textarea v-model="draft" rows="3" :placeholder="t.tryPlaceholder" :aria-label="t.tryTitle" />
        <Button type="button" variant="outline" size="sm" class="self-start" @click="inputOpen = true">
          <SigmaIcon /> {{ t.openInput }}
        </Button>
        <div v-if="draft.trim()" class="bg-muted/40 rounded-md p-3 text-sm whitespace-pre-line" data-testid="math-preview">
          <MathText :text="draft" />
        </div>
      </CardContent>
    </Card>

    <MathInputDialog v-model:open="inputOpen" @insert="insert" />
    <ProblemSetFormDialog v-model:open="formOpen" @saved="created" />
  </div>
</template>
