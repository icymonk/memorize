<script setup lang="ts">
/** VOC-10: 단어 위에 읽는 법(후리가나)을 작게 붙인다 */
defineProps<{ front: string, reading?: string }>()
</script>

<template>
  <ruby v-if="reading && reading !== front">{{ front }}<rp>(</rp><rt class="text-muted-foreground text-[0.45em] font-normal">{{ reading }}</rt><rp>)</rp></ruby>
  <span v-else>{{ front }}</span>
</template>
