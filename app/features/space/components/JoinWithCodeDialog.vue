<script setup lang="ts">
import { inviteCodeSchema } from '#shared/schemas/invite'
import { ko } from '~/locales/ko'

const open = defineModel<boolean>('open', { default: false })
const code = ref('')
const valid = computed(() => inviteCodeSchema.safeParse(code.value).success)

watch(open, (value) => {
  if (value) code.value = ''
})

async function submit() {
  const parsed = inviteCodeSchema.safeParse(code.value)
  if (!parsed.success) return
  open.value = false
  await navigateTo(`/invite/${parsed.data}`)
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ ko.invite.codeDialog.title }}</DialogTitle>
        <DialogDescription>{{ ko.invite.codeDialog.description }}</DialogDescription>
      </DialogHeader>
      <form id="join-with-code" @submit.prevent="submit">
        <Input
          v-model="code"
          :placeholder="ko.invite.codeDialog.placeholder"
          maxlength="6"
          autocomplete="off"
          class="text-center font-mono text-lg tracking-[0.4em] uppercase"
        />
      </form>
      <DialogFooter>
        <Button type="submit" form="join-with-code" :disabled="!valid">
          {{ ko.invite.codeDialog.submit }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
