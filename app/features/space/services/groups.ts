import type { SpaceColor } from '#shared/schemas/space'
import type { Firestore, Timestamp } from 'firebase/firestore'
import { addDoc, arrayRemove, arrayUnion, collection, doc, getDocs, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore'

/** WS-30~33 그룹 — docs/dev/data-model.md 2절 */
export interface Group {
  id: string
  name: string
  color: SpaceColor
  joinable: boolean
  createdBy: string
  deletedAt: Timestamp | null
  deletedBy?: string
}

const groupsOf = (db: Firestore, sid: string) => collection(db, 'spaces', sid, 'groups')

export function watchGroups(db: Firestore, sid: string, cb: (list: Group[]) => void, onError: (e: unknown) => void) {
  return onSnapshot(groupsOf(db, sid), snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Group)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))), onError)
}

export async function createGroup(db: Firestore, sid: string, uid: string, input: Pick<Group, 'name' | 'color' | 'joinable'>) {
  const now = serverTimestamp()
  return (await addDoc(groupsOf(db, sid), { ...input, createdBy: uid, deletedAt: null, createdAt: now, updatedAt: now })).id
}

export const updateGroup = (db: Firestore, sid: string, id: string, patch: Partial<Pick<Group, 'name' | 'color' | 'joinable'>>) =>
  updateDoc(doc(groupsOf(db, sid), id), { ...patch, updatedAt: serverTimestamp() })

/** WS-33: 삭제는 30일 동안 복원할 수 있다 */
export const setGroupDeleted = (db: Firestore, sid: string, uid: string, id: string, deleted: boolean) =>
  updateDoc(doc(groupsOf(db, sid), id), deleted
    ? { deletedAt: serverTimestamp(), deletedBy: uid, updatedAt: serverTimestamp() }
    : { deletedAt: null, updatedAt: serverTimestamp() })

/** WS-31 */
export const setInGroup = (db: Firestore, sid: string, memberUid: string, gid: string, inGroup: boolean) =>
  updateDoc(doc(db, 'spaces', sid, 'members', memberUid), { groupIds: inGroup ? arrayUnion(gid) : arrayRemove(gid) })

/** WS-32: 대상·공개 범위에 고를 수 있는 그룹 (삭제한 것 빼고) */
export async function listGroups(db: Firestore, sid: string): Promise<Group[]> {
  const snap = await getDocs(groupsOf(db, sid))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Group).filter(g => !g.deletedAt).sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}
