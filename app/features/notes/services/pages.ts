import type { Firestore, Timestamp } from 'firebase/firestore'
import type { StoredBlock } from '../sync/serialize'
import type { Functions } from 'firebase/functions'
import type { PropValue } from '#shared/schemas/collection'
import { addDoc, and, collection, doc, getDoc, getDocs, onSnapshot, or, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore'
import { callFn } from '~/lib/functions'
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
  ancestorIds: string[]
  order: string
  visibility: PageVisibility
  editorIds: string[]
  sharedWith?: string[]
  editPolicy?: 'everyone' | 'editors'
  lock?: { uid: string, name: string, at: Timestamp } | null
  collectionId?: string
  copiedFrom?: { spaceId: string, pageId: string, spaceName?: string }
  props?: Record<string, PropValue>
  excerpt: string
  blockCount: number
  textLength: number
  deletedAt?: Timestamp | null
  deletedBy?: string
  trashRootId?: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

const pagesOf = (db: Firestore, sid: string) => collection(db, 'spaces', sid, 'pages')

/** NOTE-54: 작성자·공동 편집자, 공유 페이지는 편집 정책이 '모두'면 모든 멤버 */
export const canEditPage = (p: Pick<Page, 'ownerId' | 'editorIds' | 'root' | 'editPolicy'>, uid: string) =>
  p.ownerId === uid || (p.editorIds ?? []).includes(uid) || (p.root === 'shared' && (p.editPolicy ?? 'everyone') === 'everyone')

/** 규칙이 허용하는 것만 조회: 휴지통이 아닌 내 페이지 + 나간 멤버 것이 아닌 공개·공유 페이지 (WS-23) */
const visiblePages = (db: Firestore, sid: string, uid: string) => {
  const active = where('ownerStatus', '==', 'active')
  return query(pagesOf(db, sid), and(where('deletedAt', '==', null), or(
    and(where('visibility', '==', 'space'), active),
    where('ownerId', '==', uid),
    and(where('sharedWith', 'array-contains', uid), active),
    and(where('editorIds', 'array-contains', uid), active),
  )))
}

export async function listPages(db: Firestore, sid: string, uid: string): Promise<Page[]> {
  const snap = await getDocs(visiblePages(db, sid, uid))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Page)
}

/** 사이드바 페이지 트리: 제목·이동이 바로 보이도록 구독 */
export function watchPages(db: Firestore, sid: string, uid: string, cb: (pages: Page[]) => void, onError: (e: unknown) => void) {
  return onSnapshot(visiblePages(db, sid, uid), snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Page)), onError)
}

/** NOTE-22: 내가 버린 페이지 */
export async function listTrash(db: Firestore, sid: string, uid: string): Promise<Page[]> {
  const snap = await getDocs(query(pagesOf(db, sid), where('deletedBy', '==', uid)))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Page).filter(p => p.deletedAt)
}

export const movePage = (fns: Functions, spaceId: string, pageId: string, parentId: string | null, order: string) =>
  callFn(fns, 'movePage', { spaceId, pageId, parentId, order })
export const trashPage = (fns: Functions, spaceId: string, pageId: string) => callFn(fns, 'trashPage', { spaceId, pageId })
export const restorePage = (fns: Functions, spaceId: string, pageId: string) => callFn(fns, 'restorePage', { spaceId, pageId })

export interface UserPrefs { favoritePageIds: string[], recentPageIds: string[] }
const prefsRef = (db: Firestore, sid: string, uid: string) => doc(db, 'spaces', sid, 'userPrefs', uid)

export async function getPrefs(db: Firestore, sid: string, uid: string): Promise<UserPrefs> {
  const snap = await getDoc(prefsRef(db, sid, uid))
  return { favoritePageIds: snap.get('favoritePageIds') ?? [], recentPageIds: snap.get('recentPageIds') ?? [] }
}

export async function savePrefs(db: Firestore, sid: string, uid: string, prefs: UserPrefs) {
  await setDoc(prefsRef(db, sid, uid), { favoritePageIds: prefs.favoritePageIds.slice(0, 50), recentPageIds: prefs.recentPageIds.slice(0, 20) })
}

