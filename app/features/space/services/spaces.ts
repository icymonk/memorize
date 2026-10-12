import type { Firestore, Timestamp } from 'firebase/firestore'
import type { MemberStatus, Modules, SpaceAccess, SpaceColor, SpaceGeneral, SpaceSettings } from '#shared/schemas/space'
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore'

export interface Space {
  id: string
  kind: 'workspace' | 'personal'
  name: string
  icon: string
  color: SpaceColor | null
  description: string
  ownerId: string
  modules: Modules
  settings?: SpaceSettings & { ranking?: { enabled: boolean } }
  memberCount: number
  maxMembers?: number
  deleteScheduledAt?: Timestamp | null
}

export type SpacePatch = Partial<SpaceGeneral> & { modules?: Modules, settings?: Space['settings'] }

export interface Membership {
  access: SpaceAccess
  status: MemberStatus
  displayName: string
  photoURL: string | null
}

export async function getUserSpaceIds(db: Firestore, uid: string): Promise<string[]> {
  const snap = await getDoc(doc(db, 'users', uid))
  return (snap.get('spaceIds') as string[] | undefined) ?? []
}

export async function getSpace(db: Firestore, spaceId: string): Promise<Space | null> {
  const snap = await getDoc(doc(db, 'spaces', spaceId))
  return snap.exists() ? { id: snap.id, ...snap.data() } as Space : null
}

export async function getMembership(db: Firestore, spaceId: string, uid: string): Promise<Membership | null> {
  const snap = await getDoc(doc(db, 'spaces', spaceId, 'members', uid))
  return snap.exists() ? snap.data() as Membership : null
}

/** 소유자·매니저의 설정 변경 (규칙이 바꿀 수 있는 필드·값을 검사한다) */
export async function updateSpace(db: Firestore, spaceId: string, patch: SpacePatch) {
  await updateDoc(doc(db, 'spaces', spaceId), { ...patch, updatedAt: serverTimestamp() })
}
