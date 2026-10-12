// S3: collectionGroup('cardStates') query across spaces under Security Rules.
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collectionGroup, doc, getDocs, orderBy, query, setDoc, Timestamp, where } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createEnv } from './setup'

let env: RulesTestEnvironment
const now = Timestamp.now()
const past = Timestamp.fromMillis(now.toMillis() - 3600_000)
const future = Timestamp.fromMillis(now.toMillis() + 86_400_000)

function state(uid: string, cardId: string, due: Timestamp) {
  return { uid, deckId: 'd1', cardId, status: 'review', ease: 2.5, intervalDays: 1, due, reps: 1, lapses: 0, correct: 1, wrong: 0, starred: false, contentRev: 1 }
}

beforeAll(async () => { env = await createEnv() })
afterAll(async () => { await env.cleanup() })
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    for (const sid of ['p_alice', 'ws1', 'ws2']) {
      await setDoc(doc(db, `spaces/${sid}/cardStates/alice_c1`), state('alice', 'c1', past))
      await setDoc(doc(db, `spaces/${sid}/cardStates/alice_c2`), state('alice', 'c2', future))
      await setDoc(doc(db, `spaces/${sid}/cardStates/bob_c1`), state('bob', 'c1', past))
    }
  })
})

describe('S3 all-spaces due review', () => {
  it('own due cards across all spaces are readable and ordered', async () => {
    const db = env.authenticatedContext('alice').firestore()
    const q = query(collectionGroup(db, 'cardStates'), where('uid', '==', 'alice'), where('due', '<=', now), orderBy('due'))
    const snap = await assertSucceeds(getDocs(q))
    expect(snap.docs.map(d => d.ref.parent.parent!.id).sort()).toEqual(['p_alice', 'ws1', 'ws2'])
  })
  it('query without uid filter is rejected', async () => {
    const db = env.authenticatedContext('alice').firestore()
    await assertFails(getDocs(query(collectionGroup(db, 'cardStates'), where('due', '<=', now))))
  })
  it("querying someone else's uid is rejected", async () => {
    const db = env.authenticatedContext('alice').firestore()
    await assertFails(getDocs(query(collectionGroup(db, 'cardStates'), where('uid', '==', 'bob'))))
  })
  it('unauthenticated is rejected', async () => {
    const db = env.unauthenticatedContext().firestore()
    await assertFails(getDocs(query(collectionGroup(db, 'cardStates'), where('uid', '==', 'alice'))))
  })
})
