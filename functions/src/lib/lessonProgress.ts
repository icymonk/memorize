import { FieldValue, getFirestore } from 'firebase-admin/firestore'

/** CRS-21 자동 완료: 이 시험을 연결했거나(completion 'test') 이 숙제 미션을 붙인(completion 'mission') 레슨을 완료로 기록한다 */
export async function completeLessons(sid: string, uid: string, by: 'test' | 'mission', id: string) {
  const db = getFirestore()
  const lessons = db.collectionGroup('lessons')
  const snap = await (by === 'test' ? lessons.where('linkedTestIds', 'array-contains', id) : lessons.where('missionId', '==', id)).get()
  const hits = snap.docs.filter(d => d.ref.path.startsWith(`spaces/${sid}/courses/`) && d.get('completion') === by)
  if (!hits.length) return
  const hide = (await db.doc(`spaces/${sid}/members/${uid}`).get()).get('hideProgress') === true
  await Promise.all(hits.map(async (l) => {
    const ref = db.doc(`spaces/${sid}/lessonProgress/${uid}_${l.id}`)
    if ((await ref.get()).get('completedAt')) return
    const now = FieldValue.serverTimestamp()
    await ref.set({ uid, courseId: l.ref.parent.parent!.id, lessonId: l.id, completedAt: now, shared: !hide, updatedAt: now }, { merge: true })
  }))
}
