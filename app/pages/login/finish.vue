<script setup lang="ts">
import { toast } from 'vue-sonner'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'

definePageMeta({ layout: 'auth' })

const auth = useAuthStore()
const route = useRoute()
const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'

const needsEmail = ref(false)
const email = ref('')
const pending = ref(false)

async function finish(address: string) {
  pending.value = true
  try {
    await auth.finishEmailLink(address, window.location.href)
    await navigateTo(redirect, { replace: true })
  }
  catch (error) {
    toast.error(errorMessage(error) ?? ko.errors.unknown)
    await navigateTo('/login', { replace: true })
  }
  finally {
    pending.value = false
  }
}

onMounted(() => {
  if (auth.user) return navigateTo(redirect, { replace: true })
  if (!auth.isEmailLink(window.location.href)) return navigateTo('/login', { replace: true })
  const stored = auth.storedEmail()
  if (stored) finish(stored)
  else needsEmail.value = true
})
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>{{ ko.login.title }}</CardTitle>
      <CardDescription v-if="needsEmail">
        {{ ko.login.confirmEmail }}
      </CardDescription>
    </CardHeader>
    <CardContent>
      <form v-if="needsEmail" class="flex flex-col gap-2" @submit.prevent="finish(email.trim())">
        <Label for="email">{{ ko.login.emailLabel }}</Label>
        <Input id="email" v-model="email" type="email" autocomplete="email" required />
        <Button type="submit" :disabled="pending || !email">
          {{ ko.login.confirm }}
        </Button>
      </form>
      <p v-else class="text-muted-foreground text-sm" role="status">
        {{ ko.login.finishing }}
      </p>
    </CardContent>
  </Card>
</template>
