<script setup lang="ts">
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { toast } from 'vue-sonner'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'

definePageMeta({ layout: 'focus' })

/** ACC-20 알림 설정: 종류별 알림함 켜기/끄기. 서버 트리거가 users/{uid}.notifications.{type}.inApp 을 읽는다 */
const t = ko.accountSettings
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const types = ['mention', 'comment', 'feedbackRequest', 'feedback', 'mission', 'missionReview', 'group'] as const
type Kind = typeof types[number]
const enabled = ref<Record<Kind, boolean>>({ mention: true, comment: true, feedbackRequest: true, feedback: true, mission: true, missionReview: true, group: true })
const loaded = ref(false)

watch(() => auth.user?.uid, async (uid) => {
  if (!uid) return
  const prefs = (await getDoc(doc($firestore, 'users', uid))).get('notifications') ?? {}
  for (const k of types) enabled.value[k] = prefs[k]?.inApp !== false
  loaded.value = true
}, { immediate: true })

async function toggle(k: Kind, v: boolean) {
  const prev = enabled.value[k]
  enabled.value[k] = v
  try {
    await updateDoc(doc($firestore, 'users', auth.user!.uid), { [`notifications.${k}.inApp`]: v })
    toast.success(t.saved)
  }
  catch (e) {
    enabled.value[k] = prev
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-2xl space-y-6 p-6">
    <h1 class="text-2xl font-semibold">
      {{ t.title }}
    </h1>
    <section class="space-y-3">
      <h2 class="text-lg font-medium">
        {{ t.notifications }}
      </h2>
      <p class="text-sm text-muted-foreground">
        {{ t.hint }}
      </p>
      <ul class="divide-y rounded-md border">
        <li v-for="k in types" :key="k" class="flex items-center justify-between gap-4 p-3">
          <div>
            <p class="text-sm font-medium">
              {{ t.types[k].label }}
            </p>
            <p class="text-sm text-muted-foreground">
              {{ t.types[k].desc }}
            </p>
          </div>
          <Switch :disabled="!loaded" :model-value="enabled[k]" :aria-label="t.types[k].label" @update:model-value="(v: boolean) => toggle(k, v)" />
        </li>
      </ul>
    </section>
  </div>
</template>
