<script setup lang="ts">
import type { Activity } from '~/features/home/services/activities'
import type { Member } from '~/features/space/services/invites'
import { toast } from 'vue-sonner'
import ActivityList from '~/features/home/components/ActivityList.vue'
import { watchFeed } from '~/features/home/services/activities'
import { listMembers } from '~/features/space/services/invites'
import { errorMessage } from '~/lib/errors'
import { cn } from '~/lib/utils'
import { ko } from '~/locales/ko'

/** CMN-10·11: 워크스페이스 활동 피드 (최근 100개) + 기능별·멤버별·큰 활동만 필터 */
const route = useRoute()
const sid = computed(() => route.params.spaceId as string)
const t = ko.home.feed
const f = t.filter
const { $firestore } = useNuxtApp()
const items = ref<Activity[]>([])
const members = ref<Member[]>([])
const loaded = ref(false)
const moduleFilter = ref<string | null>(null)
const memberFilter = ref('')
const majorOnly = ref(false)
let stop: (() => void) | undefined

const names = computed(() => Object.fromEntries(members.value.map(m => [m.uid, m.displayName])))
const shown = computed(() => items.value.filter(a =>
  (!moduleFilter.value || a.module === moduleFilter.value)
  && (!memberFilter.value || a.uid === memberFilter.value)
  && (!majorOnly.value || a.size === 'major')))

watch(sid, (id) => {
  stop?.()
  loaded.value = false
  memberFilter.value = ''
  stop = watchFeed($firestore, id, 100, (l) => {
    items.value = l
    loaded.value = true
  }, e => toast.error(errorMessage(e) ?? ko.errors.unknown))
  listMembers($firestore, id).then((ms) => { members.value = ms }).catch(() => {})
}, { immediate: true })
onUnmounted(() => stop?.())

const chip = (on: boolean) => cn('rounded-full border px-3 py-1 text-sm', on ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-4">
    <h1 class="text-2xl font-semibold">
      {{ t.title }}
    </h1>
    <div class="flex flex-wrap items-center gap-2">
      <button type="button" :class="chip(!moduleFilter)" :aria-pressed="!moduleFilter" @click="moduleFilter = null">
        {{ f.all }}
      </button>
      <button v-for="(label, key) in f.modules" :key="key" type="button" :class="chip(moduleFilter === key)" :aria-pressed="moduleFilter === key" @click="moduleFilter = key">
        {{ label }}
      </button>
      <select v-model="memberFilter" :aria-label="f.member" class="bg-background rounded-md border px-2 py-1 text-sm">
        <option value="">
          {{ f.allMembers }}
        </option>
        <option v-for="m in members" :key="m.uid" :value="m.uid">
          {{ m.displayName }}
        </option>
      </select>
      <label class="ml-auto flex items-center gap-2 text-sm">
        <Switch v-model="majorOnly" />
        {{ f.majorOnly }}
      </label>
    </div>
    <ActivityList v-if="shown.length" :sid="sid" :items="shown" :names="names" />
    <p v-else-if="loaded" class="text-muted-foreground text-sm">
      {{ items.length ? f.none : t.empty }}
    </p>
  </div>
</template>
