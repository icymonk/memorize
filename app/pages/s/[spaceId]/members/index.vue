<script setup lang="ts">
import type { Invite, Member } from '~/features/space/services/invites'
import { INVITE_EXPIRY_DAYS } from '#shared/schemas/invite'
import { EllipsisIcon } from '@lucide/vue'
import { useClipboard } from '@vueuse/core'
import type { Group } from '~/features/space/services/groups'
import GroupsPanel from '~/features/space/components/GroupsPanel.vue'
import OwnershipTransferBanner from '~/features/space/components/OwnershipTransferBanner.vue'
import { SPACE_COLOR_CLASS } from '~/features/space/colors'
import { watchGroups } from '~/features/space/services/groups'
import { toast } from 'vue-sonner'
import { inviteLink, inviteUsable, listInvites, listMembers, setInviteDisabled } from '~/features/space/services/invites'
import { errorMessage } from '~/lib/errors'
import { callFn } from '~/lib/functions'
import { ko } from '~/locales/ko'

const t = ko.members
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore, $functions } = useNuxtApp()
const { copy } = useClipboard({ legacy: true })

if (space.current?.kind !== 'workspace') {
  await navigateTo(space.current ? `/s/${space.current.id}` : '/', { replace: true })
}

const spaceId = computed(() => space.current!.id)
const uid = computed(() => auth.user!.uid)
const canManage = computed(() => space.can('manage'))
const canInvite = computed(() => space.can('invite'))

const members = ref<Member[]>([])
const invites = ref<Invite[]>([])
const loadError = ref(false)
const busy = ref<string | null>(null)
const expiry = ref<string>('7')
const maxUses = ref<string>('')

const ORDER = { owner: 0, manager: 1, member: 2 }
const activeMembers = computed(() => members.value
  .filter(m => m.status === 'active')
  .sort((a, b) => ORDER[a.access] - ORDER[b.access] || a.displayName.localeCompare(b.displayName, 'ko')))
const pendingMembers = computed(() => members.value.filter(m => m.status === 'pending'))

async function load() {
  try {
    const [m, i] = await Promise.all([
      listMembers($firestore, spaceId.value),
      listInvites($firestore, spaceId.value, uid.value, canManage.value),
    ])
    members.value = m
    invites.value = i
    loadError.value = false
  }
  catch {
    loadError.value = true
  }
}
onMounted(load)

/** WS-20·30: 그룹 목록과 멤버의 소속 그룹 */
const groups = ref<Group[]>([])
let stopGroups: (() => void) | undefined
onMounted(() => { stopGroups = watchGroups($firestore, spaceId.value, (g) => { groups.value = g }, () => {}) })
onBeforeUnmount(() => stopGroups?.())
const groupsOf = (m: Member) => groups.value.filter(g => !g.deletedAt && ((m as Member & { groupIds?: string[] }).groupIds ?? []).includes(g.id))

async function run(key: string, fn: () => Promise<unknown>, success?: string) {
  busy.value = key
  try {
    await fn()
    if (success) toast.success(success)
    await load()
  }
  catch (error) {
    toast.error(errorMessage(error) ?? ko.errors.unknown)
  }
  finally {
    busy.value = null
  }
}

const createInvite = () => run('create', () => callFn($functions, 'createInvite', {
  spaceId: spaceId.value,
  expiresInDays: expiry.value === 'none' ? null : Number(expiry.value) as 1 | 7 | 30,
  maxUses: maxUses.value ? Number(maxUses.value) : null,
}), t.invites.created)
const toggleInvite = (invite: Invite) => run(invite.code, () => setInviteDisabled($firestore, spaceId.value, invite.code, !invite.disabled))
const decide = (member: Member, approve: boolean) => run(member.uid, async () => {
  await callFn($functions, 'decideJoinRequest', { spaceId: spaceId.value, uid: member.uid, approve })
  await space.refreshCurrent()
}, approve ? t.approved : t.rejected)

const isOwner = computed(() => space.membership?.access === 'owner')
const transfer = computed(() => space.current?.ownershipTransfer ?? null)
const nameOf = (id: string) => members.value.find(m => m.uid === id)?.displayName ?? ''

function canActOn(m: Member) {
  if (!canManage.value || m.uid === uid.value || m.access === 'owner') return false
  return m.access === 'member' || isOwner.value
}

