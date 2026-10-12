import type { SpaceAction } from '#shared/permissions'
import type { CreateWorkspaceInput } from '#shared/schemas/space'
import type { Membership, Space, SpacePatch } from '~/features/space/services/spaces'
import { can as canDo } from '#shared/permissions'
import { defineStore } from 'pinia'
import { getMembership, getSpace, getUserSpaceIds, updateSpace } from '~/features/space/services/spaces'
import { callFn } from '~/lib/functions'

/** 내가 속한 공간 목록과 현재 공간·내 멤버십 (docs/dev/architecture.md 6절) */
export const useSpaceStore = defineStore('space', () => {
  const { $firestore, $functions } = useNuxtApp()
  const auth = useAuthStore()

  const spaces = ref<Space[]>([])
  const loaded = ref(false)
  const current = ref<Space | null>(null)
  const membership = ref<Membership | null>(null)
  let loadPromise: Promise<void> | null = null

  const personalSpace = computed(() => spaces.value.find(s => s.kind === 'personal') ?? null)
  const workspaces = computed(() => spaces.value.filter(s => s.kind === 'workspace'))

  function reset() {
    spaces.value = []
    loaded.value = false
    current.value = null
    membership.value = null
    loadPromise = null
  }
  watch(() => auth.user?.uid, reset)

  function loadMySpaces(force = false) {
    const uid = auth.user?.uid
    if (!uid) return Promise.resolve()
    if (force) loadPromise = null
    loadPromise ??= (async () => {
      const ids = await getUserSpaceIds($firestore, uid)
      const docs = await Promise.all(ids.map(id => getSpace($firestore, id).catch(() => null)))
      spaces.value = docs.filter((s): s is Space => !!s)
      loaded.value = true
    })().catch((error) => {
      loadPromise = null
      throw error
    })
    return loadPromise
  }

  /** 활성 멤버면 현재 공간으로 정하고 true. 아니면 false (middleware/space) */
  async function enter(spaceId: string, force = false) {
    const uid = auth.user?.uid
    if (!uid) return false
    if (!force && current.value?.id === spaceId && membership.value) return true
    try {
      const member = await getMembership($firestore, spaceId, uid)
      if (member?.status !== 'active') return false
      const space = await getSpace($firestore, spaceId)
      if (!space) return false
      current.value = space
      membership.value = member
      return true
    }
    catch {
      return false
    }
  }

  /** 현재 공간에서의 운영 권한 (useCan 역할) */
  function can(action: SpaceAction) {
    const s = current.value
    return !!s && canDo({ kind: s.kind, settings: s.settings, member: membership.value }, action)
  }

  function patchLocal(spaceId: string, patch: Partial<Space>) {
    if (current.value?.id === spaceId) current.value = { ...current.value, ...patch }
    spaces.value = spaces.value.map(s => s.id === spaceId ? { ...s, ...patch } : s)
  }

  async function update(patch: SpacePatch) {
    const s = current.value
    if (!s) return
    await updateSpace($firestore, s.id, patch)
    patchLocal(s.id, patch)
  }

  /** 서버에서 바뀐 값(삭제 예약 등)을 다시 읽는다 */
  async function refreshCurrent() {
    const s = current.value
    if (!s) return
    const fresh = await getSpace($firestore, s.id)
    if (fresh) patchLocal(s.id, fresh)
  }

  async function scheduleDeletion(confirmName: string) {
    const s = current.value
    if (!s) return
    await callFn($functions, 'scheduleSpaceDeletion', { spaceId: s.id, confirmName })
    await refreshCurrent()
  }

  async function cancelDeletion() {
    const s = current.value
    if (!s) return
    await callFn($functions, 'cancelSpaceDeletion', { spaceId: s.id })
    await refreshCurrent()
  }

  /** WS-24: 나간 뒤 목록을 다시 읽고 현재 공간을 비운다 */
  async function leave() {
    const s = current.value
    if (!s) return
    await callFn($functions, 'leaveSpace', { spaceId: s.id })
    current.value = null
    membership.value = null
    await loadMySpaces(true)
  }

  async function createWorkspace(input: CreateWorkspaceInput) {
    const { spaceId } = await callFn($functions, 'createWorkspace', input)
    await loadMySpaces(true)
    return spaceId
  }

  return { spaces, loaded, current, membership, personalSpace, workspaces, loadMySpaces, enter, can, update, refreshCurrent, scheduleDeletion, cancelDeletion, leave, createWorkspace }
})
