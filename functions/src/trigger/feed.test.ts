import { beforeEach, describe, expect, it, vi } from 'vitest'

/** 피드·알림 트리거를 메모리 Firestore로 돌린다 (CMN-10·30) */
const store = new Map<string, Record<string, any>>()
const added: { path: string, data: any }[] = []
const created: { path: string, data: any }[] = []
const updated: { path: string, data: any }[] = []
let seq = 0

function snap(path: string) {
  const data = store.get(path)
  return {
    exists: !!data,
    ref: docRef(path),
    data: () => data,
    get: (field: string) => field.split('.').reduce<any>((o, k) => o?.[k], data),
  }
}
function docRef(path: string): any {
  return { path, get: async () => snap(path), update: async (data: any) => { updated.push({ path, data }) } }
}
const fakeDb = {
  doc: docRef,
  collection: (path: string) => ({
    add: async (data: any) => { added.push({ path, data }) },
    doc: () => docRef(`${path}/auto${++seq}`),
  }),
  batch: () => ({ create: (ref: any, data: any) => { created.push({ path: ref.path, data }) }, commit: async () => {} }),
}

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => fakeDb,
  FieldValue: { serverTimestamp: () => 'now', increment: (n: number) => ({ increment: n }) },
}))

const { onDeckCreated } = await import('./deck')
const { onPageCreated, onPageReviewersChanged } = await import('./page')
const { onStudySessionCreated } = await import('./studySession')
const { onCommentWritten } = await import('./comment')
const { onMissionCreated, onSubmissionWritten } = await import('./mission')

const createdEvent = (params: Record<string, string>, data: any) => ({ params, data: { data: () => data } }) as any

beforeEach(() => {
  store.clear()
  added.length = 0
  created.length = 0
  updated.length = 0
  store.set('users/u1', { displayName: '민수', timezone: 'Asia/Seoul' })
  store.set('users/u2', { displayName: '지원' })
  store.set('users/u3', { displayName: '하나', notifications: { mention: { inApp: false } } })
  for (const uid of ['u1', 'u2', 'u3']) store.set(`spaces/s1/members/${uid}`, { status: 'active' })
})