async function afterChange() {
  await space.refreshCurrent()
  await space.enter(spaceId.value, true)
}

const toggleManager = (m: Member) => run(m.uid, async () => {
  await callFn($functions, 'setManager', { spaceId: spaceId.value, uid: m.uid, manager: m.access !== 'manager' })
}, t.actions.done)

async function removeMember(m: Member) {
  if (!(await confirmDialog(t.actions.removeConfirm(m.displayName)))) return
  return run(m.uid, async () => {
    await callFn($functions, 'removeMember', { spaceId: spaceId.value, uid: m.uid })
    await afterChange()
  }, t.actions.done)
}

async function requestTransfer(m: Member) {
  if (!(await confirmDialog(t.actions.transferConfirm(m.displayName)))) return
  return run(m.uid, async () => {
    await callFn($functions, 'transferOwnership', { spaceId: spaceId.value, uid: m.uid })
    await afterChange()
  }, t.actions.transferRequested)
}

const cancelTransfer = () => run('transfer', async () => {
  await callFn($functions, 'transferOwnership', { spaceId: spaceId.value, uid: null })
  await afterChange()
}, t.actions.transferCancelled)

async function copyText(text: string) {
  await copy(text)
  toast.success(t.invites.copied)
}

function inviteState(invite: Invite) {
  if (invite.disabled) return t.invites.off
  if (invite.expiresAt && invite.expiresAt.toMillis() <= Date.now()) return t.invites.expired
  if (!inviteUsable(invite)) return t.invites.usedUp
  return null
}
const initial = (name: string) => name.slice(0, 1).toUpperCase()
</script>

