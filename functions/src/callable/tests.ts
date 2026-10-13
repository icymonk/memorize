import type { CheckAnswerOutput, OpenTestOutput, PaperItem, StartAttemptOutput, SubmitAttemptOutput } from '../../../shared/schemas/test'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { gradeAnswer } from '../../../shared/schemas/question'
import { attemptDeadline, attemptRefInput, canStart, checkAnswerInput, maxScoreOf, openTestInput, startAttemptInput, SUBMIT_GRACE_MS, testTakers } from '../../../shared/schemas/test'
import { shuffle } from '../../../shared/study'
import { authedCallable } from '../lib/callable'

/**
 * TST-10·16 시험 열기: 진행자가 고른 문제를 시험지 사본(paper)과 서버 전용 정답 사본(secret)으로 굳히고 대상자를 정한다.
 * 문제를 나중에 고치거나 지워도 이미 연 시험은 그대로 남는다.
 */
export const openTest = authedCallable(openTestInput, async ({ uid, data }): Promise<OpenTestOutput> => {
  const db = getFirestore()
  const spaceRef = db.doc(`spaces/${data.spaceId}`)
  const testRef = spaceRef.collection('tests').doc(data.testId)
  const [space, member, test] = await Promise.all([spaceRef.get(), spaceRef.collection('members').doc(uid).get(), testRef.get()])
  if (!space.exists || member.get('status') !== 'active' || !test.exists || test.get('deletedAt'))
    throw new HttpsError('not-found', 'test not found')
  const hostIds: string[] = test.get('hostIds') ?? []
  if (!hostIds.includes(uid)) throw new HttpsError('permission-denied', 'not a host')
  if (test.get('status') !== 'draft') throw new HttpsError('failed-precondition', 'already open')
  const refs: { questionId: string, points: number }[] = test.get('questionRefs') ?? []
  if (!refs.length) throw new HttpsError('failed-precondition', 'no questions')

  const qs = await db.getAll(...refs.map(r => spaceRef.collection('questions').doc(r.questionId)))
  const keys = await db.getAll(...refs.map(r => spaceRef.collection('questionKeys').doc(r.questionId)))
  const items: PaperItem[] = []
  const secret: Record<string, unknown> = {}
  refs.forEach((r, i) => {
    const q = qs[i]!
    if (!q.exists || q.get('deletedAt') || (q.get('createdBy') !== uid && q.get('sharing') !== 'space'))
      throw new HttpsError('failed-precondition', `question unavailable: ${r.questionId}`)
    items.push({ questionId: q.id, type: q.get('type'), prompt: q.get('prompt'), choices: q.get('choices') ?? [], media: q.get('media') ?? [], points: r.points })
    const k = keys[i]!
    secret[q.id] = {
      answer: k.get('answer') ?? [],
      ignoreCase: k.get('ignoreCase') ?? true,
      ignoreSpaces: k.get('ignoreSpaces') ?? false,
      explanation: k.get('explanation') ?? '',
      rubric: k.get('rubric') ?? '',
    }
  })

  let takers: string[] = []
  if (space.get('kind') === 'workspace') {
    const members = await spaceRef.collection('members').where('status', '==', 'active').get()
    const groups = Object.fromEntries(members.docs.map(m => [m.id, (m.get('groupIds') as string[] | undefined) ?? []]))
    takers = testTakers(test.get('assignees') ?? { all: true, uids: [], groupIds: [] }, hostIds, members.docs.map(m => m.id), groups)
  }
  const maxScore = maxScoreOf(refs)
  const batch = db.batch()
  batch.set(testRef.collection('paper').doc('main'), { items, hostIds })
  batch.set(testRef.collection('secret').doc('key'), { items: secret })
  batch.update(testRef, { status: 'open', participantIds: takers, maxScore, openedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
  await batch.commit()
  return { questionCount: items.length, maxScore, takerCount: takers.length }
})

interface Loaded { testRef: FirebaseFirestore.DocumentReference, test: FirebaseFirestore.DocumentSnapshot }

async function loadTest(uid: string, spaceId: string, testId: string): Promise<Loaded> {
  const db = getFirestore()
  const spaceRef = db.doc(`spaces/${spaceId}`)
  const testRef = spaceRef.collection('tests').doc(testId)
  const [member, test] = await Promise.all([spaceRef.collection('members').doc(uid).get(), testRef.get()])
  if (member.get('status') !== 'active' || !test.exists || test.get('deletedAt') || test.get('status') === 'draft')
    throw new HttpsError('not-found', 'test not found')
  const allowed = (test.get('participantIds') ?? []).includes(uid) || (test.get('hostIds') ?? []).includes(uid)
  if (!allowed) throw new HttpsError('permission-denied', 'not a taker')
  return { testRef, test }
}

type Key = { answer: (number | boolean | string)[], ignoreCase: boolean, ignoreSpaces: boolean, explanation: string, rubric: string }

/** 제출 처리와 자동 채점 (TST-23·30). 서술형이 있으면 채점 대기 */
async function finalize(testRef: FirebaseFirestore.DocumentReference, attempt: FirebaseFirestore.DocumentSnapshot): Promise<SubmitAttemptOutput> {
  const [paper, secret] = await Promise.all([testRef.collection('paper').doc('main').get(), testRef.collection('secret').doc('key').get()])
  const items: PaperItem[] = paper.get('items') ?? []
  const keys: Record<string, Key> = secret.get('items') ?? {}
  const answers: Record<string, unknown> = attempt.get('answers') ?? {}
  const results: Record<string, { score: number | null, points: number }> = {}
  let score = 0
  let pending = false
  for (const it of items) {
    const k = keys[it.questionId]
    const s = k ? gradeAnswer(it.type, k, answers[it.questionId], it.points) : 0
    if (s == null) pending = true
    else score += s
    results[it.questionId] = { score: s, points: it.points }
  }
  const maxScore = maxScoreOf(items)
  const gradingStatus = pending ? 'pending' : 'done'
  const isPractice = !!attempt.get('isPractice')
  const db = getFirestore()
  const batch = db.batch()
  batch.update(attempt.ref, { submittedAt: FieldValue.serverTimestamp(), gradingStatus })
  batch.set(testRef.collection('results').doc(attempt.id), {
    uid: attempt.get('uid'), isPractice, score, maxScore, gradingStatus, items: results, comments: {},
    hostIds: attempt.get('hostIds') ?? [], submittedAt: FieldValue.serverTimestamp(),
  })
  if (!isPractice) batch.update(testRef, { 'stats.attempts': FieldValue.increment(1), 'stats.scoreSum': FieldValue.increment(score) })
  await batch.commit()
  return { score, maxScore, gradingStatus }
}

/** TST-21·22 응시 시작 (진행 중인 응시가 있으면 이어서). 시각은 서버 기준 */
export const startAttempt = authedCallable(startAttemptInput, async ({ uid, data }): Promise<StartAttemptOutput> => {
  const { testRef, test } = await loadTest(uid, data.spaceId, data.testId)
  const now = Date.now()
  const mine = await testRef.collection('attempts').where('uid', '==', uid).get()
  const open = mine.docs.find(d => !d.get('submittedAt'))
  if (open) {
    const deadline = open.get('deadlineAt')?.toMillis?.() ?? null
    if (deadline == null || now < deadline + SUBMIT_GRACE_MS) return { attemptId: open.id, nowMs: now }
    await finalize(testRef, open)
  }
  const settings = test.get('settings')
  const isHost = (test.get('hostIds') ?? []).includes(uid)
  const used = mine.docs.filter(d => !d.get('isPractice') && (d.get('submittedAt') || d.id === open?.id)).length
  const status = canStart({ status: test.get('status'), settings }, used, now)
  if (status !== 'ok' && !isHost) throw new HttpsError('failed-precondition', status)
  const paper = await testRef.collection('paper').doc('main').get()
  const items: PaperItem[] = paper.get('items') ?? []
  const order = settings.shuffleQuestions ? shuffle(items.map(i => i.questionId)) : items.map(i => i.questionId)
  const choiceOrder: Record<string, number[]> = {}
  if (settings.shuffleChoices) {
    for (const it of items) if ((it.type === 'single' || it.type === 'multi') && it.choices.length) choiceOrder[it.questionId] = shuffle(it.choices.map((_, i) => i))
  }
  const deadline = attemptDeadline(now, settings)
  const ref = testRef.collection('attempts').doc()
  await ref.set({
    uid, isPractice: !!settings.practice || isHost, startedAt: Timestamp.fromMillis(now), deadlineAt: deadline == null ? null : Timestamp.fromMillis(deadline),
    submittedAt: null, order, choiceOrder, answers: {}, maxScore: maxScoreOf(items), hostIds: test.get('hostIds') ?? [], gradingStatus: null,
  })
  return { attemptId: ref.id, nowMs: now }
})

/** TST-23 제출 (시간 초과 자동 제출도 이 함수) */
export const submitAttempt = authedCallable(attemptRefInput, async ({ uid, data }): Promise<SubmitAttemptOutput> => {
  const { testRef } = await loadTest(uid, data.spaceId, data.testId)
  const attempt = await testRef.collection('attempts').doc(data.attemptId).get()
  if (!attempt.exists || attempt.get('uid') !== uid) throw new HttpsError('not-found', 'attempt not found')
  if (attempt.get('submittedAt')) throw new HttpsError('failed-precondition', 'already submitted')
  const res = await finalize(testRef, attempt)
  const release = (await testRef.get()).get('settings.resultRelease')
  return attempt.get('isPractice') || release === 'instant' || release === 'scoreOnly' ? res : { ...res, score: null }
})

/** TST-17 연습 모드: 문제마다 바로 정답 확인 */
export const checkAnswer = authedCallable(checkAnswerInput, async ({ uid, data }): Promise<CheckAnswerOutput> => {
  const { testRef } = await loadTest(uid, data.spaceId, data.testId)
  const attempt = await testRef.collection('attempts').doc(data.attemptId).get()
  if (!attempt.exists || attempt.get('uid') !== uid || !attempt.get('isPractice')) throw new HttpsError('permission-denied', 'practice only')
  const [paper, secret] = await Promise.all([testRef.collection('paper').doc('main').get(), testRef.collection('secret').doc('key').get()])
  const it = (paper.get('items') as PaperItem[] ?? []).find(i => i.questionId === data.questionId)
  const k = (secret.get('items') ?? {})[data.questionId] as Key | undefined
  if (!it || !k) throw new HttpsError('not-found', 'question not found')
  const given = (attempt.get('answers') ?? {})[data.questionId]
  return { score: gradeAnswer(it.type, k, given, it.points), points: it.points, answer: k.answer, explanation: k.explanation }
})
