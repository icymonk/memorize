import { FieldValue, getFirestore } from 'firebase-admin/firestore'

/**
 * WRN-01·03 오답 노트 자동 추가: spaces/{sid}/wrongNotes/{uid}_{refType}_{refId} (서버만 쓴다).
 * 같은 카드·문제를 여러 곳에서 틀리면 하나로 합치고 틀린 횟수만 늘린다. 해결했던 항목이면 오답으로 돌아온다(WRN-22)
 */
export interface WrongSource { type: 'deck' | 'test' | 'problemSet', id: string, name: string }
export interface WrongSnapshot { front?: string, back?: string, prompt?: string }

export async function recordWrong(sid: string, uid: string, refType: 'card' | 'question', refId: string, source: WrongSource, snapshot: WrongSnapshot) {
  await getFirestore().doc(`spaces/${sid}/wrongNotes/${uid}_${refType}_${refId}`).set({
    uid, refType, refId,
    sources: FieldValue.arrayUnion(source),
    wrongCount: FieldValue.increment(1),
    lastWrongAt: FieldValue.serverTimestamp(),
    consecutiveCorrect: 0,
    resolved: false,
    resolvedAt: null,
    snapshot,
  }, { merge: true })
}

/** 문제별 결과를 바로 보여 주는 시험만 제출·채점 때 넣는다. 점수만은 어느 문제를 틀렸는지 알려 주지 않으므로 넣지 않고, 마감 후·비공개는 결과가 공개될 때 (3-C2 이후) */
export const RELEASES_WRONG_NOW = ['instant']

export async function recordTestWrongs(testRef: FirebaseFirestore.DocumentReference, test: FirebaseFirestore.DocumentSnapshot, uid: string, questionIds: string[]) {
  if (!questionIds.length || !RELEASES_WRONG_NOW.includes(test.get('settings.resultRelease'))) return
  const sid = testRef.parent.parent!.id
  const paper = await testRef.collection('paper').doc('main').get()
  const items = (paper.get('items') ?? []) as { questionId: string, prompt: string }[]
  const source: WrongSource = { type: 'test', id: testRef.id, name: test.get('title') ?? '' }
  await Promise.all(questionIds.map(q => recordWrong(sid, uid, 'question', q, source, { prompt: items.find(i => i.questionId === q)?.prompt ?? '' })))
}
