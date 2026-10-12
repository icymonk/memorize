<script setup lang="ts">
import type { SlashItem } from '../extensions/slash'
import { cn } from '~/lib/utils'
import { ko } from '~/locales/ko'

/** `/` 블록 메뉴 목록. 키보드는 BlockEditor가 onKeyDown으로 넘겨준다 */
const props = defineProps<{ items: SlashItem[], command: (item: SlashItem) => void }>()
const selected = ref(0)
watch(() => props.items, () => { selected.value = 0 })

function onKeyDown(event: KeyboardEvent): boolean {
  const n = props.items.length
  if (!n) return false
  if (event.key === 'ArrowDown') selected.value = (selected.value + 1) % n
  else if (event.key === 'ArrowUp') selected.value = (selected.value + n - 1) % n
  else if (event.key === 'Enter') props.command(props.items[selected.value]!)
  else return false
  return true
}
defineExpose({ onKeyDown })
</script>

<template>
  <div class="bg-popover text-popover-foreground max-h-72 w-56 overflow-y-auto rounded-md border p-1 shadow-md">
    <p v-if="!items.length" class="text-muted-foreground px-2 py-1.5 text-sm">
      {{ ko.notes.noBlockMatch }}
    </p>
    <button
      v-for="(item, i) in items"
      :key="item.key"
      type="button"
      :class="cn('flex w-full rounded-sm px-2 py-1.5 text-left text-sm', i === selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60')"
      @mouseenter="selected = i"
      @mousedown.prevent="command(item)"
    >
      {{ ko.notes.blocks[item.key] }}
    </button>
  </div>
</template>
