// S1: block batch writes vs. Security Rules document access call limits.
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, serverTimestamp, setDoc, writeBatch, type Firestore } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { createEnv } from './setup'

const SID = 'ws1'
let env: RulesTestEnvironment

function page(ownerId: string, extra: Record<string, unknown> = {}) {
  return {
    ownerId, ownerStatus: 'active', root: 'private', visibility: 'private', deletedAt: null,
    groupIds: [], sharedWith: [], editorIds: [], lock: null, ...extra,
  }
}

function block(i: number) {
  return { type: 'paragraph', parentBlockId: null, order: `a${i}`, attrs: {}, content: [{ type: 'text', text: `b${i}` }], rev: 1, updatedBy: 'alice' }
}

function blockBatch(db: Firestore, pageIds: string[], perPage: number, withMeta: boolean) {
  const batch = writeBatch(db)
  for (const pid of pageIds) {
    for (let i = 0; i < perPage; i++) batch.set(doc(db, `spaces/${SID}/pages/${pid}/blocks/${pid}_${i}`), block(i))
    if (withMeta) batch.update(doc(db, `spaces/${SID}/pages/${pid}`), { updatedAt: serverTimestamp(), blockCount: perPage })
  }
  return batch.commit()
}

beforeAll(async () => { env = await createEnv() })
afterAll(async () => { await env.cleanup() })
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, `spaces/${SID}/members/alice`), { status: 'active', access: 'member', groupIds: [] })
    await setDoc(doc(db, `spaces/${SID}/members/bob`), { status: 'active', access: 'member', groupIds: [] })
    for (let p = 0; p < 25; p++) await setDoc(doc(db, `spaces/${SID}/pages/p${p}`), page('alice'))
    await setDoc(doc(db, `spaces/${SID}/pages/locked`), page('alice', { editorIds: ['bob'], lock: { uid: 'bob' } }))
    for (let r = 1; r <= 11; r++) await setDoc(doc(db, `probeRefs/r${r}`), { ok: true })
  })
})

describe('S1 negative controls (emulator enforces limits)', () => {
  it('single write with 10 distinct reads succeeds', async () => {
    const db = env.authenticatedContext('alice').firestore()
    await assertSucceeds(setDoc(doc(db, 'probe/x'), { n: 10 }))
  })
  it('single write with 11 distinct reads fails', async () => {
    const db = env.authenticatedContext('alice').firestore()
    await assertFails(setDoc(doc(db, 'probe/x'), { n: 11 }))
  })
})

describe('S1 block batch on one page', () => {
  for (const n of [1, 10, 50, 399]) {
    it(`${n} blocks + page meta in one batch succeeds`, async () => {
      const db = env.authenticatedContext('alice').firestore()
      await assertSucceeds(blockBatch(db, ['p0'], n, true))
    })
  }
  it('500 writes (max batch size) succeeds', async () => {
    const db = env.authenticatedContext('alice').firestore()
    await assertSucceeds(blockBatch(db, ['p0'], 499, true))
  })
  it('locked page rejects non-holder, accepts lock holder', async () => {
    await assertFails(blockBatch(env.authenticatedContext('alice').firestore(), ['locked'], 5, false))
    await assertSucceeds(blockBatch(env.authenticatedContext('bob').firestore(), ['locked'], 5, false))
  })
  it('non-member is rejected', async () => {
    await assertFails(blockBatch(env.authenticatedContext('mallory').firestore(), ['p0'], 3, false))
  })
})

describe('S1 batch spanning pages (distinct docs per write)', () => {
  // member doc (1) + one page doc per page → distinct reads = pages + 1
  // Same-document reads are cached across the batch; distinct reads here = pages + 1 (member doc).
  for (const pages of [9, 18]) {
    it(`blocks on ${pages} pages in one batch succeeds`, async () => {
      const db = env.authenticatedContext('alice').firestore()
      await assertSucceeds(blockBatch(db, Array.from({ length: pages }, (_, i) => `p${i}`), 2, false))
    })
  }
  for (const pages of [19, 25]) {
    it(`blocks on ${pages} pages in one batch is denied (access call limit)`, async () => {
      const db = env.authenticatedContext('alice').firestore()
      await assertFails(blockBatch(db, Array.from({ length: pages }, (_, i) => `p${i}`), 2, false))
    })
  }
})
