<script setup lang="ts">
import { ChevronsUpDownIcon, LogOutIcon, SettingsIcon, UserIcon } from '@lucide/vue'
import { useSidebar } from '@/components/ui/sidebar'
import { ko } from '~/locales/ko'

const auth = useAuthStore()
const { isMobile } = useSidebar()

const name = computed(() => auth.user?.displayName || auth.user?.email || '')
const initial = computed(() => name.value.slice(0, 1).toUpperCase())

async function signOut() {
  await auth.signOut()
  await navigateTo('/login')
}
</script>

<template>
  <SidebarMenu v-if="auth.user">
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <SidebarMenuButton size="lg">
            <Avatar class="size-8 rounded-lg">
              <AvatarImage v-if="auth.user.photoURL" :src="auth.user.photoURL" :alt="name" />
              <AvatarFallback class="rounded-lg">
                {{ initial }}
              </AvatarFallback>
            </Avatar>
            <span class="flex-1 truncate text-sm">{{ name }}</span>
            <ChevronsUpDownIcon class="ml-auto" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent :side="isMobile ? 'bottom' : 'right'" align="end" class="min-w-56">
          <DropdownMenuItem disabled>
            <UserIcon />
            {{ ko.nav.profile }}
          </DropdownMenuItem>
          <DropdownMenuItem @select="navigateTo('/settings')">
            <SettingsIcon />
            {{ ko.nav.settings }}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem @select="signOut">
            <LogOutIcon />
            {{ ko.nav.signOut }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  </SidebarMenu>
</template>
