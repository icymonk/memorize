<script setup lang="ts">
import { toast } from 'vue-sonner'
import { errorMessage } from '~/lib/errors'
import { callFn } from '~/lib/functions'
import { ko } from '~/locales/ko'

const props = defineProps<{ fromName: string }>()
const emit = defineEmits<{ done: [] }>()

const space = useSpaceStore()
const { $functions } = useNuxtApp()
const pending = ref(false)

async function respond(accept: boolean) {
  const s = space.current
  if (!s) return
  pending.value = true
  try {
    await callFn($functions, 'respondOwnership', { spaceId: s.id, accept })
    await space.refreshCurrent()
    await space.enter(s.id, true)
    toast.success(accept ? ko.members.ownership.accepted : ko.members.ownership.declined)
    emit('done')
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
  <div class="bg-primary/5 border-primary/30 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3">
    <p class="flex-1 text-sm">
      {{ ko.members.ownership.incoming(props.fromName) }}
    </p>
    <Button size="sm" :disabled="pending" @click="respond(true)">
      {{ ko.members.ownership.accept }}
    </Button>
    <Button size="sm" variant="outline" :disabled="pending" @click="respond(false)">
      {{ ko.members.ownership.decline }}
    </Button>
  </div>
</template>
