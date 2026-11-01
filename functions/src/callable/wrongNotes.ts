import type { CheckWrongOutput, WrongView } from '../../../shared/wrong-notes'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { judge, resolveProblem } from '../../../shared/math/solve'
import { newSeed } from '../../../shared/math/template'
import { gradeAnswer as gradeWord } from '../../../shared/study'
import { checkWrongInput, nextStreak, wrongRefInput } from '../../../shared/wrong-notes'
import { authedCallable } from '../lib/callable'

/** WRN-20~22 오답 다시 풀기: 단어는 뜻을 보고 쓰기, 문제는 원래 형태(변형 문제는 새 숫자). 연속 2번 맞히면 해결 */
async function load(uid: string, spaceId: string, noteId: string) {
  const db = getFirestore()
  const spaceRef = db.doc(`spaces/${spaceId}`)
  const [member, note] = await Promise.all([spaceRef.collection('members').doc(uid).get(), spaceRef.collection('wrongNotes').doc(noteId).get()])
  if (member.get('status') !== 'active' || !note.exists || note.get('uid') !== uid) throw new HttpsError('not-found', 'note not found')
  const refId = note.get('refId') as string
  if (note.get('refType') === 'card') {
    const deckId = ((note.get('sources') ?? []) as { type: string, id: string }[]).find(s => s.type === 'deck')?.id
    const card = deckId ? await spaceRef.collection('decks').doc(deckId).collection('cards').doc(refId).get() : null
    return { db, note, card: card?.exists ? card : null, question: null, key: null }
  }
  const [q, k] = await Promise.all([spaceRef.collection('questions').doc(refId).get(), spaceRef.collection('questionKeys').doc(refId).get()])
  const ok = q.exists && !q.get('deletedAt') && (q.get('createdBy') === uid || q.get('sharing') === 'space')
  return { db, note, card: null, question: ok ? q : null, key: ok && k.exists ? k : null }
}

export const drawWrong = authedCallable(wrongRefInput, async ({ uid, data }): Promise<WrongView> => {
  const { note, card, question, key } = await load(uid, data.spaceId, data.noteId)
  const snap = (note.get('snapshot') ?? {}) as { front?: string, back?: string, prompt?: string }
  if (note.get('refType') === 'card') {
    const back = card ? ((card.get('back') as string[] | undefined) ?? []).join(', ') : snap.back ?? ''
    return { noteId: note.id, refType: 'card', type: 'card', prompt: back, choices: [], missing: !card }
  }
  if (!question || !key) return { noteId: note.id, refType: 'question', type: 'short', prompt: snap.prompt ?? '', choices: [], missing: true }
  const seed = question.get('variant') ? newSeed() : null
  await note.ref.update({ retrySeed: seed })
  const r = resolveProblem(question.data() as never, key.data() as never, seed)
  return { noteId: note.id, refType: 'question', type: question.get('type'), prompt: r.prompt, choices: r.choices, missing: false }
})

export const checkWrong = authedCallable(checkWrongInput, async ({ uid, data }): Promise<CheckWrongOutput> => {
  const { note, card, question, key } = await load(uid, data.spaceId, data.noteId)
  let correct: boolean
  let answer: string | null = null
  let explanation: string | null = null
  if (note.get('refType') === 'card') {
    if (!card || typeof data.answer !== 'string') throw new HttpsError('failed-precondition', 'cannot grade')
    correct = gradeWord(data.answer, [card.get('front')]) !== 'wrong'
    answer = card.get('front')
  }
  else {
    if (!question || !key) throw new HttpsError('failed-precondition', 'cannot grade')
    const r = resolveProblem(question.data() as never, key.data() as never, note.get('retrySeed') ?? null)
    correct = judge(question.get('type'), r, data.answer) !== false
    const sees = question.get('createdBy') === uid || ((key.get('authorIds') as string[] | undefined) ?? []).includes(uid) || key.get('answerVisibility') === 'space'
    if (sees) {
      const t = question.get('type')
      answer = t === 'single' || t === 'multi' ? r.key.answer.map(i => r.choices[Number(i)] ?? '').join(', ') : t === 'ox' ? (r.key.answer[0] ? 'O' : 'X') : r.key.answer.join(', ')
      explanation = r.explanation || null
    }
  }
  const s = nextStreak(Number(note.get('consecutiveCorrect') ?? 0), correct)
  await note.ref.update(correct
    ? { consecutiveCorrect: s.consecutiveCorrect, ...(s.resolved ? { resolved: true, resolvedAt: FieldValue.serverTimestamp() } : {}) }
    : { consecutiveCorrect: 0, wrongCount: FieldValue.increment(1), lastWrongAt: FieldValue.serverTimestamp(), resolved: false, resolvedAt: null })
  return { correct, consecutiveCorrect: s.consecutiveCorrect, resolved: s.resolved, answer, explanation }
})
