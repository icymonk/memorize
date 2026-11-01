<script setup lang="ts">
import type { Course } from '~/features/courses/services/courses'
import { GraduationCapIcon, PlusIcon } from '@lucide/vue'
import CourseFormDialog from '~/features/courses/components/CourseFormDialog.vue'
import { listCourses } from '~/features/courses/services/courses'
import { ko } from '~/locales/ko'

/** CRS-01 강의자료 홈: 볼 수 있는 코스 목록, 코스 만들기 */
const t = ko.courses.home
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()

if (!space.current?.modules?.courses) {
  await navigateTo(`/s/${space.current!.id}`, { replace: true })
}

const sid = computed(() => space.current!.id)
const courses = ref<Course[]>([])
const loading = ref(true)
const loadError = ref(false)
const formOpen = ref(false)

async function load() {
  loading.value = true
  loadError.value = false
  try {
    courses.value = await listCourses($firestore, sid.value, auth.user!.uid, space.membership?.groupIds ?? [])
  }
  catch {
    loadError.value = true
  }
  finally {
    loading.value = false
  }
}
onMounted(load)
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
    <div class="flex items-start justify-between gap-2">
      <div class="flex flex-col gap-1">
        <h1 class="flex items-center gap-2 text-xl font-semibold"><GraduationCapIcon class="size-5" /> {{ t.title }}</h1>
        <p class="text-muted-foreground text-sm">{{ t.intro }}</p>
      </div>
      <Button v-if="space.can('create')" size="sm" @click="formOpen = true"><PlusIcon /> {{ t.create }}</Button>
    </div>
    <template v-if="loading">
      <Skeleton v-for="i in 3" :key="i" class="h-16 w-full" />
    </template>
    <p v-else-if="loadError" class="text-destructive text-sm">{{ t.loadFailed }}</p>
    <p v-else-if="!courses.length" class="text-muted-foreground text-sm">{{ t.empty }}</p>
    <NuxtLink
      v-for="c in courses"
      v-else
      :key="c.id"
      :to="`/s/${sid}/courses/${c.id}`"
      class="hover:bg-accent flex items-center justify-between gap-2 rounded-md border p-3"
    >
      <span class="flex min-w-0 flex-col">
        <span class="truncate font-medium">{{ c.title }}</span>
        <span class="text-muted-foreground truncate text-xs">{{ c.description || '—' }}</span>
      </span>
      <span class="flex shrink-0 items-center gap-2 text-xs">
        <Badge v-if="c.level" variant="outline">{{ c.level }}</Badge>
        <Badge variant="secondary">{{ ko.courses.form.vis[c.visibility] }}</Badge>
      </span>
    </NuxtLink>
    <CourseFormDialog v-model:open="formOpen" @saved="(id: string) => navigateTo(`/s/${sid}/courses/${id}`)" />
  </div>
</template>
