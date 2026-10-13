<script setup lang="ts">
import { ko } from '~/locales/ko'

const s = useDialogState()

function close(ok: boolean) {
  const r = s.resolve
  s.resolve = undefined
  s.open = false
  r?.(s.kind === 'confirm' ? ok : ok ? s.value : null)
}
</script>

<template>
  <Dialog :open="s.open" @update:open="(v: boolean) => { if (!v) close(false) }">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle class="text-base leading-relaxed font-medium">
          {{ s.title }}
        </DialogTitle>
      </DialogHeader>
      <form class="flex flex-col gap-4" @submit.prevent="close(true)">
        <Input v-if="s.kind === 'prompt'" v-model="s.value" autofocus />
        <DialogFooter>
          <Button type="button" variant="outline" @click="close(false)">
            {{ ko.dialog.cancel }}
          </Button>
          <Button type="submit" :variant="s.destructive ? 'destructive' : 'default'">
            {{ ko.dialog.ok }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