<template>
  <div v-if="space.current" class="mx-auto flex w-full max-w-3xl flex-col gap-6">
    <h1 class="text-2xl font-semibold">
      {{ t.title }}
    </h1>
    <OwnershipTransferBanner v-if="transfer && transfer.to === uid" :from-name="nameOf(transfer.from)" @done="load" />
    <div v-else-if="transfer && isOwner" class="bg-muted flex flex-wrap items-center gap-3 rounded-lg px-4 py-3 text-sm">
      <span class="flex-1">{{ t.actions.transferPending(nameOf(transfer.to)) }}</span>
      <Button size="sm" variant="outline" :disabled="busy === 'transfer'" @click="cancelTransfer">
        {{ t.actions.transferCancel }}
      </Button>
    </div>
    <p v-if="loadError" class="text-destructive text-sm">
      {{ t.loadError }}
    </p>

    <Tabs default-value="members">
      <TabsList>
        <TabsTrigger value="members">
          {{ t.tabs.members }} {{ activeMembers.length }}
        </TabsTrigger>
        <TabsTrigger value="groups">
          {{ t.tabs.groups }} {{ groups.filter(g => !g.deletedAt).length || '' }}
        </TabsTrigger>
        <TabsTrigger value="invites">
          {{ t.tabs.invites }}
        </TabsTrigger>
        <TabsTrigger v-if="canManage" value="pending">
          {{ t.tabs.pending }} {{ pendingMembers.length || '' }}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="members" class="flex flex-col gap-2 pt-2">
        <div v-for="m in activeMembers" :key="m.uid" class="flex items-center gap-3 rounded-lg border px-3 py-2">
          <Avatar class="size-8">
            <AvatarImage v-if="m.photoURL" :src="m.photoURL" :alt="m.displayName" />
            <AvatarFallback>{{ initial(m.displayName) }}</AvatarFallback>
          </Avatar>
          <span class="flex-1 truncate text-sm">
            <NuxtLink :to="`/s/${$route.params.spaceId}/members/${m.uid}`" class="hover:underline">{{ m.displayName }}</NuxtLink>
            <span v-if="m.uid === uid" class="text-muted-foreground">({{ t.me }})</span>
          </span>
          <span v-for="g in groupsOf(m)" :key="g.id" :class="['rounded-full px-2 py-0.5 text-xs', SPACE_COLOR_CLASS[g.color]]">{{ g.name }}</span>
          <Badge v-if="m.access !== 'member'" variant="secondary">
            {{ t.access[m.access] }}
          </Badge>
          <DropdownMenu v-if="canActOn(m)">
            <DropdownMenuTrigger as-child>
              <Button size="icon-sm" variant="ghost" :aria-label="t.actions.menu" :disabled="busy === m.uid">
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem @select="toggleManager(m)">
                {{ m.access === 'manager' ? t.actions.unmakeManager : t.actions.makeManager }}
              </DropdownMenuItem>
              <DropdownMenuItem v-if="isOwner" @select="requestTransfer(m)">
                {{ t.actions.transfer }}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem class="text-destructive" @select="removeMember(m)">
                {{ t.actions.remove }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TabsContent>

      <TabsContent value="groups" class="pt-2">
        <GroupsPanel :sid="spaceId" :groups="groups" :members="activeMembers" @changed="load" />
      </TabsContent>

      <TabsContent value="invites" class="flex flex-col gap-4 pt-2">
        <Card v-if="canInvite">
          <CardContent class="flex flex-wrap items-end gap-3">
            <div class="flex flex-col gap-2">
              <Label for="invite-expiry">{{ t.invites.expiry }}</Label>
              <select id="invite-expiry" v-model="expiry" class="border-input bg-background h-9 rounded-md border px-3 text-sm">
                <option v-for="d in INVITE_EXPIRY_DAYS" :key="d" :value="String(d)">
                  {{ t.invites.expiryOptions[d] }}
                </option>
                <option value="none">
                  {{ t.invites.expiryOptions.none }}
                </option>
              </select>
            </div>
            <div class="flex flex-col gap-2">
              <Label for="invite-max">{{ t.invites.maxUses }}</Label>
              <Input id="invite-max" v-model="maxUses" type="number" min="1" max="1000" :placeholder="t.invites.maxUsesHint" class="w-40" />
            </div>
            <Button :disabled="busy === 'create'" @click="createInvite">
              {{ t.invites.create }}
            </Button>
          </CardContent>
        </Card>
        <p v-else class="text-muted-foreground text-sm">
          {{ t.invites.noPermission }}
        </p>

        <p v-if="!invites.length" class="text-muted-foreground text-sm">
          {{ t.invites.none }}
        </p>
        <div v-for="invite in invites" :key="invite.code" class="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2">
          <span class="font-mono text-lg tracking-widest" :class="{ 'text-muted-foreground line-through': inviteState(invite) }">{{ invite.code }}</span>
          <div class="text-muted-foreground flex flex-1 flex-col text-xs">
            <span>{{ t.invites.uses(invite.uses, invite.maxUses) }}</span>
            <span v-if="invite.expiresAt">{{ t.invites.expiresAt(invite.expiresAt.toDate().toLocaleDateString('ko-KR')) }}</span>
          </div>
          <Badge v-if="inviteState(invite)" variant="outline">
            {{ inviteState(invite) }}
          </Badge>
          <Button size="sm" variant="outline" @click="copyText(inviteLink(invite.code))">
            {{ t.invites.copyLink }}
          </Button>
          <Button size="sm" variant="outline" @click="copyText(invite.code)">
            {{ t.invites.copyCode }}
          </Button>
          <Button size="sm" variant="ghost" :disabled="busy === invite.code" @click="toggleInvite(invite)">
            {{ invite.disabled ? t.invites.enable : t.invites.disable }}
          </Button>
        </div>
      </TabsContent>

      <TabsContent v-if="canManage" value="pending" class="flex flex-col gap-2 pt-2">
        <p v-if="!pendingMembers.length" class="text-muted-foreground text-sm">
          {{ t.noPending }}
        </p>
        <div v-for="m in pendingMembers" :key="m.uid" class="flex items-center gap-3 rounded-lg border px-3 py-2">
          <Avatar class="size-8">
            <AvatarImage v-if="m.photoURL" :src="m.photoURL" :alt="m.displayName" />
            <AvatarFallback>{{ initial(m.displayName) }}</AvatarFallback>
          </Avatar>
          <span class="flex-1 truncate text-sm">{{ m.displayName }}</span>
          <Button size="sm" :disabled="busy === m.uid" @click="decide(m, true)">
            {{ t.approve }}
          </Button>
          <Button size="sm" variant="outline" :disabled="busy === m.uid" @click="decide(m, false)">
            {{ t.reject }}
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  </div>
</template>
