<script setup lang="ts">
import type { SpaceColor } from '#shared/schemas/space'
import { cn } from '~/lib/utils'
import { SPACE_COLOR_CLASS } from '../colors'

const props = defineProps<{ icon: string, color: SpaceColor | null, class?: string }>()
</script>

<template>
  <span :class="cn('flex size-8 shrink-0 items-center justify-center rounded-lg text-base', props.color ? SPACE_COLOR_CLASS[props.color] : 'bg-muted', props.class)">
    {{ props.icon }}
  </span>
</template>
