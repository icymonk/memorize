<script setup lang="ts">
import type { CardInput } from '#shared/schemas/card'
import type { CardField } from '#shared/schemas/deck'
import type { Card } from '../services/cards'
import type { Deck } from '../services/decks'
import { cardInput, DIFFICULTY, MAX_CARDS_PER_DECK } from '#shared/schemas/card'
import { ChevronDownIcon, Volume2Icon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import TagSuggest from '~/features/space/components/TagSuggest.vue'
import { useTags } from '~/features/space/composables/useTags'
import { ensureTags } from '~/features/space/services/tags'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'
import { useSpeech } from '../composables/useSpeech'
import { addCards, saveCard } from '../services/cards'

/** VOC-10: 카드 한 장 추가·수정 (단어장에서 고른 항목만 보여준다) */
const props = defineProps<{ deck: Deck, card?: Card | null, nextOrder: number, count: number }>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { default: false })

const t = ko.vocab.cards
const label = ko.vocab.cardFields
const space = useSpaceStore()
const { $firestore } = useNuxtApp()
const speech = useSpeech()
const auth = useAuthStore()
const spaceTags = useTags()

const empty = () => ({ front: '', back: '', reading: '', pos: '', phonetic: '', examples: '', forms: '', synonyms: '', antonyms: '', collocations: '', tip: '', tags: '', difficulty: '' })
const form = ref(empty())
const pending = ref(false)
const selectClass = 'border-input bg-background h-9 rounded-md border px-3 text-sm'
const has = (field: CardField) => props.deck.fields.includes(field)
/** 단어·뜻·발음이 기본, 나머지 항목은 접어 둔다 */
const EXTRA: CardField[] = ['pos', 'examples', 'forms', 'synonyms', 'antonyms', 'collocations', 'tip', 'tags', 'difficulty', 'image']
const hasExtras = computed(() => EXTRA.some(has))
const showMore = ref(false)
/** 일본어 단어장은 읽는 법(히라가나)을 기본으로 보여 준다 */
const showReading = computed(() => props.deck.langFrom === 'ja' || !!props.card?.reading)

const lines = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean)
const list = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean)
const opt = (s: string) => s.trim() || undefined

watch(open, (value) => {
  if (!value) return
  const c = props.card
  showMore.value = !!c && !!(c.pos || c.examples.length || c.forms || c.synonyms.length || c.antonyms.length || c.collocations.length || c.tip || c.tags.length || c.difficulty)
  form.value = c
    ? {
        front: c.front,
        back: c.back.join('\n'),
        reading: c.reading ?? '',
        pos: c.pos ?? '',
        phonetic: c.phonetic ?? '',
        examples: c.examples.map(e => e.translation ? `${e.text} | ${e.translation}` : e.text).join('\n'),
        forms: c.forms ?? '',
        synonyms: c.synonyms.map(s => s.text).join(', '),
        antonyms: c.antonyms.map(s => s.text).join(', '),
        collocations: c.collocations.join(', '),
        tip: c.tip ?? '',
        tags: c.tags.join(', '),
        difficulty: c.difficulty ?? '',
      }
    : empty()
})

function build(): CardInput | null {
  const f = form.value
  const parsed = cardInput.safeParse({
    front: f.front,
    back: lines(f.back),
    reading: opt(f.reading),
    pos: opt(f.pos),
    phonetic: opt(f.phonetic),
    audio: has('audio') ? { tts: true } : props.card?.audio,
    examples: lines(f.examples).map((l) => {
      const [text = '', ...rest] = l.split('|')
      const translation = rest.join('|').trim()
      return translation ? { text: text.trim(), translation } : { text: text.trim() }
    }),
    forms: opt(f.forms),
    synonyms: list(f.synonyms).map(text => ({ text })),
    antonyms: list(f.antonyms).map(text => ({ text })),
    collocations: list(f.collocations),
    imageFileId: props.card?.imageFileId,
    tip: opt(f.tip),
    tags: [...new Set(list(f.tags))],
    difficulty: f.difficulty || undefined,
  })
  return parsed.success ? parsed.data : null
}

