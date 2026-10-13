<script setup lang="ts">
import type { CardField, DeckInput } from '#shared/schemas/deck'
import type { Deck, DeckFolder } from '../services/decks'
import type { Member } from '~/features/space/services/invites'
import { CARD_FIELDS, deckInput, EDIT_POLICY, LANGS } from '#shared/schemas/deck'
import { toast } from 'vue-sonner'
import TagSuggest from '~/features/space/components/TagSuggest.vue'
import { useTags } from '~/features/space/composables/useTags'
import { ensureTags } from '~/features/space/services/tags'
import { errorMessage } from '~/lib/errors'
import { cn } from '~/lib/utils'
import { ko } from '~/locales/ko'
import { createDeck, updateDeck } from '../services/decks'

/** VOC-01·02: 단어장 만들기·설정 */
const props = defineProps<{ deck?: Deck | null, folders: DeckFolder[], members: Member[] }>()
const emit = defineEmits<{ saved: [deckId: string] }>()
const open = defineModel<boolean>('open', { default: false })

const t = ko.vocab
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()

const form = ref<DeckInput>(deckInput.parse({ title: '-' }))
const tagsText = ref('')
const spaceTags = useTags()
const pending = ref(false)

const isPersonal = computed(() => space.current?.kind === 'personal')
const isAuthor = computed(() => !props.deck || props.deck.createdBy === auth.user?.uid)
const others = computed(() => props.members.filter(m => m.status === 'active' && m.uid !== auth.user?.uid))
const selectClass = 'border-input bg-background h-9 rounded-md border px-3 text-sm'
const folderSel = computed({
  get: () => form.value.folderId ?? '',
  set: (v: string) => { form.value.folderId = v || null },
})

watch(open, (value) => {
  if (!value) return
  const base = deckInput.parse(props.deck ? { ...props.deck } : { title: '-', visibility: isPersonal.value ? 'private' : 'space' })
  form.value = { ...base, title: props.deck?.title ?? '' }
  tagsText.value = base.tags.join(', ')
})

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter(x => x !== item) : [...list, item]
}
function toggleField(field: CardField) {
  form.value.fields = CARD_FIELDS.filter(f => toggle(form.value.fields, field).includes(f))
}

