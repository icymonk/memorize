<script setup lang="ts">
import type { InvitePreview } from '#shared/schemas/invite'
import type { SpaceColor } from '#shared/schemas/space'
import { FirebaseError } from 'firebase/app'
import { toast } from 'vue-sonner'
import SpaceIcon from '~/features/space/components/SpaceIcon.vue'
import { errorMessage } from '~/lib/errors'
import { callFn } from '~/lib/functions'
import { ko } from '~/locales/ko'

definePageMeta({ layout: 'auth' })

const route = useRoute('invite-code')
const auth = useAuthStore()
const space = useSpaceStore()
const { $functions } = useNuxtApp()

const code = computed(() => String(route.params.code).toUpperCase())
const preview = ref<InvitePreview | null>(null)
const notFound = ref(false)
const pending = ref(false)

async function load() {
  if (!auth.user) return
  try {
    preview.value = await callFn($functions, 'getInvite', { code: code.value })
  }
  catch (error) {
    if (error instanceof FirebaseError && ['functions/not-found', 'functions/invalid-argument'].includes(error.code)) notFound.value = true
    else toast.error(errorMessage(error) ?? ko.errors.unknown)
  }
}
watch(() => auth.account, load, { immediate: true })

async function join() {
  if (!preview.value) return
  pending.value = true
  try {
    const result = await callFn($functions, 'joinSpace', { code: code.value })
    if (result.status === 'active') {
      await space.loadMySpaces(true)
      toast.success(ko.invite.joined(preview.value.name))
      await navigateTo(`/s/${result.spaceId}`, { replace: true })
    }
    else {
      preview.value = { ...preview.value, status: 'pending' }
      toast.success(ko.invite.requested)
    }
  }
  catch (error) {
    if (error instanceof FirebaseError && error.message === 'invite-unavailable') preview.value = { ...preview.value, status: 'unavailable' }
    else if (error instanceof FirebaseError && error.code === 'functions/resource-exhausted') preview.value = { ...preview.value, status: 'full' }
    else toast.error(errorMessage(error) ?? ko.errors.unknown)
  }
  finally {
    pending.value = false
  }
}

const message = computed(() => {
  switch (preview.value?.status) {
    case 'unavailable': return ko.invite.unavailable
    case 'full': return ko.invite.full
    case 'pending': return ko.invite.pending
    case 'member': return ko.invite.alreadyMember
    default: return null
  }
})
</script>

<template>
  <Card>
    <CardHeader>
      <CardDescription>{{ ko.invite.title }}</CardDescription>
      <CardTitle v-if="preview" class="flex items-center gap-3 text-xl">
        <SpaceIcon v-if="preview.icon" :icon="preview.icon" :color="preview.color as SpaceColor | null" class="size-10 text-xl" />
        {{ preview.name }}
      </CardTitle>
    </CardHeader>

    <CardContent class="flex flex-col gap-4">
      <template v-if="!auth.user">
        <p class="text-muted-foreground text-sm">
          {{ ko.invite.loginHint }}
        </p>
        <Button as-child>
          <NuxtLink :to="{ path: '/login', query: { redirect: route.fullPath } }">
            {{ ko.invite.loginToJoin }}
          </NuxtLink>
        </Button>
      </template>

      <template v-else-if="notFound">
        <p class="text-sm">
          {{ ko.invite.notFound }}
        </p>
        <Button variant="outline" as-child>
          <NuxtLink to="/">
            {{ ko.invite.goHome }}
          </NuxtLink>
        </Button>
      </template>

      <template v-else-if="preview">
        <template v-if="preview.status === 'ok'">
          <p v-if="preview.description" class="text-muted-foreground text-sm">
            {{ preview.description }}
          </p>
          <p class="text-muted-foreground text-sm">
            {{ ko.space.memberCount(preview.memberCount) }}
          </p>
          <p v-if="preview.joinPolicy === 'approval'" class="text-sm">
            {{ ko.invite.approvalHint }}
          </p>
          <Button :disabled="pending" @click="join">
            {{ ko.invite.join }}
          </Button>
        </template>
        <template v-else>
          <p class="text-sm">
            {{ message }}
          </p>
          <Button v-if="preview.status === 'member' && preview.spaceId" as-child>
            <NuxtLink :to="`/s/${preview.spaceId}`">
              {{ ko.invite.goToSpace }}
            </NuxtLink>
          </Button>
          <Button v-else variant="outline" as-child>
            <NuxtLink to="/">
              {{ ko.invite.goHome }}
            </NuxtLink>
          </Button>
        </template>
      </template>

      <Skeleton v-else class="h-24 w-full" />
    </CardContent>
  </Card>
</template>
