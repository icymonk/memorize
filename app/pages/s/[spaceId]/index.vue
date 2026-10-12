<script setup lang="ts">
import OwnershipTransferBanner from '~/features/space/components/OwnershipTransferBanner.vue'
import SpaceIcon from '~/features/space/components/SpaceIcon.vue'
import { getMembership } from '~/features/space/services/spaces'
import { ko } from '~/locales/ko'

const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const transferFrom = ref('')

watch(() => space.current?.ownershipTransfer, async (transfer) => {
  transferFrom.value = ''
  if (!transfer || transfer.to !== auth.user?.uid || !space.current) return
  transferFrom.value = (await getMembership($firestore, space.current.id, transfer.from))?.displayName ?? ''
}, { immediate: true })
</script>

<template>
  <div v-if="space.current" class="mx-auto flex w-full max-w-3xl flex-col gap-6">
    <div class="flex items-center gap-3">
      <SpaceIcon :icon="space.current.icon" :color="space.current.color" class="size-12 text-2xl" />
      <div class="flex flex-col">
        <h1 class="text-2xl font-semibold">
          {{ space.current.name }}
        </h1>
        <p v-if="space.current.kind === 'workspace'" class="text-muted-foreground text-sm">
          {{ ko.space.memberCount(space.current.memberCount) }}
        </p>
      </div>
    </div>
    <OwnershipTransferBanner v-if="space.current.ownershipTransfer?.to === auth.user?.uid" :from-name="transferFrom" />
    <p v-if="space.current.deleteScheduledAt" class="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
      {{ ko.space.settings.deleteScheduled(space.current.deleteScheduledAt.toDate().toLocaleDateString('ko-KR')) }}
    </p>
    <p v-if="space.current.description" class="text-muted-foreground">
      {{ space.current.description }}
    </p>
    <Card>
      <CardHeader>
        <CardDescription>{{ ko.nav.comingSoon }}</CardDescription>
      </CardHeader>
    </Card>
  </div>
</template>
