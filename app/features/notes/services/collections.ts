import type { Firestore, Timestamp } from 'firebase/firestore'
import type { CollectionInput, CollectionScope, PropDef } from '#shared/schemas/collection'
import { addDoc, collection, doc, onSnapshot, or, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'

/** NOTE-46~49 내 모음 — docs/dev/data-model.md 4절 */
export interface Collection {
  id: string
  kind: 'custom'
  name: string
  icon: string
  ownerId: string
  scope: CollectionScope
  schema: PropDef[]
  views: unknown[]
  templateIds: string[]
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

const colsOf = (db: Firestore, sid: string) => collection(db, 'spaces', sid, 'collections')

/** 공유 모음 + 내 모음 (규칙이 허용하는 것만) */
export function watchCollections(db: Firestore, sid: string, uid: string, cb: (list: Collection[]) => void, onError: (e: unknown) => void) {
  const q = query(colsOf(db, sid), or(where('scope', '==', 'shared'), where('ownerId', '==', uid)))
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Collection)), onError)
}

export async function createCollection(db: Firestore, sid: string, uid: string, input: CollectionInput): Promise<string> {
  const now = serverTimestamp()
  const ref = await addDoc(colsOf(db, sid), { ...input, kind: 'custom', ownerId: uid, views: [], templateIds: [], createdAt: now, updatedAt: now })
  return ref.id
}

export async function updateCollection(db: Firestore, sid: string, id: string, patch: Pick<CollectionInput, 'name' | 'icon' | 'schema'>) {
  await updateDoc(doc(colsOf(db, sid), id), { ...patch, updatedAt: serverTimestamp() })
}

/** 만든 사람, 공유 모음은 매니저도 설정을 바꾼다 */
export const canManageCollection = (c: Collection, uid: string, isManager: boolean) => c.ownerId === uid || (c.scope === 'shared' && isManager)