async function submit() {
  const data = build()
  if (!data) {
    toast.error(ko.errors.invalidInput)
    return
  }
  if (!props.card && props.count >= MAX_CARDS_PER_DECK) {
    toast.error(t.tooMany(MAX_CARDS_PER_DECK))
    return
  }
  pending.value = true
  try {
    const sid = space.current!.id
    void ensureTags($firestore, sid, auth.user!.uid, data.tags ?? [], spaceTags.value)
    if (props.card) {
      await saveCard($firestore, sid, props.deck.id, { ...data, id: props.card.id, order: props.card.order, contentRev: props.card.contentRev })
      open.value = false
    }
    else {
      await addCards($firestore, sid, props.deck.id, [data], props.nextOrder)
      form.value = empty()
      document.getElementById('card-front')?.focus()
    }
    toast.success(t.saved)
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
    <DialogContent class="max-h-[90svh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ card ? t.edit : t.add }}</DialogTitle>
        <DialogDescription>{{ deck.title }}</DialogDescription>
      </DialogHeader>

      <form id="card-form" class="flex flex-col gap-4" @submit.prevent="submit">
        <div class="flex flex-col gap-2">
          <Label for="card-front">{{ t.front }}</Label>
          <div class="flex gap-2">
            <Input id="card-front" v-model="form.front" required maxlength="200" autofocus />
            <Button v-if="speech.supported" type="button" variant="outline" size="icon" :aria-label="t.speak" @click="speech.speak(form.reading.trim() || form.front, deck.langFrom)">
              <Volume2Icon />
            </Button>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <Label for="card-back">{{ t.back }}</Label>
          <Textarea id="card-back" v-model="form.back" rows="2" required />
          <p class="text-muted-foreground text-xs">
            {{ t.backHint }}
          </p>
        </div>

        <div v-if="showReading" class="flex flex-col gap-2">
          <Label for="card-reading">{{ label.reading }}</Label>
          <Input id="card-reading" v-model="form.reading" maxlength="100" lang="ja" />
          <p class="text-muted-foreground text-xs">
            {{ label.readingHint }}
          </p>
        </div>

        <div class="flex flex-col gap-2">
          <Label for="card-phonetic">{{ label.phonetic }}</Label>
          <Input id="card-phonetic" v-model="form.phonetic" maxlength="100" />
        </div>

        <button v-if="hasExtras" type="button" class="text-muted-foreground hover:text-foreground flex items-center gap-1 self-start text-sm" :aria-expanded="showMore" @click="showMore = !showMore">
          <ChevronDownIcon :class="['size-4 transition-transform', showMore && 'rotate-180']" />
          {{ showMore ? t.lessFields : t.moreFields }}
        </button>

        <template v-if="showMore">
        <div v-if="has('pos')" class="flex flex-col gap-2">
          <Label for="card-pos">{{ label.pos }}</Label>
          <Input id="card-pos" v-model="form.pos" maxlength="30" />
        </div>

        <div v-if="has('examples')" class="flex flex-col gap-2">
          <Label for="card-examples">{{ label.examples }}</Label>
          <Textarea id="card-examples" v-model="form.examples" rows="3" />
          <p class="text-muted-foreground text-xs">
            {{ t.examplesHint }}
          </p>
        </div>

        <div v-if="has('forms')" class="flex flex-col gap-2">
          <Label for="card-forms">{{ label.forms }}</Label>
          <Input id="card-forms" v-model="form.forms" maxlength="200" />
        </div>

        <div v-if="has('synonyms') || has('antonyms')" class="grid grid-cols-2 gap-3">
          <div v-if="has('synonyms')" class="flex flex-col gap-2">
            <Label for="card-synonyms">{{ label.synonyms }}</Label>
            <Input id="card-synonyms" v-model="form.synonyms" />
          </div>
          <div v-if="has('antonyms')" class="flex flex-col gap-2">
            <Label for="card-antonyms">{{ label.antonyms }}</Label>
            <Input id="card-antonyms" v-model="form.antonyms" />
          </div>
        </div>

        <div v-if="has('collocations')" class="flex flex-col gap-2">
          <Label for="card-collocations">{{ label.collocations }}</Label>
          <Input id="card-collocations" v-model="form.collocations" />
          <p class="text-muted-foreground text-xs">
            {{ t.listHint }}
          </p>
        </div>

        <div v-if="has('tip')" class="flex flex-col gap-2">
          <Label for="card-tip">{{ label.tip }}</Label>
          <Textarea id="card-tip" v-model="form.tip" rows="2" maxlength="500" />
        </div>

        <div v-if="has('tags') || has('difficulty')" class="grid grid-cols-2 gap-3">
          <div v-if="has('tags')" class="flex flex-col gap-2">
            <Label for="card-tags">{{ label.tags }}</Label>
            <Input id="card-tags" v-model="form.tags" />
            <TagSuggest v-model="form.tags" :tags="spaceTags" />
          </div>
          <div v-if="has('difficulty')" class="flex flex-col gap-2">
            <Label for="card-difficulty">{{ label.difficulty }}</Label>
            <select id="card-difficulty" v-model="form.difficulty" :class="selectClass">
              <option value="">
                {{ t.noDifficulty }}
              </option>
              <option v-for="d in DIFFICULTY" :key="d" :value="d">
                {{ t.difficulty[d] }}
              </option>
            </select>
          </div>
        </div>

        <p v-if="has('image')" class="text-muted-foreground text-xs">
          {{ label.image }}: {{ t.imageComingSoon }}
        </p>
        </template>
      </form>

      <DialogFooter>
        <Button variant="outline" type="button" @click="open = false">
          {{ ko.vocab.cancel }}
        </Button>
        <Button type="submit" form="card-form" :disabled="pending || !form.front.trim() || !form.back.trim()">
          {{ card ? t.save : t.addAnother }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
