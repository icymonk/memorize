<script setup lang="ts">
import type { Stamp } from '#shared/schemas/feedback'
import type { Member } from '~/features/space/services/invites'
import type { Comment } from '../services/comments'
import type { Page } from '../services/pages'
import { STAMP_LABELS, STAMPS } from '#shared/schemas/feedback'
import { toast } from 'vue-sonner'
import { listMembers } from '~/features/space/services/invites'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'
import { removeComment, watchPageComments } from '../services/comments'
import { leaveFeedback, setReviewers } from '../services/feedback'

/** CMN-23~25: 작성자는 피드백을 부탁할 멤버를 고르고, 부탁받은 멤버는 스탬프와 총평을 남긴다 */
const props = defineProps<{ sid: string, page: Page }>()
const emit = defineEmits<{ saved: [Partial<Page>] }>()
const t = ko.notes.feedback
const auth = useAuthStore()
const space = useSpaceStore()
const { $firestore, $functions } = useNuxtApp()
const list = ref<Comment[]>([])
const members = ref<Member[]>([])
const pending = ref(false)
const picking = ref(false)
const picked = ref<string[]>([])
const writing = ref(false)
const stamp = ref<Stamp>('great')
const body = ref('')
let stop: (() => void) | undefined

onMounted(async () => {
  stop = watchPageComments($firestore, props.sid, props.page.id, (all) => { list.value = all.filter(c => c.kind === 'feedback') }, () => {})
  try { members.value = (await listMembers($firestore, props.sid)).filter(m => m.status === 'active') }
  catch { members.value = [] }
})
onBeforeUnmount(() => stop?.())

const me = computed(() => auth.user?.uid)
const isOwner = computed(() => props.page.ownerId === me.value)
const reviewers = computed(() => props.page.reviewerIds ?? [])
const canGive = computed(() => !isOwner.value && !!me.value && reviewers.value.includes(me.value))
const mine = computed(() => list.value.find(c => c.uid === me.value))
const others = computed(() => members.value.filter(m => m.uid !== props.page.ownerId))
const nameOf = (uid: string) => members.value.find(m => m.uid === uid)?.displayName || ko.notes.comments.someone
const show = computed(() => isOwner.value || canGive.value || list.value.length > 0)

async function run(fn: () => Promise<void>) {
  pending.value = true
  try { await fn() }
  catch (error) { toast.error(errorMessage(error) ?? ko.errors.unknown) }
  finally { pending.value = false }
}
function startPick() {
  picked.value = [...reviewers.value]
  picking.value = true
}
const togglePick = (uid: string) => { picked.value = picked.value.includes(uid) ? picked.value.filter(x => x !== uid) : [...picked.value, uid] }
const saveReviewers = () => run(async () => {
  await setReviewers($firestore, props.sid, props.page.id, picked.value)
  emit('saved', { reviewerIds: picked.value })
  picking.value = false
  toast.success(t.saved)
})
function startWrite() {
  stamp.value = mine.value?.stamp ?? 'great'
  body.value = mine.value?.body ?? ''
  writing.value = true
}
const submit = () => run(async () => {
  await leaveFeedback($functions, props.sid, props.page.id, stamp.value, body.value.trim().slice(0, 2000))
  writing.value = false
  toast.success(t.sent)
})
const remove = (c: Comment) => run(async () => {
  if (await confirmDialog(t.removeConfirm)) await removeComment($firestore, props.sid, c.id)
})
</script>

<template>
  <section v-if="show" class="mt-6 flex flex-col gap-3 border-t pt-4" :aria-label="t.title">
    <div class="flex items-center gap-2">
      <h2 class="text-sm font-semibold">
        {{ t.title }} <span class="text-muted-foreground font-normal">{{ list.length || '' }}</span>
      </h2>
      <span v-if="reviewers.length" class="text-muted-foreground text-xs">{{ t.requested(reviewers.map(nameOf).join(', ')) }}</span>
      <span class="ml-auto flex gap-1">
        <Button v-if="isOwner && !picking" variant="outline" size="sm" class="h-7 text-xs" @click="startPick">{{ t.request }}</Button>
        <Button v-if="canGive && !writing" size="sm" class="h-7 text-xs" @click="startWrite">{{ mine ? t.edit : t.leave }}</Button>
      </span>
    </div>

    <div v-if="picking" class="bg-muted/40 flex flex-col gap-2 rounded-md border p-3">
      <p class="text-sm font-medium">{{ t.requestTitle }}</p>
      <p class="text-muted-foreground text-xs">{{ t.requestHint }}</p>
      <p v-if="!others.length" class="text-muted-foreground text-sm">{{ t.noMembers }}</p>
      <label v-for="m in others" :key="m.uid" class="flex items-center gap-2 text-sm">
        <input type="checkbox" :checked="picked.includes(m.uid)" @change="togglePick(m.uid)">
        {{ m.displayName }}
      </label>
      <div class="flex gap-2">
        <Button size="sm" :disabled="pending" @click="saveReviewers">{{ ko.vocab.save }}</Button>
        <Button size="sm" variant="outline" @click="picking = false">{{ t.cancel }}</Button>
      </div>
    </div>

    <form v-if="writing" class="bg-muted/40 flex flex-col gap-2 rounded-md border p-3" @submit.prevent="submit">
      <span class="text-sm font-medium">{{ t.stamp }}</span>
      <div class="flex flex-wrap gap-2" role="radiogroup" :aria-label="t.stamp">
        <Button v-for="s in STAMPS" :key="s" type="button" size="sm" role="radio" :aria-checked="stamp === s" :variant="stamp === s ? 'default' : 'outline'" @click="stamp = s">
          {{ STAMP_LABELS[s] }}
        </Button>
      </div>
      <Textarea v-model="body" rows="3" maxlength="2000" :placeholder="t.bodyPlaceholder" :aria-label="t.bodyPlaceholder" />
      <div class="flex gap-2">
        <Button type="submit" size="sm" :disabled="pending">{{ t.submit }}</Button>
        <Button type="button" size="sm" variant="outline" @click="writing = false">{{ t.cancel }}</Button>
      </div>
    </form>

    <p v-if="!list.length && !writing" class="text-muted-foreground text-sm">{{ t.waiting }}</p>
    <ul class="flex flex-col gap-3">
      <li v-for="c in list" :key="c.id" class="flex flex-col gap-1 rounded-md border p-3 text-sm">
        <div class="flex items-center gap-2">
          <span class="font-medium">{{ nameOf(c.uid) }}</span>
          <span v-if="c.stamp" class="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">{{ STAMP_LABELS[c.stamp] }}</span>
          <span v-if="c.editedAt" class="text-muted-foreground text-xs">{{ ko.notes.comments.edited }}</span>
          <Button v-if="c.uid === me || space.can('manage')" variant="ghost" size="sm" class="text-destructive ml-auto h-7 px-2 text-xs" :disabled="pending" @click="remove(c)">{{ t.remove }}</Button>
        </div>
        <p v-if="c.body" class="whitespace-pre-wrap break-words">{{ c.body }}</p>
      </li>
    </ul>
  </section>
</template>
