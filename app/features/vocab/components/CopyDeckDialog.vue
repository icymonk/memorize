<script setup lang="ts">
import { toast } from 'vue-sonner'
import { callFn } from '~/lib/functions'
import { errorMessage } from '~/lib/errors'
import { cn } from '~/lib/utils'
import { ko } from '~/locales/ko'

/** VOC-04, WS-60~64 */
const props = defineProps<{ fromSpaceId: string, deckId: string }>()
const open = defineModel<boolean>('open', { default: false })
const t = ko.vocab.copy
const space = useSpaceStore()
const { $functions } = useNuxtApp()
const targets = computed(() => space.spaces.filter(s => s.id !== props.fromSpaceId && !s.deleteScheduledAt))
const target = ref('')
const busy = ref(false)

watch(open, (v) => {
  if (v) target.value = targets.value[0]?.id ?? ''
})

async function submit() {
  if (!target.value) return
  busy.value = true
  try {
    const { id } = await callFn($functions, 'copyContent', { kind: 'deck', fromSpaceId: props.fromSpaceId, id: props.deckId, toSpaceId: target.value })
    toast.success(t.done)
    open.value = false
    await navigateTo(`/s/${target.value}/decks/${id}`)
  }
  catch (error) {
    toast.error(errorMessage(error) ?? ko.errors.unknown)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t.title }}</DialogTitle>
        <DialogDescription>{{ t.description }}</DialogDescription>
      </DialogHeader>
      <p v-if="!targets.length" class="text-muted-foreground text-sm">
        {{ t.noTarget }}
      </p>
      <div v-else class="flex flex-col gap-1.5" role="radiogroup" :aria-label="t.target">
        <span class="text-sm font-medium">{{ t.target }}</span>
        <button
          v-for="s in targets"
          :key="s.id"
          type="button"
          role="radio"
          :aria-checked="target === s.id"
          :class="cn('flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm', target === s.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/60')"
          @click="target = s.id"
        >
          <span>{{ s.icon }}</span><span class="truncate">{{ s.name }}</span>
        </button>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="open = false">
          {{ ko.vocab.cancel }}
        </Button>
        <Button :disabled="!target || busy" @click="submit">
          {{ t.submit }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