async function submit() {
  const tags = [...new Set(tagsText.value.split(',').map(s => s.trim()).filter(Boolean))]
  const parsed = deckInput.safeParse({ ...form.value, tags })
  if (!parsed.success) {
    toast.error(ko.errors.invalidInput)
    return
  }
  const data = parsed.data
  if (data.editPolicy !== 'collaborators') data.collaboratorIds = []
  pending.value = true
  try {
    const sid = space.current!.id
    void ensureTags($firestore, sid, auth.user!.uid, data.tags, spaceTags.value)
    let id: string
    if (props.deck) {
      const patch: Partial<DeckInput> = { ...data }
      if (!isAuthor.value) {
        delete patch.visibility
        delete patch.groupIds
        delete patch.editPolicy
        delete patch.collaboratorIds
      }
      await updateDeck($firestore, sid, props.deck.id, patch)
      id = props.deck.id
      toast.success(t.saved)
    }
    else {
      id = await createDeck($firestore, sid, auth.user!.uid, data)
      toast.success(t.created(data.title))
    }
    open.value = false
    emit('saved', id)
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
        <DialogTitle>{{ deck ? t.edit : t.create }}</DialogTitle>
        <DialogDescription v-if="!deck">
          {{ t.createDescription }}
        </DialogDescription>
      </DialogHeader>

      <form id="deck-form" class="flex flex-col gap-5" @submit.prevent="submit">
        <div class="flex flex-col gap-2">
          <Label for="deck-title">{{ t.fields.title }}</Label>
          <Input id="deck-title" v-model="form.title" required maxlength="80" :placeholder="t.fields.titlePlaceholder" />
        </div>

        <div class="flex flex-col gap-2">
          <Label for="deck-description">{{ t.fields.description }}</Label>
          <Textarea id="deck-description" v-model="form.description" maxlength="500" rows="2" />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-2">
            <Label for="deck-lang-from">{{ t.fields.langFrom }}</Label>
            <select id="deck-lang-from" v-model="form.langFrom" :class="selectClass">
              <option v-for="lang in LANGS" :key="lang" :value="lang">
                {{ t.langs[lang] }}
              </option>
            </select>
          </div>
          <div class="flex flex-col gap-2">
            <Label for="deck-lang-to">{{ t.fields.langTo }}</Label>
            <select id="deck-lang-to" v-model="form.langTo" :class="selectClass">
              <option v-for="lang in LANGS" :key="lang" :value="lang">
                {{ t.langs[lang] }}
              </option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-2">
            <Label for="deck-tags">{{ t.fields.tags }}</Label>
            <Input id="deck-tags" v-model="tagsText" maxlength="230" />
            <TagSuggest v-model="tagsText" :tags="spaceTags" />
            <p class="text-muted-foreground text-xs">
              {{ t.fields.tagsHint }}
            </p>
          </div>
          <div class="flex flex-col gap-2">
            <Label for="deck-folder">{{ t.fields.folder }}</Label>
            <select id="deck-folder" v-model="folderSel" :class="selectClass">
              <option value="">
                {{ t.fields.noFolder }}
              </option>
              <option v-for="folder in folders" :key="folder.id" :value="folder.id">
                {{ folder.name }}
              </option>
            </select>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <Label>{{ t.fields.cardFields }}</Label>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="field in CARD_FIELDS"
              :key="field"
              type="button"
              :aria-pressed="form.fields.includes(field)"
              :class="cn('rounded-full border px-3 py-1 text-sm', form.fields.includes(field) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')"
              @click="toggleField(field)"
            >
              {{ t.cardFields[field] }}
            </button>
          </div>
          <p class="text-muted-foreground text-xs">
            {{ t.fields.cardFieldsHint }}
          </p>
        </div>

        <template v-if="!isPersonal">
          <div class="flex flex-col gap-2">
            <Label>{{ t.fields.visibility }}</Label>
            <RadioGroup v-model="form.visibility" :disabled="!isAuthor" class="flex flex-wrap gap-4">
              <div v-for="(label, value) in t.visibility" :key="value" class="flex items-center gap-2">
                <RadioGroupItem :id="`deck-vis-${value}`" :value="value" :disabled="value === 'group'" />
                <Label :for="`deck-vis-${value}`" class="font-normal">{{ label }}</Label>
              </div>
            </RadioGroup>
            <p class="text-muted-foreground text-xs">
              {{ t.groupComingSoon }}
            </p>
          </div>

          <div class="flex flex-col gap-2">
            <Label>{{ t.fields.editPolicy }}</Label>
            <RadioGroup v-model="form.editPolicy" :disabled="!isAuthor" class="flex flex-wrap gap-4">
              <div v-for="value in EDIT_POLICY" :key="value" class="flex items-center gap-2">
                <RadioGroupItem :id="`deck-edit-${value}`" :value="value" />
                <Label :for="`deck-edit-${value}`" class="font-normal">{{ t.editPolicy[value] }}</Label>
              </div>
            </RadioGroup>
          </div>

          <div v-if="form.editPolicy === 'collaborators'" class="flex flex-col gap-2">
            <Label>{{ t.fields.collaborators }}</Label>
            <div class="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border p-2">
              <label v-for="m in others" :key="m.uid" class="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  :checked="form.collaboratorIds.includes(m.uid)"
                  :disabled="!isAuthor"
                  @change="form.collaboratorIds = toggle(form.collaboratorIds, m.uid)"
                >
                {{ m.displayName }}
              </label>
            </div>
          </div>
        </template>
      </form>

      <DialogFooter>
        <Button variant="outline" type="button" @click="open = false">
          {{ t.cancel }}
        </Button>
        <Button type="submit" form="deck-form" :disabled="pending || !form.title.trim()">
          {{ deck ? t.save : t.create }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
