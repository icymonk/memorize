<script setup lang="ts">
import type { PropDef, PropValue } from '#shared/schemas/collection'
import { coerceProp } from '#shared/schemas/collection'
import { ChevronDownIcon } from '@lucide/vue'
import { isTagProp, tagAwareDef, TAG_MAX } from '~/features/space/services/tags'
import { cn } from '~/lib/utils'
import { ko } from '~/locales/ko'

/** NOTE-42·46: 모음 항목 값 하나 — 표와 페이지 위 항목 칸에서 같이 쓴다 */
const props = defineProps<{ def: PropDef, value?: PropValue, readonly?: boolean }>()
const emit = defineEmits<{ update: [value: PropValue] }>()
const t = ko.notes.collections

const box = 'h-8 w-full rounded-md bg-transparent px-2 text-sm outline-none hover:bg-muted focus:bg-muted disabled:hover:bg-transparent'
const list = computed(() => (Array.isArray(props.value) ? props.value : []))

const isTag = computed(() => isTagProp(props.def))
const draft = ref('')

function commit(raw: unknown) {
  const v = coerceProp(tagAwareDef(props.def, raw), raw)
  if (JSON.stringify(v) !== JSON.stringify(props.value ?? null)) emit('update', v)
}
function toggleOption(o: string) {
  commit(list.value.includes(o) ? list.value.filter(x => x !== o) : [...list.value, o])
}
function addDraft() {
  const v = draft.value.trim()
  draft.value = ''
  if (v && !list.value.includes(v)) commit([...list.value, v])
}
</script>

<template>
  <input
    v-if="def.type === 'checkbox'"
    type="checkbox"
    class="accent-primary size-4"
    :checked="value === true"
    :disabled="readonly"
    :aria-label="def.name"
    @change="commit(($event.target as HTMLInputElement).checked)"
  >
  <select
    v-else-if="def.type === 'select'"
    :class="box"
    :value="typeof value === 'string' ? value : ''"
    :disabled="readonly"
    :aria-label="def.name"
    @change="commit(($event.target as HTMLSelectElement).value)"
  >
    <option value="">
      {{ readonly ? '' : t.none }}
    </option>
    <option v-for="o in def.options" :key="o" :value="o">
      {{ o }}
    </option>
  </select>
  <DropdownMenu v-else-if="def.type === 'multiSelect'">
    <DropdownMenuTrigger as-child :disabled="readonly">
      <button type="button" :class="cn(box, 'flex items-center gap-1 overflow-hidden text-left')" :aria-label="def.name">
        <span v-for="o in list" :key="o" class="bg-secondary shrink-0 rounded px-1.5 py-0.5 text-xs">{{ o }}</span>
        <ChevronDownIcon v-if="!readonly && !list.length" class="text-muted-foreground ml-auto size-3.5" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="max-h-72 overflow-y-auto">
      <DropdownMenuCheckboxItem v-for="o in def.options" :key="o" :model-value="list.includes(o)" @select.prevent="toggleOption(o)">
        {{ o }}
      </DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem v-for="o in list.filter(x => !def.options.includes(x))" :key="`x-${o}`" :model-value="true" @select.prevent="toggleOption(o)">
        {{ o }}
      </DropdownMenuCheckboxItem>
      <input
        v-if="isTag"
        v-model="draft"
        :maxlength="TAG_MAX"
        :placeholder="t.newTag"
        :aria-label="t.newTag"
        class="bg-muted/60 mt-1 h-8 w-full rounded px-2 text-sm outline-none"
        @keydown.stop
        @keydown.enter.prevent="addDraft"
      >
    </DropdownMenuContent>
  </DropdownMenu>
  <input
    v-else
    :type="def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text'"
    :class="box"
    :value="value ?? ''"
    :readonly="readonly"
    :aria-label="def.name"
    :maxlength="def.type === 'text' ? 500 : undefined"
    @change="commit(($event.target as HTMLInputElement).value)"
    @keydown.enter="($event.target as HTMLInputElement).blur()"
  >
</template>
