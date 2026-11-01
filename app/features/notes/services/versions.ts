import type { Firestore, Timestamp } from 'firebase/firestore'
import type { Functions } from 'firebase/functions'
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { MAX_VERSIONS } from '#shared/schemas/page'
import { callFn } from '~/lib/functions'

/** NOTE-63: 서버가 남긴 버전. 블록 내용은 getVersion으로 받는다 */
export interface PageVersion {
  id: string
  createdBy: string | null
  createdAt: Timestamp | null
  blockCount: number
  reason: 'edit' | 'restore'
}

export async function listVersions(db: Firestore, sid: string, pageId: string): Promise<PageVersion[]> {
  const snap = await getDocs(query(collection(db, 'spaces', sid, 'pages', pageId, 'versions'), orderBy('createdAt', 'desc'), limit(MAX_VERSIONS)))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as PageVersion)
}

export const getVersion = (fns: Functions, spaceId: string, pageId: string, versionId: string) => callFn(fns, 'getVersion', { spaceId, pageId, versionId })
export const restoreVersion = (fns: Functions, spaceId: string, pageId: string, versionId: string) => callFn(fns, 'restoreVersion', { spaceId, pageId, versionId })
