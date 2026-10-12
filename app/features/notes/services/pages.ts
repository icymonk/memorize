import type { Firestore, Timestamp } from 'firebase/firestore'
import type { StoredBlock } from '../sync/serialize'
import { addDoc, collection, doc, getDoc, getDocs, or, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { keyBetween } from '../sync/order'

export type PageVisibility = 'private' | 'people' | 'group' | 'space'

export interface Page {
  id: string
  type: 'page' | 'journal' | 'bookReview' | 'lessonNote' | 'item'
  title: string
  icon: string
  ownerId: string
  root: 'private' | 'shared'
  parentId: string | null
  order: string
  visibility: PageVisibility
  editorIds: string[]
  excerpt: string
  blockCount: number
  textLength: number
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

const pagesOf = (db: Firestore, sid: string) => collection(db, 'spaces', sid, 'pages')

export const canEditPage = (p: Pick<Page, 'ownerId' | 'editorIds'>, uid: string) => p.ownerId === uid || (p.editorIds ?? []).includes(uid)

/** 규칙이 허용하는 것만 조회: 공간 전체 공개 + 내 페이지 (공개 범위 세분화는 1-C4) */
export async function listPages(db: Firestore, sid: string, uid: string): Promise<Page[]> {
  const snap = await getDocs(query(pagesOf(db, sid), or(where('visibility', '==', 'space'), where('ownerId', '==', uid))))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Page)
}

export async function getPage(db: Firestore, sid: string, pageId: string): Promise<Page | null> {
  const snap = await getDoc(doc(pagesOf(db, sid), pageId))
  return snap.exists() ? { id: snap.id, ...snap.data() } as Page : null
}

/** 워크스페이스에서는 공유 페이지, 내 공간에서는 나만 보는 페이지로 만든다 */
export async function createPage(db: Firestore, sid: string, uid: string, personal: boolean): Promise<string> {
  const now = serverTimestamp()
  const ref = await addDoc(pagesOf(db, sid), {
    type: 'page',
    title: '',
    icon: '',
    cover: null,
    ownerId: uid,
    root: personal ? 'private' : 'shared',
    parentId: null,
    order: keyBetween(null, null),
    ancestorIds: [],
    props: {},
    visibility: personal ? 'private' : 'space',
    groupIds: [],
    sharedWith: [],
    editorIds: [],
    reviewerIds: [],
    excerpt: '',
    blockCount: 0,
    textLength: 0,
    lock: null,
    ownerStatus: 'active',
    createdAt: now,
    updatedAt: now,
  })
  return ref.id
}

export async function updatePageTitle(db: Firestore, sid: string, pageId: string, title: string) {
  await updateDoc(doc(pagesOf(db, sid), pageId), { title, updatedAt: serverTimestamp() })
}

export async function loadBlocks(db: Firestore, sid: string, pageId: string): Promise<StoredBlock[]> {
  const snap = await getDocs(query(collection(db, 'spaces', sid, 'pages', pageId, 'blocks'), orderBy('order')))
  return snap.docs.map((d) => {
    const { type, parentBlockId, order, attrs, content } = d.data()
    return { id: d.id, type, parentBlockId: parentBlockId ?? null, order, attrs: attrs ?? {}, content: content ?? [] }
  })
}
