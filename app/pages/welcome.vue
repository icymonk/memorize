<script setup lang="ts">
import { toast } from 'vue-sonner'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'

definePageMeta({ layout: 'auth' })

const auth = useAuthStore()
const route = useRoute()

const displayName = ref(auth.user?.displayName ?? auth.user?.email?.split('@')[0] ?? '')
const timezone = ref(Intl.DateTimeFormat().resolvedOptions().timeZone)
const timezones = Intl.supportedValuesOf('timeZone')
const pending = ref(false)

async function submit() {
  pending.value = true
  try {
    await auth.completeOnboarding(displayName.value.trim(), timezone.value)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await navigateTo(redirect, { replace: true })
  }
  catch (error) {
    toast.error(errorMessage(error) ?? ko.errors.unknown)
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>{{ ko.welcome.title }}</CardTitle>
      <CardDescription>{{ ko.welcome.description }}</CardDescription>
    </CardHeader>
    <CardContent>
      <form class="flex flex-col gap-4" @submit.prevent="submit">
        <div class="flex flex-col gap-2">
          <Label for="displayName">{{ ko.welcome.displayName }}</Label>
          <Input id="displayName" v-model="displayName" required maxlength="30" autocomplete="nickname" />
        </div>
        <div class="flex flex-col gap-2">
          <Label for="timezone">{{ ko.welcome.timezone }}</Label>
          <select
            id="timezone"
            v-model="timezone"
            class="border-input bg-background h-9 rounded-md border px-3 text-sm"
          >
            <option v-for="tz in timezones" :key="tz" :value="tz">
              {{ tz }}
            </option>
          </select>
          <p class="text-muted-foreground text-xs">
            {{ ko.welcome.timezoneHint }}
          </p>
        </div>
        <Button type="submit" :disabled="pending || !displayName.trim()">
          {{ ko.welcome.submit }}
        </Button>
      </form>
    </CardContent>
  </Card>
</template>
