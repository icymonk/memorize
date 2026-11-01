import type { Firestore, Timestamp } from 'firebase/firestore'
import type { Page } from '~/features/notes/services/pages'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'

export interface FormerSpace { id: string, name: string, leftAt: Timestamp | null }

/** ACC-32: 나가거나 내보내진 워크스페이스(`users.formerSpaces`). 최근에 나온 순서 */
export async function listFormerSpaces(db: Firestore, uid: string): Promise<FormerSpace[]> {
  const map = ((await getDoc(doc(db, 'users', uid))).get('formerSpaces') ?? {}) as Record<string, { name?: string, leftAt?: Timestamp | null }>
  return Object.entries(map)
    .map(([id, v]) => ({ id, name: v?.name ?? '', leftAt: v?.leftAt ?? null }))
    .sort((a, b) => (b.leftAt?.toMillis() ?? 0) - (a.leftAt?.toMillis() ?? 0))
}

/** 그 워크스페이스에 내가 쓴 글 (규칙: 나간 사람은 자기 글만 읽는다) */
export async function listMyPagesIn(db: Firestore, sid: string, uid: string): Promise<Page[]> {
  const snap = await getDocs(query(collection(db, 'spaces', sid, 'pages'), where('ownerId', '==', uid), where('deletedAt', '==', null)))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Page)
}
