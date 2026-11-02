<script setup lang="ts">
import type { NodeViewProps } from '@tiptap/vue-3'
import type { Point, Stroke } from '../extensions/drawing'
import { NodeViewWrapper } from '@tiptap/vue-3'
import { toast } from 'vue-sonner'
import { ko } from '~/locales/ko'
import { addPoint, DRAW_COLORS, DRAW_H, DRAW_W, DRAW_WIDTHS, finishStroke, formatPoints, hitStroke, MAX_DRAW_POINTS, pointCount } from '../extensions/drawing'

/** NOTE-11·REV-08 그리기 블록: 펜(색·굵기), 지우개(닿은 획 지우기), 되돌리기, 모두 지우기. 손가락·펜·마우스 모두 포인터 이벤트로 */
const props = defineProps<NodeViewProps>()
const t = ko.notes.structure.draw
const strokes = computed(() => (props.node.attrs.strokes ?? []) as Stroke[])
const editable = ref(props.editor.isEditable)
const syncEditable = () => { editable.value = props.editor.isEditable }
onMounted(() => props.editor.on('update', syncEditable))
onBeforeUnmount(() => props.editor.off('update', syncEditable))

const color = ref<string>(DRAW_COLORS[0])
const width = ref<number>(DRAW_WIDTHS[1])
const tool = ref<'pen' | 'eraser'>('pen')
const svg = ref<SVGSVGElement>()
const draft = ref('')
const erasing = ref<Stroke[] | null>(null)
const shown = computed(() => erasing.value ?? strokes.value)
let current: Point[] | null = null

const save = (next: Stroke[]) => props.updateAttributes({ strokes: next })
function pos(e: PointerEvent): Point {
  const r = svg.value!.getBoundingClientRect()
  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v))
  return [clamp((e.clientX - r.left) / r.width * DRAW_W, DRAW_W), clamp((e.clientY - r.top) / r.height * DRAW_H, DRAW_H)]
}
function erase([x, y]: Point) {
  const base = erasing.value ?? strokes.value
  const next = base.filter(s => !hitStroke(s, x, y))
  if (next.length !== base.length || !erasing.value) erasing.value = next
}
function down(e: PointerEvent) {
  if (!editable.value) return
  e.preventDefault()
  svg.value!.setPointerCapture(e.pointerId)
  if (tool.value === 'eraser') return erase(pos(e))
  if (pointCount(strokes.value) >= MAX_DRAW_POINTS) return void toast.warning(t.full)
  current = [pos(e)]
  draft.value = formatPoints(current)
}
function move(e: PointerEvent) {
  if (erasing.value) return erase(pos(e))
  if (current && addPoint(current, ...pos(e))) draft.value = formatPoints(current)
}
function up() {
  if (erasing.value) {
    if (erasing.value.length !== strokes.value.length) save(erasing.value)
    erasing.value = null
  }
  if (!current) return
  const s = finishStroke(current, color.value, width.value)
  current = null
  draft.value = ''
  save([...strokes.value, s])
}
</script>

<template>
  <NodeViewWrapper class="my-2 flex flex-col gap-1" data-testid="drawing-block" contenteditable="false">
    <div v-if="editable" class="flex flex-wrap items-center gap-1" role="toolbar" :aria-label="t.label">
      <button
        v-for="(c, i) in DRAW_COLORS" :key="c" type="button" :aria-label="`${t.color} ${i + 1}`" :aria-pressed="tool === 'pen' && color === c"
        :class="['size-6 rounded-full border-2', tool === 'pen' && color === c ? 'border-foreground' : 'border-transparent']" :style="{ background: c }"
        @click="color = c; tool = 'pen'"
      />
      <span class="mx-1 h-5 w-px bg-border" />
      <Button v-for="w in DRAW_WIDTHS" :key="w" size="sm" :variant="width === w ? 'secondary' : 'ghost'" :aria-label="`${t.width} ${w}`" :aria-pressed="width === w" @click="width = w">
        <span class="rounded-full bg-foreground" :style="{ width: `${w + 2}px`, height: `${w + 2}px` }" />
      </Button>
      <span class="mx-1 h-5 w-px bg-border" />
      <Button size="sm" :variant="tool === 'eraser' ? 'secondary' : 'ghost'" :aria-pressed="tool === 'eraser'" @click="tool = tool === 'eraser' ? 'pen' : 'eraser'">
        {{ t.eraser }}
      </Button>
      <Button size="sm" variant="ghost" :disabled="!strokes.length" @click="save(strokes.slice(0, -1))">
        {{ t.undo }}
      </Button>
      <Button size="sm" variant="ghost" :disabled="!strokes.length" @click="save([])">
        {{ t.clear }}
      </Button>
    </div>
    <svg
      ref="svg" :viewBox="`0 0 ${DRAW_W} ${DRAW_H}`" role="img" :aria-label="t.label"
      :class="['w-full rounded-md border bg-white touch-none select-none', editable ? (tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair') : '']"
      @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @dragstart.prevent
    >
      <polyline v-for="(s, i) in shown" :key="i" :points="s.p" :stroke="s.c" :stroke-width="s.w" fill="none" stroke-linecap="round" stroke-linejoin="round" data-stroke />
      <polyline v-if="draft" :points="draft" :stroke="color" :stroke-width="width" fill="none" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </NodeViewWrapper>
</template>
