<script setup lang="ts">
import type { Activity } from '../services/activities'
import { ko } from '~/locales/ko'

/** CMN-10: 큰 활동은 카드처럼, 작은 활동은 한 줄로 */
const props = defineProps<{ sid: string, items: Activity[], names: Record<string, string> }>()
const t = ko.home.feed

function text(a: Activity) {
  const name = props.names[a.uid] ?? t.someone
  if (a.type === 'deckCreated') return t.deckCreated(name, a.data.title ?? '')
  if (a.type === 'journal') return t.journal(name)
  if (a.type === 'session') return t.session(name, a.data.title ?? '', a.data.cards ?? 0, ko.vocab.study.modes[a.data.mode] ?? '')
  return name
}
function link(a: Activity) {
  if (!a.refId) return null
  if (a.refType === 'deck') return `/s/${props.sid}/decks/${a.refId}`
  if (a.refType === 'page') return `/s/${props.sid}/notes/${a.refId}`
  return null
}
const when = (a: Activity) => a.createdAt?.toDate().toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) ?? ''
</script>

<template>
  <ul class="flex flex-col gap-1">
    <li v-for="a in items" :key="a.id">
      <component
        :is="link(a) ? 'NuxtLink' : 'div'"
        :to="link(a) ?? undefined"
        class="hover:bg-muted/60 flex items-baseline gap-2 rounded-md px-2"
        :class="a.size === 'major' ? 'bg-muted/40 border py-3 font-medium' : 'py-1.5 text-sm'"
      >
        <span class="min-w-0 flex-1">{{ text(a) }}</span>
        <span class="text-muted-foreground shrink-0 text-xs">{{ when(a) }}</span>
      </component>
    </li>
  </ul>
</template>
