<script setup lang="ts">
import type { CardInput } from '#shared/schemas/card'
import type { CardSeparator, TermSeparator } from '#shared/paste'
import type { Deck } from '../services/decks'
import { detectTermSeparator, parsePaste } from '#shared/paste'
import { cardInput, MAX_CARDS_PER_DECK } from '#shared/schemas/card'
import { toast } from 'vue-sonner'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'
import { addCards } from '../services/cards'

/** VOC-11: 붙여넣기로 한꺼번에 입력 → 미리보기 후 저장 */
const props = defineProps<{ deck: Deck, nextOrder: number, count: number }>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { default: false })

const t = ko.vocab.pasteDialog
const space = useSpaceStore()
const { $firestore } = useNuxtApp()

const text = ref('')
const termMode = ref<'auto' | 'tab' | 'comma' | 'dash' | 'custom'>('auto')
const custom = ref('')
const cardSep = ref<CardSeparator>('newline')
const pending = ref(false)
const selectClass = 'border-input bg-background h-9 rounded-md border px-3 text-sm'
const PREVIEW = 50

watch(open, (value) => {
  if (value) text.value = ''
})

const termSep = computed<TermSeparator>(() =>
  termMode.value === 'auto' ? detectTermSeparator(text.value) : termMode.value === 'custom' ? { custom: custom.value } : termMode.value)

const rows = computed(() => parsePaste(text.value, termSep.value, cardSep.value).map((row) => {
  if (row.error) return { ...row, card: null as CardInput | null }
  const parsed = cardInput.safeParse({ front: row.front, back: row.back })
  return { ...row, card: parsed.success ? parsed.data : null, error: parsed.success ? undefined : 'invalid' as const }
}))
const valid = computed(() => rows.value.flatMap(r => r.card ? [r.card] : []))

async function submit() {
  if (!valid.value.length) return
  if (props.count + valid.value.length > MAX_CARDS_PER_DECK) {
    toast.error(ko.vocab.cards.tooMany(MAX_CARDS_PER_DECK))
    return
  }
  pending.value = true
  try {
    await addCards($firestore, space.current!.id, props.deck.id, valid.value, props.nextOrder)
    toast.success(ko.vocab.cards.added(valid.value.length))
    open.value = false
    emit('saved')
  }
  catch (error) {
    toast.error(errorMessage(error) ?? ko.errors.unknown)
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ ko.vocab.cards.paste }}</DialogTitle>
        <DialogDescription>{{ t.description }}</DialogDescription>
      </DialogHeader>

      <div class="flex flex-col gap-4">
        <Textarea v-model="text" rows="8" class="font-mono text-sm" :placeholder="t.placeholder.replaceAll('\\t', '\t').replaceAll('\\n', '\n')" />

        <div class="flex flex-wrap gap-4">
          <div class="flex flex-col gap-2">
            <Label for="paste-term">{{ t.termSep }}</Label>
            <div class="flex gap-2">
              <select id="paste-term" v-model="termMode" :class="selectClass">
                <option v-for="m in (['auto', 'tab', 'comma', 'dash', 'custom'] as const)" :key="m" :value="m">
                  {{ t[m] }}
                </option>
              </select>
              <Input v-if="termMode === 'custom'" v-model="custom" class="w-28" maxlength="5" :placeholder="t.customPlaceholder" />
            </div>
          </div>
          <div class="flex flex-col gap-2">
            <Label for="paste-card">{{ t.cardSep }}</Label>
            <select id="paste-card" v-model="cardSep" :class="selectClass">
              <option value="newline">
                {{ t.newline }}
              </option>
              <option value="semicolon">
                {{ t.semicolon }}
              </option>
            </select>
          </div>
        </div>

        <div v-if="rows.length" class="flex flex-col gap-2">
          <p class="text-sm font-medium">
            {{ t.preview }} · <span class="text-muted-foreground font-normal">{{ t.summary(valid.length, rows.length - valid.length) }}</span>
          </p>
          <div class="max-h-64 overflow-y-auto rounded-md border">
            <table class="w-full text-sm">
              <tbody>
                <tr v-for="row in rows.slice(0, PREVIEW)" :key="row.line" class="border-b last:border-0" :class="row.error && 'text-muted-foreground'">
                  <td class="text-muted-foreground w-10 px-2 py-1.5 text-right tabular-nums">
                    {{ row.line }}
                  </td>
                  <td class="px-2 py-1.5 font-medium">
                    {{ row.front }}
                  </td>
                  <td class="px-2 py-1.5">
                    <span v-if="row.error" class="text-destructive">{{ t.errors[row.error] }}</span>
                    <span v-else>{{ row.back.join(' / ') }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-if="rows.length > PREVIEW" class="text-muted-foreground px-2 py-1.5 text-xs">
              {{ t.more(rows.length - PREVIEW) }}
            </p>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" type="button" @click="open = false">
          {{ ko.vocab.cancel }}
        </Button>
        <Button :disabled="pending || !valid.length" @click="submit">
          {{ t.submit(valid.length) }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
