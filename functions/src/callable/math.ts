import type { DocumentSnapshot } from 'firebase-admin/firestore'
import type { KeyValue, ProblemRefInput, ProblemResult, ProblemView, RevealHintOutput, StoredKey, StoredQuestion } from '../../../shared/math/solve'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { checkProblemInput, drawProblemInput, hintScore, judge, problemRefInput, resolveProblem } from '../../../shared/math/solve'
import { newSeed } from '../../../shared/math/template'
import { authedCallable } from '../lib/callable'

/**
 * MATH-20~24 문제집 풀기. 정답·정답 식은 서버에만 있고, 풀이자에게는 숫자를 채운 지문·보기와
 * 끝난 뒤의 정답·해설만 간다. 풀이 기록은 problemAttempts/{uid}_{questionId} (서버만 씀)
 */
async function loadProblem(uid: string, data: ProblemRefInput) {
  const db = getFirestore()
  const spaceRef = db.doc(`spaces/${data.spaceId}`)
  const [member, set, q, k] = await Promise.all([
    spaceRef.collection('members').doc(uid).get(),
    spaceRef.collection('problemSets').doc(data.setId).get(),
    spaceRef.collection('questions').doc(data.questionId).get(),
    spaceRef.collection('questionKeys').doc(data.questionId).get(),
  ])
  if (member.get('status') !== 'active') throw new HttpsError('not-found', 'space not found')
  if (!set.exists || set.get('deletedAt') || (set.get('createdBy') !== uid && set.get('visibility') !== 'space'))
    throw new HttpsError('not-found', 'set not found')
  if (!((set.get('questionIds') as string[] | undefined) ?? []).includes(data.questionId)) throw new HttpsError('not-found', 'question not in set')
  if (!q.exists || q.get('deletedAt') || (q.get('createdBy') !== uid && q.get('sharing') !== 'space'))
    throw new HttpsError('not-found', 'question not found')
  return {
    db,
    question: q.data() as StoredQuestion & { createdBy: string, media?: ProblemView['media'] },
    key: (k.data() ?? null) as StoredKey | null,
    penalty: Number(set.get('hintPenalty') ?? 0),
    attemptRef: spaceRef.collection('problemAttempts').doc(`${uid}_${data.questionId}`),
  }
}

function result(a: DocumentSnapshot | Record<string, unknown>, r: ReturnType<typeof resolveProblem>): ProblemResult {
  const get = (f: string) => ('get' in a && typeof a.get === 'function' ? (a as DocumentSnapshot).get(f) : (a as Record<string, unknown>)[f])
  const done = !!get('done')
  return {
    tries: Number(get('tries') ?? 0),
    done,
    correct: done ? (get('correct') as boolean | null) ?? null : null,
    gaveUp: !!get('gaveUp'),
    score: done ? (get('score') as number | null) ?? null : null,
    answer: done ? r.key.answer : null,
    explanation: done ? r.explanation : null,
  }
}

/** MATH-20 문제 하나 열기: 처음이거나 fresh면 기록을 새로 시작하고 변형 문제는 숫자(seed)를 새로 뽑는다 */
export const drawProblem = authedCallable(drawProblemInput, async ({ uid, data }): Promise<ProblemView> => {
  const { db, question: q, key, attemptRef } = await loadProblem(uid, data)
  const variant = !!q.variant && !!key?.template
  const a = await db.runTransaction(async (tx) => {
    const cur = await tx.get(attemptRef)
    if (cur.exists && !data.fresh && (!variant || cur.get('seed') != null)) return cur.data()!
    const next = {
      uid, questionId: data.questionId, setId: data.setId, seed: variant ? newSeed() : null,
      tries: 0, done: false, correct: null, gaveUp: false, score: null, hintsUsed: 0, lastAnswer: null,
      isPractice: q.createdBy === uid, rounds: Number(cur.get('rounds') ?? 0) + 1, lastAt: FieldValue.serverTimestamp(),
    }
    tx.set(attemptRef, next)
    return next
  })
  const r = resolveProblem(q, key, (a.seed as number | null) ?? null)
  const used = a.done ? r.hints.length : Math.min(Number(a.hintsUsed ?? 0), r.hints.length)
  return {
    ...result(a, r),
    questionId: data.questionId,
    type: q.type,
    prompt: r.prompt,
    choices: r.choices,
    media: q.media ?? [],
    variant,
    isPractice: q.createdBy === uid,
    hintCount: r.hints.length,
    hints: r.hints.slice(0, used),
    lastAnswer: (a.lastAnswer as KeyValue[] | KeyValue | null) ?? null,
  }
})

/** MATH-20·23 바로 채점: 틀리면 다시, 맞히거나 포기하면 정답·해설. 서술형은 내고 해설로 스스로 확인 */
export const checkProblem = authedCallable(checkProblemInput, async ({ uid, data }): Promise<ProblemResult> => {
  const { db, question: q, key, penalty, attemptRef } = await loadProblem(uid, data)
  return db.runTransaction(async (tx) => {
    const a = await tx.get(attemptRef)
    if (!a.exists) throw new HttpsError('failed-precondition', 'draw first')
    const r = resolveProblem(q, key, a.get('seed') ?? null)
    if (a.get('done')) return result(a, r)
    let patch: Record<string, unknown>
    if (data.giveUp) {
      patch = { done: true, gaveUp: true, correct: false, score: 0 }
    }
    else {
      if (data.answer == null || (typeof data.answer === 'string' && !data.answer.trim()) || (Array.isArray(data.answer) && !data.answer.length))
        throw new HttpsError('invalid-argument', 'answer required')
      const ok = judge(q.type, r, data.answer)
      const tries = Number(a.get('tries') ?? 0) + 1
      patch = ok === false
        ? { tries, lastAnswer: data.answer }
        : { tries, lastAnswer: data.answer, done: true, correct: ok, score: ok ? hintScore(Number(a.get('hintsUsed') ?? 0), penalty) : null }
    }
    patch.lastAt = FieldValue.serverTimestamp()
    tx.update(attemptRef, patch)
    return result({ ...a.data(), ...patch }, r)
  })
})

/** MATH-21 힌트 한 단계 더 열기 (사용 수를 기록하고, 문제집 설정에 따라 감점) */
export const revealHint = authedCallable(problemRefInput, async ({ uid, data }): Promise<RevealHintOutput> => {
  const { db, question: q, key, attemptRef } = await loadProblem(uid, data)
  return db.runTransaction(async (tx) => {
    const a = await tx.get(attemptRef)
    if (!a.exists) throw new HttpsError('failed-precondition', 'draw first')
    const r = resolveProblem(q, key, a.get('seed') ?? null)
    if (a.get('done')) return { hints: r.hints, hintCount: r.hints.length }
    const used = Math.min(Number(a.get('hintsUsed') ?? 0) + 1, r.hints.length)
    tx.update(attemptRef, { hintsUsed: used, lastAt: FieldValue.serverTimestamp() })
    return { hints: r.hints.slice(0, used), hintCount: r.hints.length }
  })
})
