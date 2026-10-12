import type { Firestore, Timestamp } from 'firebase/firestore'
import type { Membership } from './spaces'
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'

export interface Invite {
  code: string
  createdBy: string
  expiresAt: Timestamp | null
  maxUses: number | null
  uses: number
  disabled: boolean
  createdAt?: Timestamp
}

export type Member = Membership & { uid: string, joinedAt?: Timestamp | null, requestedAt?: Timestamp | null }

/** 매니저는 공간의 모든 초대, 그 외는 내가 만든 초대만 (규칙과 같은 조건) */
export async function listInvites(db: Firestore, spaceId: string, uid: string, all: boolean): Promise<Invite[]> {
  const col = collection(db, 'spaces', spaceId, 'invites')
  const snap = await getDocs(all ? col : query(col, where('createdBy', '==', uid)))
  return snap.docs
    .map(d => d.data() as Invite)
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
}

export async function setInviteDisabled(db: Firestore, spaceId: string, code: string, disabled: boolean) {
  await updateDoc(doc(db, 'spaces', spaceId, 'invites', code), { disabled, updatedAt: serverTimestamp() })
}

export async function listMembers(db: Firestore, spaceId: string): Promise<Member[]> {
  const snap = await getDocs(collection(db, 'spaces', spaceId, 'members'))
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }) as Member)
}

export function inviteUsable(invite: Invite, now = Date.now()) {
  if (invite.disabled) return false
  if (invite.expiresAt && invite.expiresAt.toMillis() <= now) return false
  return !(invite.maxUses != null && invite.uses >= invite.maxUses)
}

export const inviteLink = (code: string) => `${window.location.origin}/invite/${code}`
