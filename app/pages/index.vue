<script setup lang="ts">
import { HouseIcon, PlusIcon, TicketIcon } from '@lucide/vue'
import { ko } from '~/locales/ko'

const auth = useAuthStore()

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

      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <HouseIcon class="size-4" />
            {{ ko.nav.personalSpace }}
          </CardTitle>
          <CardDescription>{{ ko.home.personalSpaceDescription }}</CardDescription>
        </CardHeader>
        <CardFooter>
          <span class="text-muted-foreground text-xs">{{ ko.nav.comingSoon }}</span>
        </CardFooter>
      </Card>

      <section class="flex flex-col gap-3">
        <h2 class="text-sm font-medium">
          {{ ko.nav.workspaces }}
        </h2>
        <p class="text-muted-foreground text-sm">
          {{ ko.nav.noWorkspaces }}
        </p>
        <div class="flex gap-2">
          <Button disabled>
            <PlusIcon />
            {{ ko.nav.createWorkspace }}
          </Button>
          <Button variant="outline" disabled>
            <TicketIcon />
            {{ ko.nav.joinWithCode }}
          </Button>
        </div>
      </section>
    </div>
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
