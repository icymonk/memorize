<script setup lang="ts">
import { loopTarget, PLAYBACK_RATES } from '#shared/schemas/course'
import { ko } from '~/locales/ko'

/** CRS-12·13 오디오·영상: 속도 0.5~2배, 10초 앞/뒤, A-B 구간 반복 */
defineProps<{ src: string, kind: 'audio' | 'video', label: string }>()
const t = ko.courses.lesson.player
const el = ref<HTMLMediaElement>()
const rate = ref(1)
const a = ref<number | null>(null)
const b = ref<number | null>(null)

watch(rate, (r) => {
  if (el.value) el.value.playbackRate = r
})
const applyRate = () => {
  if (el.value) el.value.playbackRate = rate.value
}
function skip(s: number) {
  if (el.value) el.value.currentTime = Math.max(0, el.value.currentTime + s)
}
function mark(which: 'a' | 'b') {
  const now = el.value?.currentTime ?? 0
  if (which === 'a') {
    a.value = now
    if (b.value != null && b.value <= now) b.value = null
  }
  else if (a.value != null && now > a.value) {
    b.value = now
  }
}
function clear() {
  a.value = null
  b.value = null
}
function onTime() {
  const to = el.value ? loopTarget(el.value.currentTime, a.value, b.value) : null
  if (to != null) el.value!.currentTime = to
}
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
</script>

<template>
  <div class="flex flex-col gap-2">
    <video v-if="kind === 'video'" ref="el" :src="src" controls preload="metadata" class="max-h-[60svh] w-full rounded-md bg-black" :aria-label="label" @timeupdate="onTime" @loadedmetadata="applyRate" />
    <audio v-else ref="el" :src="src" controls preload="metadata" class="w-full" :aria-label="label" @timeupdate="onTime" @loadedmetadata="applyRate" />
    <div class="flex flex-wrap items-center gap-1 text-xs">
      <select v-model.number="rate" :aria-label="t.rate" class="border-input bg-background h-8 rounded-md border px-2">
        <option v-for="r in PLAYBACK_RATES" :key="r" :value="r">{{ r }}×</option>
      </select>
      <Button type="button" variant="ghost" size="sm" @click="skip(-10)">{{ t.back10 }}</Button>
      <Button type="button" variant="ghost" size="sm" @click="skip(10)">{{ t.fwd10 }}</Button>
      <Button type="button" :variant="a != null ? 'secondary' : 'ghost'" size="sm" @click="mark('a')">{{ t.setA }}</Button>
      <Button type="button" :variant="b != null ? 'secondary' : 'ghost'" size="sm" :disabled="a == null" @click="mark('b')">{{ t.setB }}</Button>
      <Button v-if="a != null" type="button" variant="ghost" size="sm" @click="clear">{{ t.clearAB }}</Button>
      <span v-if="a != null && b != null" class="text-muted-foreground">{{ t.loop(fmt(a), fmt(b)) }}</span>
    </div>
  </div>
</template>
