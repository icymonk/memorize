<script setup lang="ts">
import type { Member } from '~/features/space/services/invites'
import type { Comment, CommentAnchor } from '../services/comments'
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
const anchor = ref<CommentAnchor | null>(null)

/** 본문에서 문장을 골라 댓글 달기 (NOTE-62·REV-13) */
function quote(a: CommentAnchor) {
  anchor.value = a
  nextTick(() => {
    const el = document.getElementById('page-comment-draft')
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el?.focus()
  })
}
defineExpose({ quote })

function jump(blockId: string) {
  const el = document.querySelector(`.note-editor [data-id="${CSS.escape(blockId)}"]`) as HTMLElement | null
  if (!el) return toast.info(t.blockGone)
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.classList.add('bg-yellow-100', 'dark:bg-yellow-900/40')
  setTimeout(() => el.classList.remove('bg-yellow-100', 'dark:bg-yellow-900/40'), 1500)
}
let stop: (() => void) | undefined

onMounted(async () => {
  stop = watchPageComments($firestore, props.sid, props.pageId, (list) => { comments.value = list.filter(c => c.kind === 'comment') }, () => {})
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
  await addComment($firestore, props.sid, auth.user!.uid, props.pageId, body.slice(0, 2000), findMentions(body, members.value), anchor.value ?? undefined)
  draft.value = ''
  anchor.value = null
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
  if (await confirmDialog(t.removeConfirm)) await removeComment($firestore, props.sid, c.id)
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
        <button v-if="c.blockId && c.quote" type="button" data-testid="comment-quote" class="text-muted-foreground border-l-2 pl-2 text-left text-xs hover:underline" :title="t.jump" @click="jump(c.blockId)">
          {{ c.quote }}
        </button>
        <p v-if="editing !== c.id" class="whitespace-pre-wrap break-words">{{ c.body }}</p>
      </li>
    </ul>
    <form class="flex flex-col gap-2" @submit.prevent="submit">
      <div v-if="anchor" class="bg-muted/50 flex items-start gap-2 rounded-md px-2 py-1.5 text-xs">
        <span class="text-muted-foreground border-l-2 pl-2">{{ anchor.quote }}</span>
        <Button type="button" variant="ghost" size="sm" class="ml-auto h-6 px-2 text-xs" @click="anchor = null">{{ t.clearQuote }}</Button>
      </div>
      <Textarea id="page-comment-draft" v-model="draft" rows="2" maxlength="2000" :placeholder="t.placeholder" :aria-label="t.placeholder" @keydown.meta.enter="submit" @keydown.ctrl.enter="submit" />
      <div class="flex items-center gap-2">
        <span class="text-muted-foreground text-xs">{{ t.hint }}</span>
        <Button type="submit" size="sm" class="ml-auto" :disabled="pending || !draft.trim()">{{ t.submit }}</Button>
      </div>
    </form>
  </section>
</template>
