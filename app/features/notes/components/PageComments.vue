<script setup lang="ts">
import type { Member } from '~/features/space/services/invites'
import type { Comment } from '../services/comments'
import { toast } from 'vue-sonner'
import { listMembers } from '~/features/space/services/invites'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'
import { addComment, editComment, findMentions, removeComment, watchPageComments } from '../services/comments'

/** CMN-20·22: 페이지 아래 댓글과 @멘션 */
const props = defineProps<{ sid: string, pageId: string }>()
const t = ko.notes.comments
const auth = useAuthStore()
const space = useSpaceStore()
const { $firestore } = useNuxtApp()
const comments = ref<Comment[]>([])
const members = ref<Member[]>([])
const draft = ref('')
const editing = ref<string | null>(null)
const editText = ref('')
const pending = ref(false)
let stop: (() => void) | undefined

onMounted(async () => {
  stop = watchPageComments($firestore, props.sid, props.pageId, (list) => { comments.value = list }, () => {})
  try { members.value = (await listMembers($firestore, props.sid)).filter(m => m.status === 'active') }
  catch { members.value = [] }
})
onBeforeUnmount(() => stop?.())

const nameOf = (uid: string) => members.value.find(m => m.uid === uid)?.displayName || t.someone
const canManage = computed(() => space.can('manage'))

async function run(fn: () => Promise<void>) {
  pending.value = true
  try { await fn() }
  catch (error) { toast.error(errorMessage(error) ?? ko.errors.unknown) }
  finally { pending.value = false }
}
const submit = () => run(async () => {
  const body = draft.value.trim()
  if (!body) return
  await addComment($firestore, props.sid, auth.user!.uid, props.pageId, body.slice(0, 2000), findMentions(body, members.value))
  draft.value = ''
})
function startEdit(c: Comment) {
  editing.value = c.id
  editText.value = c.body
}
const saveEdit = (c: Comment) => run(async () => {
  const body = editText.value.trim()
  if (!body) return
  await editComment($firestore, props.sid, c.id, body.slice(0, 2000), findMentions(body, members.value))
  editing.value = null
})
const remove = (c: Comment) => run(async () => {
  if (window.confirm(t.removeConfirm)) await removeComment($firestore, props.sid, c.id)
})
</script>

<template>
  <section class="mt-6 flex flex-col gap-3 border-t pt-4" :aria-label="t.title">
    <h2 class="text-sm font-semibold">
      {{ t.title }} <span class="text-muted-foreground font-normal">{{ comments.length || '' }}</span>
    </h2>
    <p v-if="!comments.length" class="text-muted-foreground text-sm">
      {{ t.empty }}
    </p>
    <ul class="flex flex-col gap-3">
      <li v-for="c in comments" :key="c.id" class="flex flex-col gap-1 text-sm">
        <div class="flex items-center gap-2">
          <span class="font-medium">{{ nameOf(c.uid) }}</span>
          <span v-if="c.editedAt" class="text-muted-foreground text-xs">{{ t.edited }}</span>
          <span class="ml-auto flex gap-1">
            <Button v-if="c.uid === auth.user?.uid && editing !== c.id" variant="ghost" size="sm" class="h-7 px-2 text-xs" @click="startEdit(c)">{{ t.edit }}</Button>
            <Button v-if="c.uid === auth.user?.uid || canManage" variant="ghost" size="sm" class="text-destructive h-7 px-2 text-xs" :disabled="pending" @click="remove(c)">{{ t.remove }}</Button>
          </span>
        </div>
        <form v-if="editing === c.id" class="flex flex-col gap-2" @submit.prevent="saveEdit(c)">
          <Textarea v-model="editText" rows="2" maxlength="2000" :aria-label="t.edit" />
          <div class="flex gap-2">
            <Button type="submit" size="sm" :disabled="pending || !editText.trim()">{{ t.save }}</Button>
            <Button type="button" size="sm" variant="outline" @click="editing = null">{{ t.cancel }}</Button>
          </div>
        </form>
        <p v-else class="whitespace-pre-wrap break-words">{{ c.body }}</p>
      </li>
    </ul>
    <form class="flex flex-col gap-2" @submit.prevent="submit">
      <Textarea v-model="draft" rows="2" maxlength="2000" :placeholder="t.placeholder" :aria-label="t.placeholder" @keydown.meta.enter="submit" @keydown.ctrl.enter="submit" />
      <div class="flex items-center gap-2">
        <span class="text-muted-foreground text-xs">{{ t.hint }}</span>
        <Button type="submit" size="sm" class="ml-auto" :disabled="pending || !draft.trim()">{{ t.submit }}</Button>
      </div>
    </form>
  </section>
</template>
