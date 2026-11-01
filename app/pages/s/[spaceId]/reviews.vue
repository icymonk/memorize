<script setup lang="ts">
import { toast } from 'vue-sonner'
import { ensureBookReview, REVIEW_ID } from '~/features/notes/services/collections'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'

/** REV-01: 공간의 독후감(기본 모음)을 처음 열 때 만들고 그 모음으로 보낸다 */
const route = useRoute()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const sid = route.params.spaceId as string

onMounted(async () => {
  try {
    await ensureBookReview($firestore, sid, auth.user!.uid)
    await navigateTo(`/s/${sid}/collections/${REVIEW_ID}`, { replace: true })
  }
  catch (error) { toast.error(errorMessage(error) ?? ko.errors.unknown) }
})
</script>

<template>
  <div class="text-muted-foreground p-10 text-center text-sm">
    …
  </div>
</template>
