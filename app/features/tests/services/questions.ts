import type { QuestionInput, QuestionKeyInput } from '#shared/schemas/question'
import type { Firestore, Timestamp } from 'firebase/firestore'
import { collection, doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'

export interface Question extends QuestionInput {
  copiedFrom?: { spaceId: string, questionId: string, rev: number, spaceName: string }
  id: string
  createdBy: string
  rev: number
  deletedAt: Timestamp | null
  createdAt?: Timestamp
  updatedAt?: Timestamp
}
export interface QuestionKey extends QuestionKeyInput { authorIds: string[], answerVisibility: QuestionInput['answerVisibility'] }

const questionsOf = (db: Firestore, sid: string) => collection(db, 'spaces', sid, 'questions')
const keyRef = (db: Firestore, sid: string, id: string) => doc(db, 'spaces', sid, 'questionKeys', id)
const toList = (docs: { id: string, data: () => object }[]) => docs.map(d => ({ id: d.id, ...d.data() }) as Question).filter(q => !q.deletedAt)

/** TST-04 내 문제 / 공유된 문제 */
export async function listQuestions(db: Firestore, sid: string, uid: string): Promise<{ mine: Question[], shared: Question[] }> {
  const [mine, shared] = await Promise.all([
    getDocs(query(questionsOf(db, sid), where('createdBy', '==', uid))),
    getDocs(query(questionsOf(db, sid), where('sharing', '==', 'space'))),
  ])
  const byNew = (a: Question, b: Question) => (b.updatedAt?.toMillis() ?? Infinity) - (a.updatedAt?.toMillis() ?? Infinity)
  return { mine: toList(mine.docs).sort(byNew), shared: toList(shared.docs).sort(byNew) }
}

/** TST-07 출제자이거나 정답 공개된 문제만 읽힌다. 못 읽으면 null */
export async function getQuestionKey(db: Firestore, sid: string, id: string): Promise<QuestionKey | null> {
  try {
    const snap = await getDoc(keyRef(db, sid, id))
    return snap.exists() ? snap.data() as QuestionKey : null
  }
  catch {
    return null
  }
}

/** 문제와 정답을 한 번에 저장한다 (규칙이 정답 문서에서 문제의 출제자를 확인) */
export async function saveQuestion(db: Firestore, sid: string, uid: string, q: QuestionInput, k: QuestionKeyInput, existing?: Question | null) {
  const ref = existing ? doc(questionsOf(db, sid), existing.id) : doc(questionsOf(db, sid))
  const batch = writeBatch(db)
  const now = serverTimestamp()
  batch.set(ref, existing
    ? { ...q, createdBy: existing.createdBy, rev: existing.rev + 1, deletedAt: null, createdAt: existing.createdAt ?? now, updatedAt: now }
    : { ...q, createdBy: uid, rev: 1, deletedAt: null, createdAt: now, updatedAt: now })
  batch.set(keyRef(db, sid, ref.id), { ...k, authorIds: [existing?.createdBy ?? uid], answerVisibility: q.answerVisibility })
  await batch.commit()
  return ref.id
}

/** 시험에 쓰였을 수 있으므로 지우지 않고 표시만 한다 (TST 예외 상황) */
export async function deleteQuestion(db: Firestore, sid: string, q: Question) {
  const batch = writeBatch(db)
  batch.update(doc(questionsOf(db, sid), q.id), { deletedAt: serverTimestamp(), updatedAt: serverTimestamp() })
  await batch.commit()
}
