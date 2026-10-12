<script setup lang="ts">
import { HouseIcon, PlusIcon, TicketIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import CreateWorkspaceDialog from '~/features/space/components/CreateWorkspaceDialog.vue'
import JoinWithCodeDialog from '~/features/space/components/JoinWithCodeDialog.vue'
import SpaceIcon from '~/features/space/components/SpaceIcon.vue'
import { ko } from '~/locales/ko'

const auth = useAuthStore()
const space = useSpaceStore()
const route = useRoute()
const createOpen = ref(false)
const joinOpen = ref(false)
const loadError = ref(false)

watch(() => auth.account, (account) => {
  if (account) space.loadMySpaces().then(() => { loadError.value = false }).catch(() => { loadError.value = true })
}, { immediate: true })

onMounted(() => {
  if (route.query.notice === 'noAccess') {
    toast.error(ko.space.noAccess)
    navigateTo({ path: '/', query: {} }, { replace: true })
  }
})

definePageMeta({ layout: false })

const name = computed(() => auth.user?.displayName || auth.user?.email?.split('@')[0] || '')
</script>

<template>
  <NuxtLayout v-if="auth.user" name="default">
    <div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <h1 class="text-2xl font-semibold">
        {{ ko.home.greeting(name) }}
      </h1>

      <p v-if="auth.accountError" class="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
        {{ ko.home.accountError }}
      </p>

      <NuxtLink v-if="auth.account" :to="`/s/${auth.account.personalSpaceId}`">
        <Card class="hover:bg-muted/50 transition-colors">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <HouseIcon class="size-4" />
              {{ ko.nav.personalSpace }}
            </CardTitle>
            <CardDescription>{{ ko.home.personalSpaceDescription }}</CardDescription>
          </CardHeader>
        </Card>
      </NuxtLink>

      <section class="flex flex-col gap-3">
        <h2 class="text-sm font-medium">
          {{ ko.nav.workspaces }}
        </h2>
        <p v-if="loadError" class="text-destructive text-sm">
          {{ ko.space.loadError }}
        </p>
        <p v-else-if="space.loaded && !space.workspaces.length" class="text-muted-foreground text-sm">
          {{ ko.nav.noWorkspaces }}
        </p>
        <div v-if="space.workspaces.length" class="grid gap-3 sm:grid-cols-2">
          <NuxtLink v-for="ws in space.workspaces" :key="ws.id" :to="`/s/${ws.id}`">
            <Card class="hover:bg-muted/50 h-full transition-colors">
              <CardHeader class="flex flex-row items-center gap-3">
                <SpaceIcon :icon="ws.icon" :color="ws.color" class="size-10 text-xl" />
                <div class="flex min-w-0 flex-col gap-1">
                  <CardTitle class="truncate">
                    {{ ws.name }}
                  </CardTitle>
                  <CardDescription>{{ ko.space.memberCount(ws.memberCount) }}</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </NuxtLink>
        </div>
        <div class="flex gap-2">
          <Button :disabled="!auth.account" @click="createOpen = true">
            <PlusIcon />
            {{ ko.nav.createWorkspace }}
          </Button>
          <Button variant="outline" :disabled="!auth.account" @click="joinOpen = true">
            <TicketIcon />
            {{ ko.nav.joinWithCode }}
          </Button>
        </div>
      </section>
    </div>
    <CreateWorkspaceDialog v-model:open="createOpen" />
    <JoinWithCodeDialog v-model:open="joinOpen" />
  </NuxtLayout>

  <div v-else class="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
    <h1 class="text-4xl font-semibold tracking-tight">
      {{ ko.app.name }}
    </h1>
    <p class="text-lg font-medium">
      {{ ko.app.tagline }}
    </p>
    <p class="text-muted-foreground max-w-md">
      {{ ko.landing.description }}
    </p>
    <Button as-child size="lg">
      <NuxtLink to="/login">
        {{ ko.landing.start }}
      </NuxtLink>
    </Button>
  </div>
</template>
