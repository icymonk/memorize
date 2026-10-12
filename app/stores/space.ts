import type { CreateWorkspaceInput } from '#shared/schemas/space'
import type { Membership, Space } from '~/features/space/services/spaces'
import { defineStore } from 'pinia'
import { getMembership, getSpace, getUserSpaceIds } from '~/features/space/services/spaces'
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
  async function enter(spaceId: string) {
    const uid = auth.user?.uid
    if (!uid) return false
    if (current.value?.id === spaceId && membership.value) return true
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

  async function createWorkspace(input: CreateWorkspaceInput) {
    const { spaceId } = await callFn($functions, 'createWorkspace', input)
    await loadMySpaces(true)
    return spaceId
  }

  return { spaces, loaded, current, membership, personalSpace, workspaces, loadMySpaces, enter, createWorkspace }
})
