<script setup lang="ts">
import type { Mission } from '~/features/missions/services/missions'
import { listMissions } from '~/features/missions/services/missions'
import { ko } from '~/locales/ko'

/** WS-14: 가입 직후 안내 — 소개, 켜진 기능, 참여할 수 있는 열린 미션. 닫으면 다시 안 보인다 */
const t = ko.spaceWelcome
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const key = computed(() => `welcome:${space.current?.id}`)
const dismissed = ref(true)
const missions = ref<Mission[]>([])
const modules = computed(() => Object.entries(t.modules).filter(([k]) => space.current?.modules?.[k as keyof typeof space.current.modules] !== false).map(([, v]) => v))

watch(() => space.current?.id, async (sid) => {
  const s = space.current
  const me = auth.user?.uid
  dismissed.value = !sid || !me || s?.kind !== 'workspace' || s.ownerId === me || localStorage.getItem(key.value) === '1'
  if (dismissed.value || s?.modules?.missions === false) return
  const list = await listMissions($firestore, sid!, me!).catch(() => [])
  missions.value = list.filter(m => m.joinable && !m.isPersonal && !(m as { closedAt?: unknown }).closedAt && !m.participantIds.includes(me!)).slice(0, 3)
}, { immediate: true })

function dismiss() {
  localStorage.setItem(key.value, '1')
  dismissed.value = true
}
</script>

<template>
  <Card v-if="!dismissed && space.current">
    <CardHeader>
      <CardTitle>{{ t.title(space.current.name) }}</CardTitle>
      <CardDescription v-if="space.current.description">
        {{ space.current.description }}
      </CardDescription>
    </CardHeader>
    <CardContent class="flex flex-col gap-3 text-sm">
      <p>{{ t.modulesLine(modules.join(', ')) }}</p>
      <div v-if="missions.length" class="flex flex-col gap-1">
        <p class="text-xs font-medium">
          {{ t.openMissions }}
        </p>
        <NuxtLink v-for="m in missions" :key="m.id" :to="`/s/${space.current.id}/missions/${m.id}`" class="hover:bg-muted rounded-md px-2 py-1">
          🎯 {{ m.title }}
        </NuxtLink>
      </div>
    </CardContent>
    <CardFooter>
      <Button variant="outline" size="sm" @click="dismiss">
        {{ t.dismiss }}
      </Button>
    </CardFooter>
  </Card>
</template>
