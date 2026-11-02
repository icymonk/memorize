<script setup lang="ts">
import GlobalSearch from '~/features/space/components/GlobalSearch.vue'

const route = useRoute()
const sid = computed(() => ('spaceId' in route.params ? String(route.params.spaceId) : ''))
</script>

<template>
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset>
      <header class="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <SidebarTrigger />
        <div id="page-header" class="flex flex-1 items-center gap-2" />
        <GlobalSearch v-if="sid" :sid="sid" />
      </header>
      <main class="flex flex-1 flex-col p-4 md:p-6">
        <slot />
      </main>
    </SidebarInset>
  </SidebarProvider>
</template>
