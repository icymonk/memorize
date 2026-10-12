<script setup lang="ts">
import { HouseIcon, LayoutDashboardIcon, PlusIcon, SettingsIcon, TicketIcon } from '@lucide/vue'
import CreateWorkspaceDialog from '~/features/space/components/CreateWorkspaceDialog.vue'
import SpaceIcon from '~/features/space/components/SpaceIcon.vue'
import { ko } from '~/locales/ko'

const auth = useAuthStore()
const space = useSpaceStore()
const route = useRoute()
const createOpen = ref(false)

const personalSpacePath = computed(() => auth.account ? `/s/${auth.account.personalSpaceId}` : undefined)
const activeSpaceId = computed(() => 'spaceId' in route.params ? route.params.spaceId : null)
const currentWorkspace = computed(() => space.current?.kind === 'workspace' && space.current.id === activeSpaceId.value ? space.current : null)

watch(() => auth.account, (account) => {
  if (account) space.loadMySpaces().catch(() => {})
}, { immediate: true })
</script>

<template>
  <Sidebar collapsible="icon">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton as-child size="lg">
            <NuxtLink to="/">
              <span class="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg font-semibold">m</span>
              <span class="font-semibold">{{ ko.app.name }}</span>
            </NuxtLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>

    <SidebarContent>
      <SidebarGroup>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton v-if="personalSpacePath" as-child :tooltip="ko.nav.personalSpace" :is-active="activeSpaceId === auth.account?.personalSpaceId">
              <NuxtLink :to="personalSpacePath">
                <HouseIcon />
                <span>{{ ko.nav.personalSpace }}</span>
              </NuxtLink>
            </SidebarMenuButton>
            <SidebarMenuButton v-else :tooltip="ko.nav.personalSpace" disabled aria-disabled="true">
              <HouseIcon />
              <span>{{ ko.nav.personalSpace }}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>

      <SidebarGroup v-if="currentWorkspace">
        <SidebarGroupLabel>{{ currentWorkspace.name }}</SidebarGroupLabel>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton as-child :tooltip="ko.space.settings.home" :is-active="route.path === `/s/${currentWorkspace.id}`">
              <NuxtLink :to="`/s/${currentWorkspace.id}`">
                <LayoutDashboardIcon />
                <span>{{ ko.space.settings.home }}</span>
              </NuxtLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton as-child :tooltip="ko.space.settings.nav" :is-active="route.path === `/s/${currentWorkspace.id}/settings`">
              <NuxtLink :to="`/s/${currentWorkspace.id}/settings`">
                <SettingsIcon />
                <span>{{ ko.space.settings.nav }}</span>
              </NuxtLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel>{{ ko.nav.workspaces }}</SidebarGroupLabel>
        <SidebarGroupContent>
          <p v-if="space.loaded && !space.workspaces.length" class="text-muted-foreground px-2 py-1 text-xs group-data-[collapsible=icon]:hidden">
            {{ ko.nav.noWorkspaces }}
          </p>
          <SidebarMenu>
            <SidebarMenuItem v-for="ws in space.workspaces" :key="ws.id">
              <SidebarMenuButton as-child :tooltip="ws.name" :is-active="activeSpaceId === ws.id">
                <NuxtLink :to="`/s/${ws.id}`">
                  <SpaceIcon :icon="ws.icon" :color="ws.color" class="size-5 rounded-md text-xs" />
                  <span class="truncate">{{ ws.name }}</span>
                </NuxtLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton :tooltip="ko.nav.createWorkspace" :disabled="!auth.account" @click="createOpen = true">
                <PlusIcon />
                <span>{{ ko.nav.createWorkspace }}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton :tooltip="ko.nav.joinWithCode" disabled aria-disabled="true">
                <TicketIcon />
                <span>{{ ko.nav.joinWithCode }}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>

    <SidebarFooter>
      <AppUserMenu />
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>
  <CreateWorkspaceDialog v-model:open="createOpen" />
</template>
