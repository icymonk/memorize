<script setup lang="ts">
import type { GenKind } from '#shared/question-gen'
import type { Deck } from '~/features/vocab/services/decks'
import { GEN_KINDS, generateQuestions } from '#shared/question-gen'
import { shuffle } from '#shared/study'
import { toast } from 'vue-sonner'
import { listCards } from '~/features/vocab/services/cards'
import { listDecks } from '~/features/vocab/services/decks'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'
import { saveQuestions } from '../services/questions'

/** TST-03 단어장에서 문제 만들기 */
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { default: false })

const t = ko.tests
const g = t.gen
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const personal = computed(() => space.current?.kind === 'personal')
const MAX_CARDS = 100

const decks = ref<Deck[]>([])
const deckId = ref('')
const cards = ref<{ front: string, back: string[] }[]>([])
const kinds = ref<GenKind[]>(['meaningToWord', 'wordShort'])
const count = ref(20)
const points = ref(10)
const share = ref(false)
const reveal = ref(false)
const loading = ref(false)
const saving = ref(false)

const deck = computed(() => decks.value.find(d => d.id === deckId.value))
const max = computed(() => Math.min(cards.value.length, MAX_CARDS))
const picked = computed(() => Math.max(0, Math.min(Math.floor(count.value || 0), max.value)))
const estimate = computed(() => picked.value * kinds.value.filter(k => cards.value.length > 1 || k === 'meaningShort' || k === 'wordShort').length)

watch(open, async (v) => {
  if (!v) return
  deckId.value = ''
  cards.value = []
  share.value = false
  reveal.value = false
  try {
    decks.value = await listDecks($firestore, space.current!.id, auth.user!.uid, space.membership?.groupIds ?? [])
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
})

async function pick(id: string) {
  deckId.value = id
  cards.value = []
  loading.value = true
  try {
    cards.value = (await listCards($firestore, space.current!.id, id)).map(c => ({ front: c.front, back: c.back }))
    count.value = Math.min(cards.value.length, 20)
  }
  catch {
    toast.error(g.loadCardsFailed)
  }
  finally {
    loading.value = false
  }
}

function toggleKind(k: GenKind) {
  kinds.value = kinds.value.includes(k) ? kinds.value.filter(x => x !== k) : [...kinds.value, k]
}

async function submit() {
  if (!deck.value || !kinds.value.length || !picked.value) return
  const chosen = shuffle(cards.value).slice(0, picked.value)
  const items = generateQuestions(chosen, cards.value, {
    kinds: GEN_KINDS.filter(k => kinds.value.includes(k)),
    prompts: g.prompt,
    base: {
      tags: [deck.value.title.slice(0, 20)],
      defaultPoints: Math.min(100, Math.max(1, Math.floor(points.value || 10))),
      sharing: !personal.value && share.value ? 'space' : 'private',
      answerVisibility: !personal.value && reveal.value ? 'space' : 'authors',
    },
  })
  if (!items.length) {
    toast.error(g.none)
    return
  }
  saving.value = true
  try {
    const n = await saveQuestions($firestore, space.current!.id, auth.user!.uid, items)
    toast.success(g.done(n))
    open.value = false
    emit('saved')
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90svh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ g.title }}</DialogTitle>
        <DialogDescription>{{ g.description }}</DialogDescription>
      </DialogHeader>
      <form class="flex flex-col gap-4" @submit.prevent="submit">
        <div class="flex flex-col gap-2">
          <Label>{{ g.deck }}</Label>
          <p v-if="!decks.length" class="text-muted-foreground text-sm">{{ g.noDecks }}</p>
          <div v-else class="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
            <Button v-for="d in decks" :key="d.id" type="button" size="sm" :variant="deckId === d.id ? 'default' : 'outline'" @click="pick(d.id)">
              {{ d.title }}
            </Button>
          </div>
        </div>
        <template v-if="deck && !loading">
          <div class="flex flex-col gap-2">
            <Label>{{ g.kinds }}</Label>
            <label v-for="k in GEN_KINDS" :key="k" class="flex items-center gap-2 text-sm">
              <Switch :model-value="kinds.includes(k)" @update:model-value="toggleKind(k)" /> {{ g.kind[k] }}
            </label>
            <p v-if="cards.length < 2" class="text-muted-foreground text-xs">{{ g.choiceNote }}</p>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-2">
              <Label for="gen-count">{{ g.count }}</Label>
              <Input id="gen-count" v-model.number="count" type="number" min="1" :max="max" />
            </div>
            <div class="flex flex-col gap-2">
              <Label for="gen-points">{{ t.fields.points }}</Label>
              <Input id="gen-points" v-model.number="points" type="number" min="1" max="100" />
            </div>
          </div>
          <p class="text-muted-foreground text-xs">{{ g.countHint(cards.length) }}</p>
          <template v-if="!personal">
            <label class="flex items-start gap-3 text-sm">
              <Switch v-model="share" />
              <span class="flex flex-col"><span>{{ t.fields.share }}</span><span class="text-muted-foreground text-xs">{{ t.fields.shareHint }}</span></span>
            </label>
            <label class="flex items-start gap-3 text-sm">
              <Switch v-model="reveal" />
              <span class="flex flex-col"><span>{{ t.fields.revealAnswer }}</span><span class="text-muted-foreground text-xs">{{ t.fields.revealHint }}</span></span>
            </label>
          </template>
        </template>
        <DialogFooter class="items-center gap-2">
          <span v-if="deck && estimate" class="text-muted-foreground text-sm">{{ g.preview(estimate) }}</span>
          <Button type="submit" :disabled="saving || loading || !deck || !estimate">{{ g.submit }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
