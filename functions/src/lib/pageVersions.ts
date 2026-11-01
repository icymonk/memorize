import type { DocumentData, DocumentReference } from 'firebase-admin/firestore'
import type { VersionBlock } from '../../../shared/schemas/page'
import { createHash } from 'node:crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { MAX_VERSIONS } from '../../../shared/schemas/page'

export const LOCK_STALE_MS = 90_000

export async function readBlocks(page: DocumentReference): Promise<VersionBlock[]> {
  const snap = await page.collection('blocks').orderBy('order').get()
  return snap.docs.map(d => ({
    id: d.id,
    type: String(d.get('type')),
    parentBlockId: d.get('parentBlockId') ?? null,
    order: String(d.get('order')),
    attrs: d.get('attrs') ?? {},
    content: d.get('content') ?? [],
  }))
}

export const latestVersion = (page: DocumentReference) => page.collection('versions').orderBy('createdAt', 'desc').limit(1).get()

/** 블록 전체를 Storage JSON으로 저장하고 versions 문서를 만든다. 마지막 버전과 같으면 건너뛰고, 오래된 것은 MAX_VERSIONS개만 남긴다 */
export async function snapshotPage(sid: string, page: DocumentReference, createdBy: string | null, reason: 'edit' | 'restore'): Promise<string | null> {
  const [blocks, last] = await Promise.all([readBlocks(page), latestVersion(page)])
  const json = JSON.stringify(blocks)
  const hash = createHash('sha256').update(json).digest('hex')
  if (last.empty ? !blocks.length : last.docs[0]!.get('hash') === hash) return null
  const versions = page.collection('versions')
  const ref = versions.doc()
  const storagePath = `spaces/${sid}/pageVersions/${page.id}/${ref.id}.json`
  const bucket = getStorage().bucket()
  await bucket.file(storagePath).save(json, { contentType: 'application/json', resumable: false })
  await ref.set({ createdBy, createdAt: FieldValue.serverTimestamp(), blockCount: blocks.length, storagePath, hash, reason })
  const old = await versions.orderBy('createdAt', 'desc').offset(MAX_VERSIONS).get()
  await Promise.all(old.docs.map(async (d) => {
    await bucket.file(String(d.get('storagePath'))).delete({ ignoreNotFound: true })
    await d.ref.delete()
  }))
  return ref.id
}

export async function readVersion(storagePath: string): Promise<VersionBlock[]> {
  const [buf] = await getStorage().bucket().file(storagePath).download()
  return JSON.parse(buf.toString('utf8')) as VersionBlock[]
}

/** firestore.rules seesPage·editsPage·lockFree와 같은 판단 */
export function canSeePage(p: DocumentData, uid: string, groupIds: string[]) {
  if (p.ownerId === uid) return true
  if (p.deletedAt || (p.ownerStatus ?? 'active') !== 'active') return false
  return p.visibility === 'space' || [...(p.sharedWith ?? []), ...(p.editorIds ?? []), ...(p.reviewerIds ?? [])].includes(uid)
    || (p.visibility === 'group' && (p.groupIds ?? []).some((g: string) => groupIds.includes(g)))
}

export function canEditPage(p: DocumentData, uid: string) {
  const edits = p.ownerId === uid || (p.editorIds ?? []).includes(uid) || (p.root === 'shared' && (p.editPolicy ?? 'everyone') === 'everyone')
  const lock = p.lock
  const lockFree = !lock || lock.uid === uid || (lock.at?.toMillis?.() ?? 0) < Date.now() - LOCK_STALE_MS
  return !p.deletedAt && edits && lockFree
}

function textOf(nodes: unknown): string {
  if (!Array.isArray(nodes)) return ''
  return nodes.map((n: { text?: string, content?: unknown }) => (typeof n?.text === 'string' ? n.text : textOf(n?.content))).join('')
}

/** 되돌린 뒤 페이지 목록용 요약 (앱의 pageStats와 같은 필드) */
export function versionStats(blocks: VersionBlock[]) {
  const text = blocks.map(b => textOf(b.content)).filter(Boolean).join(' ')
  return { blockCount: blocks.length, textLength: text.length, excerpt: text.slice(0, 200) }
}
