<script setup lang="ts">
import { BookOpenIcon, HouseIcon, LayoutDashboardIcon, PlusIcon, SettingsIcon, TicketIcon, UsersIcon } from '@lucide/vue'
import CreateWorkspaceDialog from '~/features/space/components/CreateWorkspaceDialog.vue'
import JoinWithCodeDialog from '~/features/space/components/JoinWithCodeDialog.vue'
import SpaceIcon from '~/features/space/components/SpaceIcon.vue'
import { ko } from '~/locales/ko'

const auth = useAuthStore()
const space = useSpaceStore()
const route = useRoute()
const createOpen = ref(false)
const joinOpen = ref(false)

const personalSpacePath = computed(() => auth.account ? `/s/${auth.account.personalSpaceId}` : undefined)
const activeSpaceId = computed(() => 'spaceId' in route.params ? route.params.spaceId : null)
const currentSpace = computed(() => space.current && space.current.id === activeSpaceId.value ? space.current : null)
const currentWorkspace = computed(() => currentSpace.value?.kind === 'workspace' ? currentSpace.value : null)

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

      <SidebarGroup v-if="currentSpace">
        <SidebarGroupLabel>{{ currentWorkspace ? currentWorkspace.name : ko.nav.personalSpace }}</SidebarGroupLabel>
        <SidebarMenu>
          <SidebarMenuItem v-if="currentWorkspace">
            <SidebarMenuButton as-child :tooltip="ko.space.settings.home" :is-active="route.path === `/s/${currentWorkspace.id}`">
              <NuxtLink :to="`/s/${currentWorkspace.id}`">
                <LayoutDashboardIcon />
                <span>{{ ko.space.settings.home }}</span>
              </NuxtLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem v-if="currentSpace.modules?.vocab !== false">
            <SidebarMenuButton as-child :tooltip="ko.vocab.nav" :is-active="route.path.startsWith(`/s/${currentSpace.id}/decks`)">
              <NuxtLink :to="`/s/${currentSpace.id}/decks`">
                <BookOpenIcon />
                <span>{{ ko.vocab.nav }}</span>
              </NuxtLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem v-if="currentWorkspace">
            <SidebarMenuButton as-child :tooltip="ko.members.nav" :is-active="route.path === `/s/${currentWorkspace.id}/members`">
              <NuxtLink :to="`/s/${currentWorkspace.id}/members`">
                <UsersIcon />
                <span>{{ ko.members.nav }}</span>
              </NuxtLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem v-if="currentWorkspace">
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
              <SidebarMenuButton :tooltip="ko.nav.joinWithCode" :disabled="!auth.account" @click="joinOpen = true">
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
  <JoinWithCodeDialog v-model:open="joinOpen" />
</template>
