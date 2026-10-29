<script setup lang="ts">
import type { MathfieldElement } from 'mathlive'
import { KeyboardIcon } from '@lucide/vue'
import { ko } from '~/locales/ko'
import MathText from './MathText.vue'

/** MATH-02 수식 입력: 화면 수식 키보드(분수·루트·지수…). 넣기를 누르면 LaTeX를 돌려준다 */
const props = defineProps<{ initial?: string }>()
const emit = defineEmits<{ insert: [latex: string, display: boolean] }>()
const open = defineModel<boolean>('open', { default: false })

const t = ko.math.input
const ready = ref(false)
const latex = ref('')
const display = ref(false)
const field = ref<MathfieldElement | null>(null)

async function load() {
  if (ready.value) return
  const { MathfieldElement } = await import('mathlive')
  // 글꼴은 KaTeX CSS(MathText)가 이미 불러온다. 소리는 끈다
  MathfieldElement.fontsDirectory = null
  MathfieldElement.soundsDirectory = null
  ready.value = true
}

watch(open, async (v) => {
  if (!v) {
    window.mathVirtualKeyboard?.hide()
    return
  }
  latex.value = props.initial ?? ''
  display.value = false
  await load()
  await nextTick()
  const f = field.value
  if (!f) return
  f.value = latex.value
  f.mathVirtualKeyboardPolicy = 'manual'
  f.focus()
  if (matchMedia('(pointer: coarse)').matches) window.mathVirtualKeyboard.show()
})

const onInput = (e: Event) => { latex.value = (e.target as MathfieldElement).value }
const toggleKeyboard = () => {
  field.value?.focus()
  const kb = window.mathVirtualKeyboard
  if (kb.visible) kb.hide()
  else kb.show()
}
function insert() {
  const v = latex.value.trim()
  if (!v) return
  emit('insert', v, display.value)
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg" @interact-outside="e => (e.target as HTMLElement)?.closest?.('.ML__keyboard') && e.preventDefault()">
      <DialogHeader>
        <DialogTitle>{{ t.title }}</DialogTitle>
        <DialogDescription>{{ t.hint }}</DialogDescription>
      </DialogHeader>
      <div class="flex items-center gap-2">
        <math-field v-if="ready" ref="field" class="min-h-10 flex-1 rounded-md border px-2 py-1 text-lg" :aria-label="t.title" @input="onInput" />
        <div v-else class="bg-muted h-10 flex-1 animate-pulse rounded-md" />
        <Button type="button" variant="outline" size="icon" :aria-label="t.keyboard" @click="toggleKeyboard">
          <KeyboardIcon />
        </Button>
      </div>
      <label class="flex items-center gap-2 text-sm"><Switch v-model="display" /> {{ t.display }}</label>
      <div class="flex flex-col gap-1">
        <Label for="math-latex" class="text-muted-foreground text-xs">{{ t.latex }}</Label>
        <Input id="math-latex" :model-value="latex" class="font-mono text-xs" @update:model-value="v => { latex = String(v); if (field) field.value = latex }" />
      </div>
      <div v-if="latex.trim()" class="bg-muted/40 rounded-md p-2 text-sm">
        <MathText :text="display ? `$$${latex}$$` : `$${latex}$`" />
      </div>
      <DialogFooter>
        <Button type="button" :disabled="!latex.trim()" @click="insert">{{ t.insert }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
