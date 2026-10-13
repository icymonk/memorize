import type { Firestore } from 'firebase/firestore'
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore'

/** CMN-51: 워크스페이스 공통 태그 (spaces/{sid}/tags/{tagKey}) */
export interface Tag { id: string, name: string, color: string }

export const TAG_MAX = 30
export const TAG_COLORS = ['gray', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'] as const
export const TAG_CLASS: Record<string, string> = {
  gray: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
  red: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-200',
  yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200',
  green: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-200',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200',
  purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-200',
  pink: 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-200',
}

/** 대소문자만 다른 태그는 같은 태그로 본다 */
export function tagKey(name: string) {
  const k = name.trim().slice(0, TAG_MAX).toLowerCase().replace(/\//g, '∕')
  return k === '.' || k === '..' || /^__.*__$/.test(k) ? '' : k
}

function colorOf(key: string) {
  let h = 0
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return TAG_COLORS[h % TAG_COLORS.length]!
}

export function watchTags(db: Firestore, sid: string, cb: (list: Tag[]) => void) {
  return onSnapshot(
    query(collection(db, 'spaces', sid, 'tags'), orderBy('name')),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Tag)),
    () => cb([]),
  )
}

/** 처음 쓰는 태그를 공통 태그로 등록한다 */
export async function ensureTags(db: Firestore, sid: string, uid: string, names: string[], known: Tag[]) {
  const have = new Set(known.map(t => t.id))
  const fresh = new Map<string, string>()
  for (const n of names) {
    const key = tagKey(n)
    if (key && !have.has(key)) fresh.set(key, n.trim().slice(0, TAG_MAX))
  }
  await Promise.allSettled([...fresh].map(([key, name]) =>
    setDoc(doc(db, 'spaces', sid, 'tags', key), { name, color: colorOf(key), createdBy: uid, createdAt: serverTimestamp() })))
}

export function deleteTag(db: Firestore, sid: string, id: string) {
  return deleteDoc(doc(db, 'spaces', sid, 'tags', id))
}
