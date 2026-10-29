<script setup lang="ts">
import { FileQuestionIcon, SigmaIcon } from '@lucide/vue'
import MathInputDialog from '~/features/math/components/MathInputDialog.vue'
import MathText from '~/features/math/components/MathText.vue'
import { ko } from '~/locales/ko'

/** 수학 홈 (MATH-01·02). 문제집·변형 문제·단원별 만들기는 M2~M5에서 붙인다 */
const t = ko.math.home
const space = useSpaceStore()

if (!space.current?.modules?.math) {
  await navigateTo(`/s/${space.current!.id}`, { replace: true })
}

const sid = computed(() => space.current!.id)
const tests = computed(() => !!space.current?.modules?.tests)
const draft = ref('')
const inputOpen = ref(false)

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
      <CardHeader>
        <CardTitle>{{ t.sets }}</CardTitle>
        <CardDescription>{{ t.setsSoon }}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button v-if="tests" as-child variant="outline" size="sm">
          <NuxtLink :to="`/s/${sid}/questions`"><FileQuestionIcon /> {{ t.questions }}</NuxtLink>
        </Button>
        <p v-else class="text-muted-foreground text-sm">{{ t.testsOff }}</p>
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
  </div>
</template>
