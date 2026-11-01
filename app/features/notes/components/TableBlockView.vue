<script setup lang="ts">
import type { NodeViewProps } from '@tiptap/vue-3'
import type { TableRow } from '../extensions/structure'
import { NodeViewWrapper } from '@tiptap/vue-3'
import { ko } from '~/locales/ko'
import { MAX_TABLE_COLS, MAX_TABLE_ROWS } from '../extensions/structure'

/** NOTE-06 간단한 표: 첫 행은 머리글. 칸은 글자만 */
const props = defineProps<NodeViewProps>()
const t = ko.notes.structure
const rows = computed(() => ((props.node.attrs.rows ?? []) as TableRow[]).map(r => r.cells ?? []))
const cols = computed(() => rows.value[0]?.length ?? 0)
const editable = computed(() => props.editor.isEditable)

const save = (next: string[][]) => props.updateAttributes({ rows: next.map(cells => ({ cells })) })
const setCell = (r: number, c: number, v: string) => save(rows.value.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)))
</script>

<template>
  <NodeViewWrapper class="my-2 flex flex-col gap-1" data-testid="simple-table">
    <div class="overflow-x-auto">
      <table class="w-full border-collapse text-sm">
        <tbody>
          <tr v-for="(row, r) in rows" :key="r">
            <component :is="r === 0 ? 'th' : 'td'" v-for="(cell, c) in row" :key="c" :class="['border p-0 text-left align-top', r === 0 ? 'bg-muted font-medium' : 'font-normal']">
              <input
                v-if="editable" :value="cell" maxlength="500" class="w-full min-w-20 bg-transparent px-2 py-1 outline-none"
                :aria-label="`${t.cell} ${r + 1}-${c + 1}`" @change="setCell(r, c, ($event.target as HTMLInputElement).value)"
              >
              <span v-else class="block px-2 py-1 whitespace-pre-wrap">{{ cell }}</span>
            </component>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="editable" class="flex flex-wrap gap-1">
      <Button size="sm" variant="ghost" :disabled="rows.length >= MAX_TABLE_ROWS" @click="save([...rows, Array.from({ length: cols }, () => '')])">
        {{ t.addRow }}
      </Button>
      <Button size="sm" variant="ghost" :disabled="cols >= MAX_TABLE_COLS" @click="save(rows.map(r => [...r, '']))">
        {{ t.addCol }}
      </Button>
      <Button size="sm" variant="ghost" :disabled="rows.length <= 1" @click="save(rows.slice(0, -1))">
        {{ t.removeRow }}
      </Button>
      <Button size="sm" variant="ghost" :disabled="cols <= 1" @click="save(rows.map(r => r.slice(0, -1)))">
        {{ t.removeCol }}
      </Button>
    </div>
  </NodeViewWrapper>
</template>
