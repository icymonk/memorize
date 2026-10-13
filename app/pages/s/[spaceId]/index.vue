<script setup lang="ts">
import HomeWidgets from '~/features/home/components/HomeWidgets.vue'
import PersonalHome from '~/features/home/components/PersonalHome.vue'
import WelcomeCard from '~/features/space/components/WelcomeCard.vue'
import OwnershipTransferBanner from '~/features/space/components/OwnershipTransferBanner.vue'
import SpaceIcon from '~/features/space/components/SpaceIcon.vue'
import { DAILY_LIMITS, endOfToday } from '#shared/srs'
import { getMembership } from '~/features/space/services/spaces'
import { listDueStates } from '~/features/vocab/services/srs'
import { ko } from '~/locales/ko'

const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const transferFrom = ref('')
const dueCount = ref<number | null>(null)

watch(() => space.current?.id, async (sid) => {
  dueCount.value = null
  if (!sid || !auth.user || space.current?.modules?.vocab === false) return
  dueCount.value = (await listDueStates($firestore, sid, auth.user.uid, endOfToday(Date.now()), DAILY_LIMITS.reviewCards).catch(() => [])).length
}, { immediate: true })

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
    <WelcomeCard />
    <Card v-if="space.current.modules?.vocab !== false">
      <CardHeader>
        <CardTitle>{{ ko.vocab.review.title }}</CardTitle>
        <CardDescription>
          {{ space.current.kind === 'personal' ? ko.vocab.review.allDescription : dueCount ? ko.vocab.review.due(dueCount) : ko.vocab.review.empty }}
        </CardDescription>
      </CardHeader>
      <CardFooter class="gap-2">
        <Button v-if="dueCount" as-child>
          <NuxtLink :to="`/s/${space.current.id}/review`">
            {{ ko.vocab.review.start }} ({{ dueCount }})
          </NuxtLink>
        </Button>
        <Button v-if="space.current.kind === 'personal'" variant="outline" as-child>
          <NuxtLink to="/review">
            {{ ko.vocab.review.startAll }}
          </NuxtLink>
        </Button>
      </CardFooter>
    </Card>
    <PersonalHome v-if="space.current.kind === 'personal'" :sid="space.current.id" />
    <HomeWidgets :sid="space.current.id" :personal="space.current.kind === 'personal'" :notes="space.current.modules?.notes !== false" />
  </div>
</template>
