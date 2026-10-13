<script setup lang="ts">
import type { Group } from '../services/groups'
import type { Member } from '../services/invites'
import { SPACE_COLORS } from '#shared/schemas/space'
import { LIMITS } from '#shared/limits'
import { toast } from 'vue-sonner'
import { errorMessage } from '~/lib/errors'
import { cn } from '~/lib/utils'
import { ko } from '~/locales/ko'
import { SPACE_COLOR_CLASS } from '../colors'
import { createGroup, setGroupDeleted, setInGroup, updateGroup } from '../services/groups'

/** WS-30~33: 그룹 만들기·멤버 관리·이름·삭제·복원. 모든 멤버가 할 수 있다 */
type M = Member & { groupIds?: string[] }
const props = defineProps<{ sid: string, groups: Group[], members: M[] }>()
const emit = defineEmits<{ changed: [] }>()
const t = ko.members.groups
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const name = ref('')
const color = ref<Group['color']>('blue')
const joinable = ref(true)
const busy = ref(false)
const open = ref<string | null>(null)
const me = computed(() => auth.user!.uid)
const live = computed(() => props.groups.filter(g => !g.deletedAt))
const deleted = computed(() => props.groups.filter(g => g.deletedAt))
const inGroup = (m: M, g: Group) => (m.groupIds ?? []).includes(g.id)
const countOf = (g: Group) => props.members.filter(m => inGroup(m, g)).length
const daysLeft = (g: Group) => Math.max(0, LIMITS.groupRestoreDays - Math.floor((Date.now() - (g.deletedAt?.toMillis() ?? Date.now())) / 86_400_000))

async function run(fn: () => Promise<unknown>, after?: () => void) {
  busy.value = true
  try {
    await fn()
    after?.()
  }
  catch (e) { toast.error(errorMessage(e) ?? ko.errors.unknown) }
  finally { busy.value = false }
}
const create = () => run(() => createGroup($firestore, props.sid, me.value, { name: name.value.trim().slice(0, 40), color: color.value, joinable: joinable.value }), () => { name.value = '' })
const toggleMember = (m: M, g: Group) => run(() => setInGroup($firestore, props.sid, m.uid, g.id, !inGroup(m, g)), () => emit('changed'))
async function rename(g: Group) {
  const v = (await promptDialog(t.rename, g.name))?.trim()
  if (v && v !== g.name) await run(() => updateGroup($firestore, props.sid, g.id, { name: v.slice(0, 40) }))
}
async function remove(g: Group) {
  if (await confirmDialog(t.removeConfirm(g.name), { destructive: true })) await run(() => setGroupDeleted($firestore, props.sid, me.value, g.id, true))
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <form class="flex flex-wrap items-end gap-2 rounded-lg border p-3" @submit.prevent="create">
      <div class="flex flex-col gap-1.5">
        <Label for="group-name">{{ t.name }}</Label>
        <Input id="group-name" v-model="name" maxlength="40" class="w-48" />
      </div>
      <div class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">{{ t.color }}</span>
        <div class="flex h-9 items-center gap-1" role="radiogroup" :aria-label="t.color">
          <button
            v-for="c in SPACE_COLORS" :key="c" type="button" role="radio" :aria-checked="color === c" :aria-label="c"
            :class="cn('size-5 rounded-full', SPACE_COLOR_CLASS[c], color === c && 'ring-primary ring-2 ring-offset-1')" @click="color = c"
          />
        </div>
      </div>
      <label class="flex h-9 items-center gap-1.5 text-sm" :title="t.joinableHint">
        <input v-model="joinable" type="checkbox" class="accent-primary">
        {{ t.joinable }}
      </label>
      <Button type="submit" :disabled="busy || !name.trim()">
        {{ t.create }}
      </Button>
    </form>
    <p class="text-muted-foreground -mt-2 text-xs">
      {{ t.everyoneCan }}
    </p>

    <p v-if="!live.length" class="text-muted-foreground text-sm">
      {{ t.none }}
    </p>
    <div v-for="g in live" :key="g.id" class="flex flex-col gap-2 rounded-lg border px-3 py-2">
      <div class="flex flex-wrap items-center gap-2">
        <span :class="cn('size-3 rounded-full', SPACE_COLOR_CLASS[g.color])" />
        <span class="text-sm font-medium">{{ g.name }}</span>
        <span class="text-muted-foreground text-xs">{{ t.count(countOf(g)) }}</span>
        <Badge v-if="g.joinable" variant="outline">
          {{ t.joinable }}
        </Badge>
        <span class="ml-auto flex flex-wrap gap-1">
          <Button v-if="g.joinable && members.find(m => m.uid === me)" size="sm" variant="outline" class="h-7 text-xs" :disabled="busy" @click="toggleMember(members.find(m => m.uid === me)!, g)">
            {{ inGroup(members.find(m => m.uid === me)!, g) ? t.leave : t.join }}
          </Button>
          <Button size="sm" variant="ghost" class="h-7 text-xs" :aria-expanded="open === g.id" @click="open = open === g.id ? null : g.id">{{ t.manage }}</Button>
          <Button size="sm" variant="ghost" class="h-7 text-xs" @click="rename(g)">{{ t.rename }}</Button>
          <Button size="sm" variant="ghost" class="h-7 text-xs" :disabled="busy" @click="run(() => updateGroup($firestore, sid, g.id, { joinable: !g.joinable }))">
            {{ g.joinable ? t.makeClosed : t.makeJoinable }}
          </Button>
          <Button size="sm" variant="ghost" class="text-destructive h-7 text-xs" @click="remove(g)">{{ t.remove }}</Button>
        </span>
      </div>
      <div v-if="open === g.id" class="grid grid-cols-2 gap-1 sm:grid-cols-3">
        <label v-for="m in members" :key="m.uid" class="flex items-center gap-2 text-sm">
          <input type="checkbox" class="accent-primary" :checked="inGroup(m, g)" :disabled="busy" @change="toggleMember(m, g)">
          <span class="truncate">{{ m.displayName }}</span>
        </label>
      </div>
    </div>

    <section v-if="deleted.length" class="flex flex-col gap-2">
      <h3 class="text-muted-foreground text-sm font-medium">
        {{ t.deleted }}
      </h3>
      <div v-for="g in deleted" :key="g.id" class="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm">
        <span :class="cn('size-3 rounded-full opacity-50', SPACE_COLOR_CLASS[g.color])" />
        <span class="text-muted-foreground flex-1">{{ g.name }} · {{ t.daysLeft(daysLeft(g)) }}</span>
        <Button size="sm" variant="outline" class="h-7 text-xs" :disabled="busy" @click="run(() => setGroupDeleted($firestore, sid, me, g.id, false))">
          {{ t.restore }}
        </Button>
      </div>
    </section>
  </div>
</template>
