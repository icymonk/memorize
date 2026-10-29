<script setup lang="ts">
import katex from 'katex'
import { splitTex } from '../lib/tex'
import 'katex/dist/katex.min.css'

/** 지문·보기·해설 글자에서 `$…$` 수식을 KaTeX로 그린다 (MATH-01). 수식이 없으면 글자 그대로 */
const props = defineProps<{ text: string | null | undefined }>()

const parts = computed(() => splitTex(props.text ?? '').map(p => p.kind === 'text'
  ? p
  : { ...p, html: katex.renderToString(p.value, { displayMode: p.display, throwOnError: false, output: 'htmlAndMathml', strict: 'ignore' }) }))
</script>

<template>
  <span class="math-text"><template v-for="(p, i) in parts" :key="i"><template v-if="p.kind === 'text'">{{ p.value }}</template><span v-else-if="'html' in p" :class="p.display ? 'block overflow-x-auto py-1' : 'inline'" v-html="p.html" /></template></span>
</template>
