<script setup lang="ts">
import type { Member } from '~/features/space/services/invites'
import type { Deck, DeckFolder } from '~/features/vocab/services/decks'
import { canDeleteContent, canEditContent } from '#shared/permissions'
import { ArrowLeftIcon, PencilIcon, Trash2Icon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { listMembers } from '~/features/space/services/invites'
import DeckFormDialog from '~/features/vocab/components/DeckFormDialog.vue'
import { deleteDeck, getDeck, listFolders } from '~/features/vocab/services/decks'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'

const t = ko.vocab
const space = useSpaceStore()
const auth = useAuthStore()
const route = useRoute()
const { $firestore } = useNuxtApp()

const sid = computed(() => space.current!.id)
const uid = computed(() => auth.user!.uid)
const deckId = computed(() => route.params.deckId as string)

const deck = ref<Deck | null>(null)
const folders = ref<DeckFolder[]>([])
const members = ref<Member[]>([])
const loading = ref(true)
const missing = ref(false)
const editOpen = ref(false)

const canEdit = computed(() => !!deck.value && canEditContent(deck.value, uid.value))
const canDelete = computed(() => !!deck.value && space.current && canDeleteContent({ kind: space.current.kind, settings: space.current.settings, member: space.membership }, deck.value, uid.value))
const author = computed(() => members.value.find(m => m.uid === deck.value?.createdBy)?.displayName)
const folderName = computed(() => folders.value.find(f => f.id === deck.value?.folderId)?.name)

async function load() {
  loading.value = true
  try {
    const [d, f, m] = await Promise.all([getDeck($firestore, sid.value, deckId.value), listFolders($firestore, sid.value), listMembers($firestore, sid.value)])
    deck.value = d
    folders.value = f
    members.value = m
    missing.value = !d
  }
  catch {
    missing.value = true
  }
  finally {
    loading.value = false
  }
}
onMounted(load)
watch(deckId, load)

async function remove() {
  if (!deck.value || !window.confirm(t.deleteConfirm(deck.value.title))) return
  try {
    await deleteDeck($firestore, sid.value, deck.value.id)
    toast.success(t.deleted)
    await navigateTo(`/s/${sid.value}/decks`)
  }
  catch (error) {
    toast.error(errorMessage(error) ?? ko.errors.unknown)
  }
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
    <NuxtLink :to="`/s/${sid}/decks`" class="text-muted-foreground flex items-center gap-1 text-sm hover:underline">
      <ArrowLeftIcon class="size-4" />{{ t.title }}
    </NuxtLink>

    <Skeleton v-if="loading" class="h-40 rounded-xl" />
    <p v-else-if="missing || !deck" class="text-muted-foreground py-10 text-center text-sm">
      {{ ko.errors.notFound }}
    </p>
    <template v-else>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex flex-col gap-1">
          <h1 class="text-2xl font-semibold">
            {{ deck.title }}
          </h1>
          <div class="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-sm">
            <span>{{ t.langs[deck.langFrom] }} → {{ t.langs[deck.langTo] }}</span>
            <span>{{ t.cardCount(deck.cardCount) }}</span>
            <span v-if="space.current?.kind === 'workspace'">{{ t.learnerCount(deck.learnerCount) }}</span>
            <span v-if="space.current?.kind === 'workspace' && author">{{ t.by(author) }}</span>
            <span v-if="folderName">{{ folderName }}</span>
          </div>
        </div>
        <div class="flex gap-2">
          <Button v-if="canEdit" variant="outline" size="sm" @click="editOpen = true">
            <PencilIcon />{{ t.edit }}
          </Button>
          <Button v-if="canDelete" variant="outline" size="sm" class="text-destructive" @click="remove">
            <Trash2Icon />{{ t.delete }}
          </Button>
        </div>
      </div>

      <p v-if="deck.description" class="whitespace-pre-line">
        {{ deck.description }}
      </p>
      <div class="flex flex-wrap gap-1.5">
        <Badge v-if="space.current?.kind === 'workspace'" variant="secondary">
          {{ t.fields.visibility }}: {{ t.visibility[deck.visibility] }}
        </Badge>
        <Badge v-if="space.current?.kind === 'workspace'" variant="secondary">
          {{ t.fields.editPolicy }}: {{ t.editPolicy[deck.editPolicy] }}
        </Badge>
        <Badge v-for="tag in deck.tags" :key="tag" variant="outline">
          #{{ tag }}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardDescription>{{ t.cardsComingSoon }}</CardDescription>
        </CardHeader>
      </Card>

      <DeckFormDialog v-model:open="editOpen" :deck="deck" :folders="folders" :members="members" @saved="load" />
    </template>
  </div>
</template>
