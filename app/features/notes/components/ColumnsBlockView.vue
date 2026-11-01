<script setup lang="ts">
import type { NodeViewProps } from '@tiptap/vue-3'
import { NodeViewWrapper } from '@tiptap/vue-3'
import { ko } from '~/locales/ko'

/** NOTE-06 2~3단 나누기: 단마다 글자만 */
const props = defineProps<NodeViewProps>()
const t = ko.notes.structure
const cols = computed(() => (props.node.attrs.cols ?? []) as string[])
const editable = ref(props.editor.isEditable)
const syncEditable = () => { editable.value = props.editor.isEditable }
onMounted(() => props.editor.on('update', syncEditable))
onBeforeUnmount(() => props.editor.off('update', syncEditable))
const setCol = (i: number, v: string) => props.updateAttributes({ cols: cols.value.map((x, j) => (j === i ? v : x)) })
</script>

<template>
  <NodeViewWrapper class="my-2 grid gap-3" :style="{ gridTemplateColumns: `repeat(${cols.length || 1}, minmax(0, 1fr))` }" data-testid="columns-block">
    <template v-for="(col, i) in cols" :key="i">
      <textarea
        v-if="editable" :value="col" maxlength="2000" rows="4" class="resize-y rounded-md border bg-transparent p-2 text-sm outline-none"
        :aria-label="`${t.column} ${i + 1}`" @change="setCol(i, ($event.target as HTMLTextAreaElement).value)"
      />
      <p v-else class="rounded-md border p-2 text-sm whitespace-pre-wrap">
        {{ col }}
      </p>
    </template>
  </NodeViewWrapper>
</template>
