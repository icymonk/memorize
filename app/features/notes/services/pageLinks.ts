import type { Firestore } from 'firebase/firestore'
import type { Page } from './pages'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { getPage } from './pages'

export type LinkRefType = 'page' | 'deck' | 'book' | 'mission'

/** NOTE-24·25: 이 대상을 연결한 페이지 중 내가 볼 수 있는 것 */
export async function listLinkingPages(db: Firestore, sid: string, refType: LinkRefType, refId: string): Promise<Page[]> {
  const snap = await getDocs(query(collection(db, 'spaces', sid, 'pageLinks'), where('refType', '==', refType), where('refId', '==', refId)))
  const pages = await Promise.all(snap.docs.map(d => getPage(db, sid, String(d.get('fromPageId'))).catch(() => null)))
  return pages.filter((p): p is Page => !!p && !p.deletedAt)
}
