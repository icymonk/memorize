<script setup lang="ts">
import { ko } from '~/locales/ko'

/** NOTE-01: 페이지 아이콘 고르기 (노션처럼 이모지) */
defineProps<{ label?: string }>()
const emit = defineEmits<{ pick: [icon: string] }>()
const t = ko.notes.icon

const EMOJI = [
  '📄', '📝', '📒', '📓', '📔', '📕', '📗', '📘', '📙', '📚', '🗂️', '📁', '📌', '📎', '🔖', '🏷️',
  '✏️', '🖊️', '🗒️', '📅', '🗓️', '⏰', '✅', '☑️', '⭐', '🌟', '💡', '🔥', '🎯', '🚀', '🏆', '🎓',
  '🧠', '💬', '🗣️', '👂', '👀', '🔍', '🌏', '🇰🇷', '🇺🇸', '🇬🇧', '🇯🇵', '🇨🇳', '🇫🇷', '🇩🇪', '🇪🇸', '🔤',
  '🎵', '🎬', '📺', '🎮', '⚽', '🍎', '☕', '🍀', '🌸', '🌙', '☀️', '🌈', '❤️', '💙', '💚', '💛',
  '😀', '😊', '🙂', '😎', '🤔', '😴', '😢', '😡', '👍', '👏', '🙌', '💪', '🐱', '🐶', '🦊', '🐻',
]
const custom = ref('')
function pickCustom() {
  const v = custom.value.trim()
  if (v) emit('pick', [...v].slice(0, 4).join(''))
  custom.value = ''
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <slot />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-72 p-2">
      <div class="grid grid-cols-8 gap-0.5">
        <DropdownMenuItem v-for="e in EMOJI" :key="e" class="justify-center p-1 text-lg" @select="emit('pick', e)">
          {{ e }}
        </DropdownMenuItem>
      </div>
      <form class="mt-2 flex gap-1" @submit.prevent="pickCustom">
        <Input v-model="custom" maxlength="16" :placeholder="t.custom" :aria-label="t.custom" class="h-8" @keydown.stop />
        <Button type="submit" size="sm" variant="outline" class="h-8">
          {{ t.use }}
        </Button>
      </form>
      <DropdownMenuItem class="text-muted-foreground mt-1 justify-center text-xs" @select="emit('pick', '')">
        {{ t.remove }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
