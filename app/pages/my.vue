<script setup lang="ts">
definePageMeta({
  middleware: async () => {
    const account = await useAuthStore().ensureAccount()
    return navigateTo(account ? `/s/${account.personalSpaceId}` : '/', { replace: true })
  },
})
</script>

<template>
  <div />
</template>
