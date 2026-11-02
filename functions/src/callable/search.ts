import type { DocumentData } from 'firebase-admin/firestore'
import type { SearchHit, SearchOutput } from '../../../shared/search'
import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { rankHits, searchInput } from '../../../shared/search'
import { authedCallable } from '../lib/callable'
import { canSeePage } from '../lib/pageVersions'

/** 한 번에 훑는 문서 수 상한. 처음 버전은 제목·앞면만 메모리에서 거른다 */
const MAX_SCAN = 2000
const MAX_DECKS = 100
const CARDS_PER_DECK = 500

const str = (v: unknown) => (Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? v : '')

function seesDeck(d: DocumentData, uid: string, groupIds: string[]) {
  if (d.deletedAt) return false
  return d.createdBy === uid || d.visibility === 'space'
    || (d.visibility === 'group' && (d.groupIds ?? []).some((g: string) => groupIds.includes(g)))
}

/** CMN-50: 공간 안 노트·단어장·카드 앞면·내 책장·미션·시험 제목 검색. 볼 수 있는 것만, 꺼진 기능은 뺀다 */
export const searchAll = authedCallable(searchInput, async ({ uid, data }): Promise<SearchOutput> => {
  const space = getFirestore().doc(`spaces/${data.spaceId}`)
  const [spaceSnap, member] = await Promise.all([space.get(), space.collection('members').doc(uid).get()])
  if (!spaceSnap.exists || member.get('status') !== 'active') throw new HttpsError('permission-denied', 'not a member')
  const modules = (spaceSnap.get('modules') ?? {}) as Record<string, boolean | undefined>
  const groupIds: string[] = member.get('groupIds') ?? []
  const q = data.q

  const pages = async (): Promise<SearchHit[]> => {
    if (modules.notes === false) return []
    const snap = await space.collection('pages').where('deletedAt', '==', null)
      .select('title', 'type', 'ownerId', 'ownerStatus', 'visibility', 'groupIds', 'sharedWith', 'editorIds', 'reviewerIds', 'deletedAt')
      .limit(MAX_SCAN).get()
    return rankHits(snap.docs.filter(d => d.get('type') !== 'lessonNote' && canSeePage(d.data(), uid, groupIds))
      .map(d => ({ type: 'page' as const, id: d.id, title: str(d.get('title')) })), q)
  }

  const vocab = async (): Promise<SearchHit[]> => {
    if (modules.vocab === false) return []
    const snap = await space.collection('decks').select('title', 'createdBy', 'visibility', 'groupIds', 'deletedAt').limit(MAX_SCAN).get()
    const decks = snap.docs.filter(d => seesDeck(d.data(), uid, groupIds)).map(d => ({ id: d.id, title: str(d.get('title')) }))
    const cardLists = await Promise.all(decks.slice(0, MAX_DECKS).map(async (deck) => {
      const cards = await space.collection('decks').doc(deck.id).collection('cards').select('front').limit(CARDS_PER_DECK).get()
      return cards.docs.map(c => ({ type: 'card' as const, id: c.id, title: str(c.get('front')), sub: deck.title, parentId: deck.id }))
    }))
    return [
      ...rankHits(decks.map(d => ({ type: 'deck' as const, ...d })), q),
      ...rankHits(cardLists.flat(), q),
    ]
  }

  const books = async (): Promise<SearchHit[]> => {
    if (!modules.reading) return []
    const snap = await space.collection('shelf').where('uid', '==', uid).select('title', 'authors', 'bookKey').limit(MAX_SCAN).get()
    return rankHits(snap.docs.map(d => ({ type: 'book' as const, id: str(d.get('bookKey')), title: str(d.get('title')), sub: str(d.get('authors')) })), q)
  }

  const missions = async (): Promise<SearchHit[]> => {
    if (!modules.missions) return []
    const snap = await space.collection('missions').select('title', 'isPersonal', 'createdBy', 'deletedAt').limit(MAX_SCAN).get()
    return rankHits(snap.docs.filter(d => !d.get('deletedAt') && (!d.get('isPersonal') || d.get('createdBy') === uid))
      .map(d => ({ type: 'mission' as const, id: d.id, title: str(d.get('title')) })), q)
  }

  const tests = async (): Promise<SearchHit[]> => {
    if (!modules.tests) return []
    const fields = ['title', 'status', 'hostIds', 'deletedAt'] as const
    const [hosted, joined] = await Promise.all([
      space.collection('tests').where('hostIds', 'array-contains', uid).select(...fields).limit(MAX_SCAN).get(),
      space.collection('tests').where('participantIds', 'array-contains', uid).select(...fields).limit(MAX_SCAN).get(),
    ])
    const seen = new Map<string, SearchHit>()
    for (const d of [...hosted.docs, ...joined.docs]) {
      const host = (d.get('hostIds') ?? []).includes(uid)
      if (d.get('deletedAt') || (!host && !['open', 'closed'].includes(d.get('status')))) continue
      seen.set(d.id, { type: 'test', id: d.id, title: str(d.get('title')) })
    }
    return rankHits([...seen.values()], q)
  }

  const parts = await Promise.all([pages(), vocab(), books(), missions(), tests()])
  return { hits: parts.flat() }
})
