import type { DocumentData } from 'firebase-admin/firestore'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'

interface Ref { refType: string, refId: string }

/** 연결 블록이 가리키는 대상: 페이지 링크(NOTE-24) 또는 앱 카드(단어장·책·미션, NOTE-25) */
function refOf(b: DocumentData | undefined): Ref | null {
  if (b?.type === 'pageLink' && typeof b.attrs?.pageId === 'string' && b.attrs.pageId) return { refType: 'page', refId: b.attrs.pageId }
  if (b?.type === 'appEmbed' && typeof b.attrs?.refId === 'string' && b.attrs.refId) return { refType: String(b.attrs.refType), refId: b.attrs.refId }
  return null
}

const linkId = (pageId: string, r: Ref) => `${pageId}_${r.refType}_${r.refId}`.replace(/\//g, '_').slice(0, 700)

/** NOTE-24·25 역링크: pageLinks/{from}_{refType}_{refId}. 같은 대상을 가리키는 블록이 남아 있으면 지우지 않는다 */
export const onBlockWritten = onDocumentWritten('spaces/{sid}/pages/{pageId}/blocks/{blockId}', async (event) => {
  const { sid, pageId } = event.params
  const before = refOf(event.data?.before.data())
  const after = refOf(event.data?.after.data())
  if (before?.refType === after?.refType && before?.refId === after?.refId) return
  const db = getFirestore()
  const links = db.collection(`spaces/${sid}/pageLinks`)
  if (after && !(after.refType === 'page' && after.refId === pageId))
    await links.doc(linkId(pageId, after)).set({ fromPageId: pageId, ...after, updatedAt: FieldValue.serverTimestamp() })
  if (before) {
    const blocks = db.collection(`spaces/${sid}/pages/${pageId}/blocks`)
    const still = before.refType === 'page'
      ? await blocks.where('type', '==', 'pageLink').where('attrs.pageId', '==', before.refId).limit(1).get()
      : await blocks.where('type', '==', 'appEmbed').where('attrs.refId', '==', before.refId).limit(1).get()
    if (still.empty) await links.doc(linkId(pageId, before)).delete()
  }
})
