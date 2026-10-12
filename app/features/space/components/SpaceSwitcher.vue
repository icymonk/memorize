<script setup lang="ts">
import type { Space } from '~/features/space/services/spaces'
import { CheckIcon, ChevronsUpDownIcon, HouseIcon, PlusIcon, TicketIcon } from '@lucide/vue'
import SpaceIcon from '~/features/space/components/SpaceIcon.vue'
import { ko } from '~/locales/ko'

/** WS-40·41: 사이드바 맨 위 공간 전환 (노션의 워크스페이스 전환처럼) */
defineProps<{ activeId: string | null }>()
const emit = defineEmits<{ create: [], join: [] }>()
const auth = useAuthStore()
const space = useSpaceStore()

const shown = computed<Space | null>(() => space.current ?? space.personalSpace)
const daysLeft = (s: Space) => Math.max(0, Math.ceil(((s.deleteScheduledAt?.toMillis() ?? 0) - Date.now()) / 86_400_000))
const personalId = computed(() => auth.account?.personalSpaceId)
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <SidebarMenuButton size="lg" :tooltip="ko.nav.switchSpace" class="data-[state=open]:bg-sidebar-accent">
        <SpaceIcon v-if="shown?.kind === 'workspace'" :icon="shown.icon" :color="shown.color" class="size-8 shrink-0 rounded-lg text-base" />
        <span v-else class="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
          <HouseIcon class="size-4" />
        </span>
        <span class="flex min-w-0 flex-1 flex-col text-left leading-tight">
          <span class="truncate font-semibold">{{ shown?.kind === 'workspace' ? shown.name : ko.nav.personalSpace }}</span>
          <span class="text-muted-foreground truncate text-xs">{{ ko.app.name }}</span>
        </span>
        <ChevronsUpDownIcon class="ml-auto size-4 shrink-0" />
      </SidebarMenuButton>
    </DropdownMenuTrigger>
    <DropdownMenuContent class="w-64" align="start" side="bottom" :side-offset="4">
      <DropdownMenuItem v-if="personalId" as-child>
        <NuxtLink :to="`/s/${personalId}`">
          <HouseIcon class="size-4" />
          <span class="flex-1">{{ ko.nav.personalSpace }}</span>
          <CheckIcon v-if="activeId === personalId" class="size-4" />
        </NuxtLink>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel class="text-muted-foreground text-xs font-normal">
        {{ ko.nav.workspaces }}
      </DropdownMenuLabel>
      <p v-if="space.loaded && !space.workspaces.length" class="text-muted-foreground px-2 py-1 text-xs">
        {{ ko.nav.noWorkspaces }}
      </p>
      <DropdownMenuItem v-for="ws in space.workspaces" :key="ws.id" as-child>
        <NuxtLink :to="`/s/${ws.id}`">
          <SpaceIcon :icon="ws.icon" :color="ws.color" class="size-5 shrink-0 rounded-md text-xs" />
          <span class="flex-1 truncate">{{ ws.name }}</span>
          <CheckIcon v-if="activeId === ws.id" class="size-4" />
        </NuxtLink>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem :disabled="!auth.account" @select="emit('create')">
        <PlusIcon class="size-4" />
        {{ ko.nav.createWorkspace }}
      </DropdownMenuItem>
      <DropdownMenuItem :disabled="!auth.account" @select="emit('join')">
        <TicketIcon class="size-4" />
        {{ ko.nav.joinWithCode }}
      </DropdownMenuItem>
      <template v-if="space.scheduledWorkspaces.length">
        <DropdownMenuSeparator />
        <DropdownMenuLabel class="text-muted-foreground text-xs font-normal">
          {{ ko.nav.deleteScheduled }}
        </DropdownMenuLabel>
        <DropdownMenuItem v-for="ws in space.scheduledWorkspaces" :key="ws.id" as-child class="text-muted-foreground">
          <NuxtLink :to="`/s/${ws.id}/settings`">
            <SpaceIcon :icon="ws.icon" :color="ws.color" class="size-5 shrink-0 rounded-md text-xs opacity-60" />
            <span class="flex-1 truncate">{{ ws.name }}</span>
            <span class="text-destructive text-xs">{{ ko.nav.daysLeft(daysLeft(ws)) }}</span>
          </NuxtLink>
        </DropdownMenuItem>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
