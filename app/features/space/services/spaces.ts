import type { Firestore } from 'firebase/firestore'
import type { MemberStatus, Modules, SpaceAccess, SpaceColor } from '#shared/schemas/space'
import { doc, getDoc } from 'firebase/firestore'

export interface Space {
  id: string
  kind: 'workspace' | 'personal'
  name: string
  icon: string
  color: SpaceColor | null
  description: string
  ownerId: string
  modules: Modules
  memberCount: number
  maxMembers?: number
}

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
