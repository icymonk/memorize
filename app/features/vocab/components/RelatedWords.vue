<script setup lang="ts">
import type { Card } from '../services/cards'
import { ko } from '~/locales/ko'

/** VOC-10 유의어·반의어: 같은 단어장 카드와 연결된 것은 뜻을 함께 보여 준다 */
const props = defineProps<{ card: Card, cards: Card[] }>()
const label = ko.vocab.cardFields
const byId = computed(() => new Map(props.cards.map(c => [c.id, c])))
const rows = computed(() => (['synonyms', 'antonyms'] as const)
  .map(key => ({ key, items: (props.card[key] ?? []).map(r => ({ text: r.text, meaning: r.cardId ? byId.value.get(r.cardId)?.back[0] : undefined })) }))
  .filter(r => r.items.length))
</script>

<template>
  <div v-if="rows.length" class="text-muted-foreground flex flex-col gap-0.5">
    <span v-for="r in rows" :key="r.key">
      {{ label[r.key] }}:
      <template v-for="(it, i) in r.items" :key="i">
        <span v-if="i">, </span>
        <span :class="it.meaning && 'text-foreground underline decoration-dotted underline-offset-2'">{{ it.text }}</span>
        <span v-if="it.meaning"> ({{ it.meaning }})</span>
      </template>
    </span>
  </div>
</template>
