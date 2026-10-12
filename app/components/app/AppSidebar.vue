<script setup lang="ts">
import { BookOpenIcon, CalendarCheckIcon, FileTextIcon, LayoutDashboardIcon, SettingsIcon, StarIcon, Trash2Icon, UsersIcon } from '@lucide/vue'
import PageTree from '~/features/notes/components/PageTree.vue'
import CreateWorkspaceDialog from '~/features/space/components/CreateWorkspaceDialog.vue'
import JoinWithCodeDialog from '~/features/space/components/JoinWithCodeDialog.vue'
import SpaceSwitcher from '~/features/space/components/SpaceSwitcher.vue'
import { ko } from '~/locales/ko'

const auth = useAuthStore()
const space = useSpaceStore()
const route = useRoute()
const createOpen = ref(false)
const joinOpen = ref(false)

const activeSpaceId = computed(() => 'spaceId' in route.params ? route.params.spaceId : null)
const currentSpace = computed(() => space.current && space.current.id === activeSpaceId.value ? space.current : null)
const currentWorkspace = computed(() => currentSpace.value?.kind === 'workspace' ? currentSpace.value : null)
const notes = useNotesStore()
const activePageId = computed(() => 'pageId' in route.params ? route.params.pageId : null)
const notesOn = computed(() => !!currentSpace.value && currentSpace.value.modules?.notes !== false)

watch(() => auth.account, (account) => {
  if (account) space.loadMySpaces().catch(() => {})
}, { immediate: true })
</script>

<template>
  <Sidebar collapsible="icon">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SpaceSwitcher :active-id="currentSpace?.id ?? null" @create="createOpen = true" @join="joinOpen = true" />
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>

    <SidebarContent>
      <SidebarGroup v-if="currentSpace">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton as-child :tooltip="ko.space.settings.home" :is-active="route.path === `/s/${currentSpace.id}`">
              <NuxtLink :to="`/s/${currentSpace.id}`">
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
          <SidebarMenuItem v-if="currentSpace.modules?.vocab !== false">
            <SidebarMenuButton as-child :tooltip="ko.vocab.review.nav" :is-active="route.path === `/s/${currentSpace.id}/review`">
              <NuxtLink :to="`/s/${currentSpace.id}/review`">
                <CalendarCheckIcon />
                <span>{{ ko.vocab.review.nav }}</span>
              </NuxtLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem v-if="currentSpace.modules?.notes !== false">
            <SidebarMenuButton as-child :tooltip="ko.notes.nav" :is-active="route.path.startsWith(`/s/${currentSpace.id}/notes`)">
              <NuxtLink :to="`/s/${currentSpace.id}/notes`">
                <FileTextIcon />
                <span>{{ ko.notes.nav }}</span>
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

      <template v-if="currentSpace && notesOn">
        <SidebarGroup v-if="notes.favorites.length" class="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>{{ ko.notes.favorites }}</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem v-for="p in notes.favorites" :key="p.id">
              <SidebarMenuButton as-child size="sm" :is-active="activePageId === p.id">
                <NuxtLink :to="`/s/${currentSpace.id}/notes/${p.id}`">
                  <StarIcon class="text-amber-500" />
                  <span>{{ p.title || ko.notes.untitled }}</span>
                </NuxtLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <PageTree v-if="currentWorkspace" :sid="currentSpace.id" root="shared" :label="ko.notes.sharedPages" :can-create="space.can('create')" />
        <PageTree :sid="currentSpace.id" root="private" :label="currentWorkspace ? ko.notes.myPages : ko.notes.pages" :can-create="true" />
        <SidebarGroup class="group-data-[collapsible=icon]:hidden">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton as-child size="sm" :is-active="route.path === `/s/${currentSpace.id}/notes/trash`">
                <NuxtLink :to="`/s/${currentSpace.id}/notes/trash`">
                  <Trash2Icon />
                  <span>{{ ko.notes.trash }}</span>
                </NuxtLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </template>
    </SidebarContent>

    <SidebarFooter>
      <AppUserMenu />
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>
  <CreateWorkspaceDialog v-model:open="createOpen" />
  <JoinWithCodeDialog v-model:open="joinOpen" />
</template>
