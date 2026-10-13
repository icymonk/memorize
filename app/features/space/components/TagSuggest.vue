<script setup lang="ts">
import type { Tag } from '../services/tags'
import { TAG_CLASS, tagKey } from '../services/tags'

/** CMN-51: 쉼표로 구분한 태그 입력 아래에 공통 태그를 눌러 넣는 칩 */
const props = defineProps<{ tags: Tag[] }>()
const model = defineModel<string>({ required: true })

const used = computed(() => new Set(model.value.split(',').map(tagKey).filter(Boolean)))
const left = computed(() => props.tags.filter(t => !used.value.has(t.id)).slice(0, 20))

function add(t: Tag) {
  const cur = model.value.trim().replace(/,$/, '').trim()
  model.value = cur ? `${cur}, ${t.name}` : t.name
}
</script>

<template>
  <div v-if="left.length" class="flex flex-wrap gap-1">
    <button
      v-for="t in left"
      :key="t.id"
      type="button"
      class="rounded-full px-2 py-0.5 text-xs hover:opacity-80"
      :class="TAG_CLASS[t.color] ?? TAG_CLASS.gray"
      @click="add(t)"
    >
      #{{ t.name }}
    </button>
  </div>
</template>
