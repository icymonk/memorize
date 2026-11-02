import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions/v2'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { personalSpaceId } from '../../../shared/schemas/account'

/** 공간마다 본인만 보는 학습·독서 기록 (uid 필드) */
const PERSONAL = ['cardStates', 'deckProgress', 'studySessions', 'lessonProgress', 'shelf', 'readingLogs', 'quotes', 'dailySummaries', 'wrongNotes']

async function deleteFiles(prefix: string) {
  await getStorage().bucket().deleteFiles({ prefix }).catch(e => logger.warn('deleteFiles failed', { prefix, e: String(e) }))
}

/** ACC-41: 탈퇴한 사람의 내 공간·계정 문서·개인 기록·비공개 노트를 지운다. deleteShared면 공유 노트·단어장·올린 파일도 */
export async function purgeAccount(uid: string, sids: string[], deleteShared: boolean) {
  const db = getFirestore()
  for (const sid of sids) {
    if (sid === personalSpaceId(uid)) continue
    const ref = db.doc(`spaces/${sid}`)
    const writer = db.bulkWriter()
    for (const c of PERSONAL) for (const d of (await ref.collection(c).where('uid', '==', uid).get()).docs) writer.delete(d.ref)
    writer.delete(ref.collection('userPrefs').doc(uid))
    await writer.close()
    for (const p of (await ref.collection('pages').where('ownerId', '==', uid).get()).docs) {
      if (deleteShared || p.get('visibility') === 'private' || p.get('type') === 'lessonNote') await db.recursiveDelete(p.ref)
    }
    if (deleteShared) {
      for (const d of (await ref.collection('decks').where('createdBy', '==', uid).get()).docs) await db.recursiveDelete(d.ref)
      await deleteFiles(`spaces/${sid}/files/${uid}/`)
    }
  }
  await db.recursiveDelete(db.doc(`spaces/${personalSpaceId(uid)}`))
  await deleteFiles(`spaces/${personalSpaceId(uid)}/`)
  await db.recursiveDelete(db.doc(`users/${uid}`))
}

export const onAccountDeletion = onDocumentCreated({ document: 'accountDeletions/{uid}', timeoutSeconds: 540, memory: '512MiB' }, async (event) => {
  const d = event.data
  if (!d) return
  await purgeAccount(event.params.uid, (d.get('sids') ?? []) as string[], d.get('deleteShared') === true)
  await d.ref.update({ completedAt: new Date() })
})
