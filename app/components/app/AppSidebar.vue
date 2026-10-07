<script setup lang="ts">
import { HouseIcon, PlusIcon, TicketIcon } from '@lucide/vue'
import { ko } from '~/locales/ko'

const auth = useAuthStore()
const personalSpacePath = computed(() => auth.account ? `/s/${auth.account.personalSpaceId}` : undefined)
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
            <SidebarMenuButton :tooltip="ko.nav.personalSpace" :disabled="!personalSpacePath" :aria-disabled="!personalSpacePath">
              <HouseIcon />
              <span>{{ ko.nav.personalSpace }}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel>{{ ko.nav.workspaces }}</SidebarGroupLabel>
        <SidebarGroupContent>
          <p class="text-muted-foreground px-2 py-1 text-xs group-data-[collapsible=icon]:hidden">
            {{ ko.nav.noWorkspaces }}
          </p>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton :tooltip="ko.nav.createWorkspace" disabled aria-disabled="true">
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
</template>