export async function getPage(db: Firestore, sid: string, pageId: string): Promise<Page | null> {
  const snap = await getDoc(doc(pagesOf(db, sid), pageId))
  return snap.exists() ? { id: snap.id, ...snap.data() } as Page : null
}

/** NOTE-20: 공유 페이지(공간 전체) 또는 내 페이지(나만). 하위 페이지는 부모의 갈래·공개 범위를 따른다 */
export async function createPage(db: Firestore, sid: string, uid: string, opts: { root: 'private' | 'shared', parent?: Page | null, after?: string | null, collection?: { id: string, scope: 'private' | 'shared' }, props?: Record<string, PropValue>, journal?: boolean }): Promise<string> {
  const now = serverTimestamp()
  const col = opts.collection
  const parent = col ? null : opts.parent ?? null
  const root = col?.scope ?? parent?.root ?? opts.root
  const ref = await addDoc(pagesOf(db, sid), {
    type: col ? (opts.journal ? 'journal' : 'item') : 'page',
    ...(opts.journal ? { editPolicy: 'editors' } : {}),
    ...(col ? { collectionId: col.id } : {}),
    title: '',
    icon: '',
    cover: null,
    ownerId: uid,
    root,
    parentId: parent?.id ?? null,
    order: keyBetween(opts.after ?? null, null),
    ancestorIds: parent ? [...(parent.ancestorIds ?? []), parent.id] : [],
    props: opts.props ?? {},
    visibility: parent?.visibility ?? (root === 'private' ? 'private' : 'space'),
    groupIds: [],
    sharedWith: [],
    editorIds: [],
    reviewerIds: [],
    excerpt: '',
    blockCount: 0,
    textLength: 0,
    lock: null,
    ownerStatus: 'active',
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  })
  return ref.id
}

export async function updatePageIcon(db: Firestore, sid: string, pageId: string, icon: string) {
  await updateDoc(doc(pagesOf(db, sid), pageId), { icon, updatedAt: serverTimestamp() })
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

/** NOTE-48: 템플릿 페이지의 블록과 요약을 새 페이지로 복사 */
export async function copyBlocks(db: Firestore, sid: string, uid: string, from: Page, toId: string) {
  const blocks = await loadBlocks(db, sid, from.id)
  if (!blocks.length) return
  const now = serverTimestamp()
  const batch = writeBatch(db)
  for (const { id, ...b } of blocks.slice(0, 450)) {
    batch.set(doc(db, 'spaces', sid, 'pages', toId, 'blocks', id), { ...b, rev: 1, updatedBy: uid, updatedAt: now })
  }
  batch.update(doc(pagesOf(db, sid), toId), { excerpt: from.excerpt ?? '', blockCount: Math.min(blocks.length, 450), textLength: from.textLength ?? 0, updatedAt: now })
  await batch.commit()
}

/** NOTE-50·54: 공개 범위·공유 대상·공동 편집자·편집 정책 (작성자만) */
export async function updateSharing(db: Firestore, sid: string, pageId: string, patch: Pick<Page, 'visibility' | 'editorIds'> & { sharedWith: string[], editPolicy: 'everyone' | 'editors' }) {
  await updateDoc(doc(pagesOf(db, sid), pageId), { ...patch, updatedAt: serverTimestamp() })
}

/** NOTE-60: 편집 잠금. 30초마다 갱신, 90초 넘게 갱신이 없으면 다른 사람이 가져갈 수 있다 */
export const LOCK_REFRESH_MS = 30_000
export async function setLock(db: Firestore, sid: string, pageId: string, lock: { uid: string, name: string } | null) {
  const now = serverTimestamp()
  await updateDoc(doc(pagesOf(db, sid), pageId), { lock: lock ? { ...lock, at: now } : null, updatedAt: now })
}

/** NOTE-46: 모음 페이지의 항목 값 */
export async function setPageProp(db: Firestore, sid: string, pageId: string, key: string, value: PropValue) {
  await updateDoc(doc(pagesOf(db, sid), pageId), { [`props.${key}`]: value, updatedAt: serverTimestamp() })
}
