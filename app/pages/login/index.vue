<script setup lang="ts">
import { toast } from 'vue-sonner'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'

definePageMeta({ layout: 'auth' })

const auth = useAuthStore()
const route = useRoute()
const redirect = computed(() => typeof route.query.redirect === 'string' ? route.query.redirect : '/')

const email = ref('')
const sentTo = ref('')
const pending = ref<'google' | 'email' | null>(null)

function fail(error: unknown) {
  const message = errorMessage(error)
  if (message) toast.error(message)
}

async function google() {
  pending.value = 'google'
  try {
    await auth.signInWithGoogle()
    await navigateTo(redirect.value)
  }
  catch (error) {
    fail(error)
  }
  finally {
    pending.value = null
  }
}

async function sendLink() {
  pending.value = 'email'
  try {
    await auth.sendEmailLink(email.value.trim(), redirect.value)
    sentTo.value = email.value.trim()
  }
  catch (error) {
    fail(error)
  }
  finally {
    pending.value = null
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>{{ ko.login.title }}</CardTitle>
      <CardDescription>{{ ko.login.description }}</CardDescription>
    </CardHeader>
    <CardContent class="flex flex-col gap-4">
      <Button variant="outline" :disabled="pending !== null" @click="google">
        {{ ko.login.google }}
      </Button>

      <div class="text-muted-foreground flex items-center gap-3 text-xs">
        <Separator class="flex-1" />
        {{ ko.login.or }}
        <Separator class="flex-1" />
      </div>

      <p v-if="sentTo" class="bg-muted rounded-md px-3 py-2 text-sm" role="status">
        {{ ko.login.linkSent(sentTo) }}
      </p>
      <form v-else class="flex flex-col gap-2" @submit.prevent="sendLink">
        <Label for="email">{{ ko.login.emailLabel }}</Label>
        <Input id="email" v-model="email" type="email" autocomplete="email" required :placeholder="ko.login.emailPlaceholder" />
        <Button type="submit" :disabled="pending !== null || !email">
          {{ ko.login.sendLink }}
        </Button>
      </form>
    </CardContent>
  </Card>
</template>
