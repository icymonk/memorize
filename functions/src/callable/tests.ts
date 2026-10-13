import type { OpenTestOutput, PaperItem } from '../../../shared/schemas/test'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { maxScoreOf, openTestInput, testTakers } from '../../../shared/schemas/test'
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
