import type { CheckAnswerOutput, GradeAttemptOutput, OpenTestOutput, PaperItem, StartAttemptOutput, SubmitAttemptOutput } from '../../../shared/schemas/test'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { dateKey } from '../../../shared/dates'
import { submissionId } from '../../../shared/schemas/mission'
import { gradeAnswer } from '../../../shared/schemas/question'
import { applyGrades, attemptDeadline, attemptRefInput, canStart, checkAnswerInput, gradeAttemptInput, maxScoreOf, meetsTestMission, openTestInput, startAttemptInput, SUBMIT_GRACE_MS, testTakers } from '../../../shared/schemas/test'
import { shuffle } from '../../../shared/study'
import { authedCallable } from '../lib/callable'
import { notifyMembers } from '../lib/notify'
import { recordTestWrongs } from '../lib/wrongNotes'

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
      tolerance: k.get('tolerance') ?? null,
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
  const mission = test.get('mission') as { enabled: boolean, minScore: number | null } | undefined
  let missionId: string | null = null
  if (mission?.enabled && takers.length && space.get('kind') !== 'personal') {
    const ref = spaceRef.collection('missions').doc()
    missionId = ref.id
    batch.set(ref, testMissionDoc(uid, data.testId, test, takers, mission.minScore))
  }
  batch.update(testRef, { status: 'open', participantIds: takers, maxScore, missionId, openedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
  await batch.commit()
  return { questionCount: items.length, maxScore, takerCount: takers.length }
})

const ZONE = 'Asia/Seoul'

/** TST-19·MIS-16 시험 연결 미션: 시험 대상자가 참여자, 기간은 시험 기간, 완료는 서버가 응시 결과로 기록 */
function testMissionDoc(uid: string, testId: string, test: FirebaseFirestore.DocumentSnapshot, takers: string[], minScore: number | null) {
  const settings = test.get('settings') ?? {}
  const now = FieldValue.serverTimestamp()
  return {
    title: test.get('title') ?? '',
    description: test.get('description') ?? '',
    type: 'auto',
    autoRule: { kind: 'test', targetId: testId, threshold: minScore },
    linked: { type: 'test', id: testId },
    recurrence: { kind: 'once', weekdays: [] },
    startDate: dateKey(new Date(settings.openAt ?? Date.now()), ZONE),
    endDate: settings.closeAt == null ? null : dateKey(new Date(settings.closeAt), ZONE),
    allowLate: false,
    assignees: test.get('assignees') ?? { all: true, uids: [], groupIds: [] },
    includeSelf: false,
    joinable: false,
    isPersonal: false,
    notifyOnComplete: 'feed',
    participantIds: takers,
    createdBy: uid,
    hostIds: test.get('hostIds') ?? [uid],
    reviewerIds: [],
    closedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

/** 응시 결과가 연결 미션의 완료 조건을 채우면 완료 제출을 남긴다 (이미 있으면 그대로) */
async function completeTestMission(test: FirebaseFirestore.DocumentSnapshot, taker: string, r: { isPractice: boolean, score: number, gradingStatus: 'done' | 'pending' }) {
  const missionId = test.get('missionId') as string | null | undefined
  const mission = test.get('mission') as { minScore: number | null } | undefined
  if (!missionId || !mission || !(test.get('participantIds') ?? []).includes(taker) || !meetsTestMission(mission, r)) return
  const ref = test.ref.parent.parent!.collection('missions').doc(missionId).collection('submissions').doc(submissionId(taker, 'once'))
  await ref.create({
    uid: taker, periodKey: 'once', status: 'done', content: '', pageId: null, attachments: [], late: false, reviewerUids: [],
    score: r.score, submittedAt: FieldValue.serverTimestamp(),
  }).catch((e: { code?: number }) => {
    if (e.code !== 6) throw e // ALREADY_EXISTS
  })
}

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

type Key = { answer: (number | boolean | string)[], ignoreCase: boolean, ignoreSpaces: boolean, explanation: string, rubric: string, tolerance?: number | null }

/** 제출 처리와 자동 채점 (TST-23·30). 서술형이 있으면 채점 대기 */
async function finalize(testRef: FirebaseFirestore.DocumentReference, test: FirebaseFirestore.DocumentSnapshot, attempt: FirebaseFirestore.DocumentSnapshot): Promise<SubmitAttemptOutput> {
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
  await completeTestMission(test, attempt.get('uid'), { isPractice, score, gradingStatus })
  await recordTestWrongs(testRef, test, attempt.get('uid'), Object.entries(results).filter(([, r]) => r.score === 0).map(([q]) => q))
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
    await finalize(testRef, test, open)
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
  const { testRef, test } = await loadTest(uid, data.spaceId, data.testId)
  const attempt = await testRef.collection('attempts').doc(data.attemptId).get()
  if (!attempt.exists || attempt.get('uid') !== uid) throw new HttpsError('not-found', 'attempt not found')
  if (attempt.get('submittedAt')) throw new HttpsError('failed-precondition', 'already submitted')
  const res = await finalize(testRef, test, attempt)
  const release = test.get('settings.resultRelease')
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

/** TST-31·33 진행자 채점: 서술형·부분 점수와 코멘트. 채점이 끝나면 응시자에게 알림 */
export const gradeAttempt = authedCallable(gradeAttemptInput, async ({ uid, data }): Promise<GradeAttemptOutput> => {
  const { testRef, test } = await loadTest(uid, data.spaceId, data.testId)
  if (!(test.get('hostIds') ?? []).includes(uid)) throw new HttpsError('permission-denied', 'host only')
  const db = getFirestore()
  const resultRef = testRef.collection('results').doc(data.attemptId)
  const res = await db.runTransaction(async (tx) => {
    const r = await tx.get(resultRef)
    if (!r.exists) throw new HttpsError('not-found', 'result not found')
    const before: number = r.get('score') ?? 0
    const wasDone = r.get('gradingStatus') === 'done'
    const next = applyGrades(r.get('items') ?? {}, data.scores)
    const comments = { ...(r.get('comments') ?? {}), ...data.comments }
    tx.update(resultRef, { items: next.items, score: next.score, gradingStatus: next.gradingStatus, comments, gradedBy: uid, gradedAt: FieldValue.serverTimestamp() })
    tx.update(testRef.collection('attempts').doc(data.attemptId), { gradingStatus: next.gradingStatus })
    if (!r.get('isPractice') && next.score !== before) tx.update(testRef, { 'stats.scoreSum': FieldValue.increment(next.score - before) })
    return { ...next, maxScore: r.get('maxScore') as number, taker: r.get('uid') as string, isPractice: !!r.get('isPractice'), justDone: !wasDone && next.gradingStatus === 'done' }
  })
  await completeTestMission(test, res.taker, res)
  await recordTestWrongs(testRef, test, res.taker, Object.entries(data.scores).filter(([, s]) => s === 0).map(([q]) => q))
  if (res.justDone) {
    await notifyMembers(data.spaceId, [{
      uid: res.taker, type: 'test', actorId: uid, refPath: `/s/${data.spaceId}/tests/${data.testId}/attempts/${data.attemptId}`,
      title: `'${test.get('title') ?? ''}' 채점이 끝났어요`,
      body: ['instant', 'scoreOnly'].includes(test.get('settings.resultRelease')) ? `${res.score} / ${res.maxScore}점` : '',
    }])
  }
  return { score: res.score, gradingStatus: res.gradingStatus }
})
