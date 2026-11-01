<script setup lang="ts">
import type { ScheduleItem } from '#shared/reading-groups'
import { evenSchedule } from '#shared/reading-groups'
import { PlusIcon, Trash2Icon } from '@lucide/vue'
import { ko } from '~/locales/ko'

/** READ-45 챕터 일정: 직접 입력 또는 기간에 맞춰 균등 분배 */
const items = defineModel<ScheduleItem[]>({ required: true })
const props = defineProps<{ startAt: string, endAt: string, unit: string }>()
const t = ko.reading.groups
const unitLabel = computed(() => ko.reading.log.units[props.unit] ?? '')
const evenFrom = ref<number | null>(1)
const evenTo = ref<number | null>(null)
const num = (v: string | number) => (v === '' || v == null ? null : Math.max(0, Math.round(Number(v))))

function even() {
  if (evenFrom.value == null || evenTo.value == null) return
  items.value = evenSchedule(props.startAt, props.endAt, evenFrom.value, evenTo.value)
}
function add() {
  const last = items.value.at(-1)
  items.value = [...items.value, { id: `s${Date.now().toString(36)}`, label: `${items.value.length + 1}주차`, from: last?.to != null ? last.to + 1 : null, to: null, dueDate: props.endAt }]
}
const patch = (i: number, p: Partial<ScheduleItem>) => (items.value = items.value.map((x, j) => (j === i ? { ...x, ...p } : x)))
const remove = (i: number) => (items.value = items.value.filter((_, j) => j !== i))
</script>

<template>
  <div class="flex flex-col gap-2" data-testid="schedule-editor">
    <p class="text-muted-foreground text-xs">
      {{ t.scheduleHint }}
    </p>
    <div class="flex flex-wrap items-center gap-2">
      <Input type="number" min="0" class="w-20" :aria-label="t.evenFrom" :model-value="evenFrom ?? undefined" @update:model-value="v => evenFrom = num(v)" />
      <span class="text-sm">~</span>
      <Input type="number" min="0" class="w-20" :aria-label="t.evenTo" :model-value="evenTo ?? undefined" @update:model-value="v => evenTo = num(v)" />
      <span class="text-sm">{{ unitLabel }}</span>
      <Button type="button" size="sm" variant="outline" :disabled="evenFrom == null || evenTo == null" @click="even">
        {{ t.even }}
      </Button>
    </div>
    <ul class="flex flex-col gap-2">
      <li v-for="(s, i) in items" :key="s.id" class="flex flex-wrap items-center gap-2" data-testid="schedule-row">
        <Input class="w-24" maxlength="40" :aria-label="t.label" :model-value="s.label" @update:model-value="v => patch(i, { label: String(v) })" />
        <Input type="number" min="0" class="w-20" :aria-label="t.from" :model-value="s.from ?? undefined" @update:model-value="v => patch(i, { from: num(v) })" />
        <span class="text-sm">~</span>
        <Input type="number" min="0" class="w-20" :aria-label="t.to" :model-value="s.to ?? undefined" @update:model-value="v => patch(i, { to: num(v) })" />
        <Input type="date" class="w-40" :aria-label="t.due" :model-value="s.dueDate" @update:model-value="v => patch(i, { dueDate: String(v) })" />
        <Button type="button" variant="ghost" size="icon" class="size-8" :aria-label="t.removeRow" @click="remove(i)">
          <Trash2Icon />
        </Button>
      </li>
    </ul>
    <Button type="button" size="sm" variant="ghost" class="self-start" @click="add">
      <PlusIcon />{{ t.addRow }}
    </Button>
  </div>
</template>