describe('activity triggers (CMN-10)', () => {
  it('a space-visible new deck is a major activity; private decks are not posted', async () => {
    await onDeckCreated.run(createdEvent({ sid: 's1', deckId: 'd1' }, { visibility: 'space', createdBy: 'u1', title: 'JLPT' }))
    await onDeckCreated.run(createdEvent({ sid: 's1', deckId: 'd2' }, { visibility: 'private', createdBy: 'u1', title: '비밀' }))
    expect(added).toHaveLength(1)
    expect(added[0]!.path).toBe('spaces/s1/activities')
    expect(added[0]!.data).toMatchObject({ uid: 'u1', module: 'vocab', type: 'deckCreated', size: 'major', refId: 'd1', visibility: 'space', data: { title: 'JLPT', copied: false } })
    expect(added[0]!.data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('only space-visible journals are posted', async () => {
    await onPageCreated.run(createdEvent({ sid: 's1', pageId: 'p1' }, { type: 'journal', visibility: 'space', ownerId: 'u1', props: { date: '2026-10-12' } }))
    await onPageCreated.run(createdEvent({ sid: 's1', pageId: 'p2' }, { type: 'page', visibility: 'space', ownerId: 'u1' }))
    await onPageCreated.run(createdEvent({ sid: 's1', pageId: 'p3' }, { type: 'journal', visibility: 'private', ownerId: 'u1' }))
    expect(added.map(a => a.data)).toEqual([expect.objectContaining({ type: 'journal', size: 'minor', refId: 'p1', data: { date: '2026-10-12' } })])
  })

  it('study sessions are minor; members hiding progress get private activities; empty sessions are skipped', async () => {
    store.set('spaces/s1/members/u2', { status: 'active', hideProgress: true })
    store.set('spaces/s1/decks/d1', { title: 'JLPT' })
    const endedAt = { toDate: () => new Date('2026-10-11T16:30:00Z') }
    await onStudySessionCreated.run(createdEvent({ sid: 's1', id: 'a' }, { uid: 'u1', deckId: 'd1', mode: 'review', cards: 20, correct: 18, durationSec: 300, endedAt }))
    await onStudySessionCreated.run(createdEvent({ sid: 's1', id: 'b' }, { uid: 'u2', deckId: 'd1', mode: 'review', cards: 5, correct: 5, durationSec: 60 }))
    await onStudySessionCreated.run(createdEvent({ sid: 's1', id: 'c' }, { uid: 'u1', deckId: 'd1', mode: 'review', cards: 0 }))
    expect(added).toHaveLength(2)
    expect(added[0]!.data).toMatchObject({ uid: 'u1', type: 'session', visibility: 'space', date: '2026-10-12', data: { cards: 20, minutes: 5, title: 'JLPT' } })
    expect(added[1]!.data).toMatchObject({ uid: 'u2', visibility: 'private' })
  })
})

describe('comment notifications (CMN-22·30)', () => {
  const written = (before: any, after: any) => ({
    params: { sid: 's1', id: 'c1' },
    data: {
      before: { exists: !!before, data: () => before },
      after: { exists: !!after, data: () => after },
    },
  }) as any

  beforeEach(() => {
    store.set('spaces/s1/pages/p1', { title: '노트', ownerId: 'u2' })
  })

  it('notifies mentioned members and the page owner, never the author, left members or muted types', async () => {
    store.set('users/u4', {})
    store.set('spaces/s1/members/u4', { status: 'left' })
    const c = { targetType: 'page', targetId: 'p1', uid: 'u1', body: '확인해 줘', mentions: ['u1', 'u3', 'u4'] }
    await onCommentWritten.run(written(null, c))
    expect(updated).toEqual([{ path: 'spaces/s1/pages/p1', data: { commentCount: { increment: 1 } } }])
    expect(created).toHaveLength(1)
    expect(created[0]!.path).toMatch(/^users\/u2\/notifications\//)
    expect(created[0]!.data).toMatchObject({ type: 'comment', actorId: 'u1', refPath: '/s/s1/notes/p1', title: "민수님이 '노트'에 댓글을 남겼어요", read: false })
  })

  it('a mention of the owner is sent once as a mention', async () => {
    await onCommentWritten.run(written(null, { targetType: 'page', targetId: 'p1', uid: 'u1', body: 'hi', mentions: ['u2'] }))
    expect(created.map(n => [n.path.split('/')[1], n.data.type])).toEqual([['u2', 'mention']])
  })

  it('deleting a comment only decrements the count; edits change nothing', async () => {
    const c = { targetType: 'page', targetId: 'p1', uid: 'u1', body: 'hi', mentions: [] }
    await onCommentWritten.run(written(c, null))
    await onCommentWritten.run(written(c, { ...c, body: 'edited' }))
    expect(updated).toEqual([{ path: 'spaces/s1/pages/p1', data: { commentCount: { increment: -1 } } }])
    expect(created).toHaveLength(0)
  })
})

describe('feedback notifications (CMN-23·24)', () => {
  const updatedEvent = (before: any, after: any) => ({
    params: { sid: 's1', pageId: 'p1' },
    data: { before: { get: (k: string) => before[k] }, after: { data: () => after } },
  }) as any

  it('notifies only newly requested reviewers, not the owner or muted members', async () => {
    store.set('users/u3', { displayName: '하나', notifications: { feedbackRequest: { inApp: false } } })
    store.set('users/u4', {})
    store.set('spaces/s1/members/u4', { status: 'active' })
    await onPageReviewersChanged.run(updatedEvent({ reviewerIds: ['u2'] }, { title: '일지', ownerId: 'u1', reviewerIds: ['u1', 'u2', 'u3', 'u4'] }))
    expect(created.map(n => [n.path.split('/')[1], n.data.type, n.data.title])).toEqual([['u4', 'feedbackRequest', "민수님이 '일지'에 피드백을 요청했어요"]])
  })

  it('new feedback counts as feedback and notifies the page owner with the stamp', async () => {
    store.set('spaces/s1/pages/p1', { title: '노트', ownerId: 'u2' })
    const fb = { targetType: 'page', targetId: 'p1', uid: 'u1', kind: 'feedback', stamp: 'great', body: '좋아요', mentions: [] }
    await onCommentWritten.run({ params: { sid: 's1', id: 'fb' }, data: { before: { exists: false }, after: { exists: true, data: () => fb } } } as any)
    expect(updated).toEqual([{ path: 'spaces/s1/pages/p1', data: { feedbackCount: { increment: 1 } } }])
    expect(created.map(n => [n.path.split('/')[1], n.data.type, n.data.body])).toEqual([['u2', 'feedback', '💮 참 잘했어요 · 좋아요']])
  })
})

describe('mission notifications (MIS-40)', () => {
  const subEvent = (before: any, after: any) => ({
    params: { sid: 's1', mid: 'm1', subId: 'u2_once' },
    data: { before: { data: () => before }, after: { data: () => after } },
  }) as any
  const sub = { uid: 'u2', periodKey: 'once', content: '다 읽었어요', reviewerUids: ['u1', 'u3'] }

  it('new shared missions notify participants except the host; personal goals notify nobody', async () => {
    await onMissionCreated.run(createdEvent({ sid: 's1', mid: 'm1' }, { title: '독후감', createdBy: 'u1', isPersonal: false, participantIds: ['u1', 'u2'] }))
    await onMissionCreated.run(createdEvent({ sid: 's1', mid: 'm2' }, { title: '나만', createdBy: 'u2', isPersonal: true, participantIds: ['u2'] }))
    expect(created.map(n => [n.path.split('/')[1], n.data.type, n.data.title, n.data.refPath])).toEqual([['u2', 'mission', "민수님이 미션 '독후감'에 나를 넣었어요", '/s/s1/missions/m1']])
  })

  it('a submission notifies reviewers; a verdict notifies the submitter once', async () => {
    store.set('spaces/s1/missions/m1', { title: '독후감' })
    await onSubmissionWritten.run(subEvent(undefined, { ...sub, status: 'submitted' }))
    expect(created.map(n => [n.path.split('/')[1], n.data.type, n.data.body])).toEqual([['u1', 'missionReview', '다 읽었어요'], ['u3', 'missionReview', '다 읽었어요']])
    created.length = 0
    await onSubmissionWritten.run(subEvent({ ...sub, status: 'submitted' }, { ...sub, status: 'rejected', reviewedBy: 'u1', reason: '더 써 주세요' }))
    await onSubmissionWritten.run(subEvent({ ...sub, status: 'rejected' }, { ...sub, status: 'rejected', reviewedBy: 'u1', reason: '더 써 주세요' }))
    expect(created.map(n => [n.path.split('/')[1], n.data.type, n.data.title, n.data.body])).toEqual([['u2', 'mission', "'독후감' 제출이 반려됐어요", '더 써 주세요']])
  })

  it('check-offs (done) send nothing', async () => {
    await onSubmissionWritten.run(subEvent(undefined, { ...sub, status: 'done' }))
    expect(created).toEqual([])
  })
})
