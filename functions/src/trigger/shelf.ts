import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'

/** READ-03·13: 워크스페이스 책장 묶음 `books/{bookKey}`는 멤버 책장에서 다시 계산한다. 내 공간은 건너뛴다 */
export const onShelfWritten = onDocumentWritten('spaces/{sid}/shelf/{id}', async (event) => {
  const { sid } = event.params
  const s = event.data?.after.data() ?? event.data?.before.data()
  if (!s?.bookKey) return
  const db = getFirestore()
  if ((await db.doc(`spaces/${sid}`).get()).get('kind') !== 'workspace') return
  const ref = db.doc(`spaces/${sid}/books/${s.bookKey}`)
  const all = (await db.collection(`spaces/${sid}/shelf`).where('bookKey', '==', s.bookKey).get()).docs.map(d => d.data())
  if (!all.length) {
    await ref.delete()
    return
  }
  const rated = all.map(x => x.rating).filter((r): r is number => typeof r === 'number')
  const head = all.find(x => x.cover) ?? all[0]!
  await ref.set({
    bookKey: s.bookKey,
    title: head.title ?? '',
    authors: head.authors ?? [],
    cover: head.cover ?? '',
    readerUids: all.map(x => x.uid),
    readingCount: all.filter(x => x.status === 'reading').length,
    doneCount: all.filter(x => x.status === 'done').length,
    avgRating: rated.length ? Math.round(rated.reduce((a, b) => a + b, 0) / rated.length * 10) / 10 : null,
    lastActivityAt: FieldValue.serverTimestamp(),
  }, { merge: true })
})
