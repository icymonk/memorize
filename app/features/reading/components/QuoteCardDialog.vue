<script setup lang="ts">
import type { Quote } from '../services/quotes'
import { DownloadIcon, Share2Icon } from '@lucide/vue'
import { ko } from '~/locales/ko'

/** READ-32 구절 이미지 카드: 1080×1080 PNG로 내려받거나 공유 */
const props = defineProps<{ quote: Quote | null }>()
const emit = defineEmits<{ close: [] }>()
const t = ko.reading.quotes
const THEMES = [
  { bg: '#fbf5e9', fg: '#3b3226', sub: '#8a7a63' },
  { bg: '#1f2937', fg: '#f9fafb', sub: '#9ca3af' },
  { bg: '#e0f2fe', fg: '#0c4a6e', sub: '#0369a1' },
] as const
const SIZE = 1080
const PAD = 120
const theme = ref(0)
const canvas = ref<HTMLCanvasElement | null>(null)
const canShare = import.meta.client && typeof navigator.share === 'function'

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const tok of para.split(/(?<=\s)/)) {
      if (ctx.measureText(line + tok).width <= max) {
        line += tok
        continue
      }
      if (line) lines.push(line.trimEnd())
      line = ''
      for (const ch of tok) {
        if (ctx.measureText(line + ch).width > max && line) {
          lines.push(line)
          line = ''
        }
        line += ch
      }
    }
    lines.push(line.trimEnd())
  }
  return lines
}

function draw() {
  const c = canvas.value
  const q = props.quote
  const ctx = c?.getContext('2d')
  if (!c || !q || !ctx) return
  const th = THEMES[theme.value]!
  const family = getComputedStyle(document.body).fontFamily
  ctx.fillStyle = th.bg
  ctx.fillRect(0, 0, SIZE, SIZE)
  let size = 64
  let lines: string[] = []
  for (; size >= 32; size -= 4) {
    ctx.font = `600 ${size}px ${family}`
    lines = wrap(ctx, q.text, SIZE - PAD * 2)
    if (lines.length * size * 1.5 <= 620) break
  }
  const lh = size * 1.5
  const top = (SIZE - lines.length * lh) / 2
  ctx.fillStyle = th.sub
  ctx.font = `700 120px ${family}`
  ctx.textBaseline = 'top'
  ctx.fillText('“', PAD - 10, Math.max(60, top - 150))
  ctx.fillStyle = th.fg
  ctx.font = `600 ${size}px ${family}`
  lines.forEach((l, i) => ctx.fillText(l, PAD, top + i * lh))
  ctx.fillStyle = th.sub
  ctx.font = `500 36px ${family}`
  const meta = [`『${q.title}』`, q.position != null ? `${q.position}${ko.reading.log.units[q.unit]}` : ''].filter(Boolean).join(' · ')
  ctx.fillText(wrap(ctx, meta, SIZE - PAD * 2)[0] ?? '', PAD, SIZE - PAD - 36)
}
watch([() => props.quote, theme, canvas], () => nextTick(draw))

const blob = () => new Promise<Blob | null>(r => canvas.value ? canvas.value.toBlob(r, 'image/png') : r(null))
const fileName = () => `${props.quote?.title ?? 'quote'}-구절.png`
async function download() {
  const b = await blob()
  if (!b) return
  const a = document.createElement('a')
  a.href = URL.createObjectURL(b)
  a.download = fileName()
  a.click()
  URL.revokeObjectURL(a.href)
}
async function share() {
  const b = await blob()
  if (!b) return
  const file = new File([b], fileName(), { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: props.quote?.title }).catch(() => {})
  else await download()
}
</script>

<template>
  <Dialog :open="!!quote" @update:open="v => !v && emit('close')">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t.cardTitle }}</DialogTitle>
      </DialogHeader>
      <canvas ref="canvas" :width="SIZE" :height="SIZE" class="w-full rounded-md border" data-testid="quote-card" />
      <div class="flex gap-2" role="radiogroup" :aria-label="t.theme">
        <button v-for="(th, i) in THEMES" :key="i" type="button" role="radio" :aria-checked="theme === i" :aria-label="t.themes[i]" class="size-8 rounded-full border-2" :class="theme === i ? 'border-primary' : 'border-transparent'" :style="{ background: th.bg }" @click="theme = i" />
      </div>
      <DialogFooter class="gap-2">
        <Button v-if="canShare" variant="outline" @click="share">
          <Share2Icon />{{ t.shareImage }}
        </Button>
        <Button @click="download">
          <DownloadIcon />{{ t.download }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
