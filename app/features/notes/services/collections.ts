import type { Firestore, Timestamp } from 'firebase/firestore'
import type { Functions } from 'firebase/functions'
import type { CollectionInput, CollectionScope, PropDef, ViewDef } from '#shared/schemas/collection'
import { addDoc, collection, doc, getDoc, onSnapshot, or, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { callFn } from '~/lib/functions'

/** NOTE-46~49 내 모음 — docs/dev/data-model.md 4절 */
export interface Collection {
  id: string
  kind: 'custom' | 'system'
  systemType?: 'journal' | 'bookReview'
  name: string
  icon: string
  ownerId: string
  scope: CollectionScope
  schema: PropDef[]
  views: ViewDef[]
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

/** NOTE-30·31 학습일지: 공간마다 하나뿐인 기본 모음 (`collections/journal`) */
export const JOURNAL_ID = 'journal'
export const JOURNAL_MOODS = ['😄', '🙂', '😐', '😕', '😢']
const JOURNAL_SCHEMA: PropDef[] = [
  { key: 'date', name: '날짜', type: 'date', options: [] },
  { key: 'subjects', name: '과목', type: 'multiSelect', options: [] },
  { key: 'minutes', name: '학습 시간(분)', type: 'number', options: [] },
  { key: 'mood', name: '기분', type: 'select', options: JOURNAL_MOODS },
  { key: 'rating', name: '만족도', type: 'select', options: ['★', '★★', '★★★', '★★★★', '★★★★★'] },
  { key: 'tags', name: '태그', type: 'multiSelect', options: [] },
  { key: 'late', name: '늦게 씀', type: 'checkbox', options: [] },
]

export async function ensureJournal(db: Firestore, sid: string, uid: string) {
  const ref = doc(colsOf(db, sid), JOURNAL_ID)
  if ((await getDoc(ref)).exists()) return
  const now = serverTimestamp()
  await setDoc(ref, {
    kind: 'system',
    systemType: 'journal',
    name: '학습일지',
    icon: '📔',
    ownerId: uid,
    scope: sid.startsWith('p_') ? 'private' : 'shared',
    schema: JOURNAL_SCHEMA,
    views: [],
    templateIds: [],
    createdAt: now,
    updatedAt: now,
  })
}

/** REV-01·02 독후감: 공간마다 하나뿐인 기본 모음 (`collections/bookReview`) */
export const REVIEW_ID = 'bookReview'
const REVIEW_SCHEMA: PropDef[] = [
  { key: 'rating', name: '별점', type: 'select', options: ['★', '★★', '★★★', '★★★★', '★★★★★'] },
  { key: 'startedAt', name: '읽기 시작', type: 'date', options: [] },
  { key: 'finishedAt', name: '다 읽은 날', type: 'date', options: [] },
  { key: 'tags', name: '태그', type: 'multiSelect', options: [] },
]

export async function ensureBookReview(db: Firestore, sid: string, uid: string) {
  const ref = doc(colsOf(db, sid), REVIEW_ID)
  if ((await getDoc(ref)).exists()) return
  const now = serverTimestamp()
  await setDoc(ref, {
    kind: 'system',
    systemType: 'bookReview',
    name: '독후감',
    icon: '📖',
    ownerId: uid,
    scope: sid.startsWith('p_') ? 'private' : 'shared',
    schema: REVIEW_SCHEMA,
    views: [],
    templateIds: [],
    createdAt: now,
    updatedAt: now,
  })
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

/** NOTE-44·48: 저장한 보기, 새 페이지 템플릿 */
export async function saveCollectionMeta(db: Firestore, sid: string, id: string, patch: Partial<Pick<Collection, 'views' | 'templateIds'>>) {
  await updateDoc(doc(colsOf(db, sid), id), { ...patch, updatedAt: serverTimestamp() })
}

export const deleteCollection = (fns: Functions, spaceId: string, collectionId: string) => callFn(fns, 'deleteCollection', { spaceId, collectionId })
