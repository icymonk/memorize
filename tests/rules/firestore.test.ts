import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, or, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

// docs/dev/security.md — firestore.rules (0-8). 실행: 루트에서 `pnpm test:rules`
let env: RulesTestEnvironment

const SID = 'ws1'
const MODULES = { vocab: true, notes: true, reading: false, reviews: false, missions: false, tests: false, math: false, courses: false, wrongNotes: false }
const SETTINGS = { joinPolicy: 'link', whoCanInvite: 'everyone', whoCanCreate: 'everyone', whoCanHost: 'everyone', progressSharing: 'everyone', ranking: { enabled: true } }

const db = (uid?: string) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore()
const spaceRef = (uid?: string, sid = SID) => doc(db(uid), 'spaces', sid)

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
  env = await initializeTestEnvironment({
    projectId: 'demo-memorize-rules',
    firestore: { host, port: Number(port), rules: readFileSync(resolve(import.meta.dirname, '../../firestore.rules'), 'utf8') },
  })
})
afterAll(() => env.cleanup())

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore()
    await setDoc(doc(d, 'users/alice'), { displayName: 'Alice', spaceIds: ['p_alice', SID] })
    await setDoc(doc(d, 'spaces', SID), { kind: 'workspace', name: '스터디', icon: '📚', color: 'blue', description: '', ownerId: 'alice', modules: MODULES, settings: SETTINGS, memberCount: 3, maxMembers: 100 })
    await setDoc(doc(d, 'spaces/p_alice'), { kind: 'personal', name: '내 공간', icon: '🏠', color: null, description: '', ownerId: 'alice', modules: MODULES, memberCount: 1 })
    await setDoc(doc(d, 'spaces/p_alice/members/alice'), { access: 'owner', status: 'active' })
    const members: Record<string, object> = {
      alice: { access: 'owner', status: 'active' },
      mia: { access: 'manager', status: 'active' },
      bob: { access: 'member', status: 'active' },
      pat: { access: 'member', status: 'pending' },
      lee: { access: 'member', status: 'left' },
    }
    for (const [uid, data] of Object.entries(members)) await setDoc(doc(d, 'spaces', SID, 'members', uid), data)
    await setDoc(doc(d, 'spaces', SID, 'invites', 'BOBINV'), { code: 'BOBINV', createdBy: 'bob', uses: 0, maxUses: null, expiresAt: null, disabled: false })
    await setDoc(doc(d, 'spaces', SID, 'invites', 'MIAINV'), { code: 'MIAINV', createdBy: 'mia', uses: 0, maxUses: null, expiresAt: null, disabled: false })
  })
})

describe('users', () => {
  it('only the user reads their own doc', async () => {
    await assertSucceeds(getDoc(doc(db('alice'), 'users/alice')))
    await assertFails(getDoc(doc(db('bob'), 'users/alice')))
    await assertFails(getDoc(doc(db(), 'users/alice')))
  })
  it('clients cannot write user docs', async () => {
    await assertFails(updateDoc(doc(db('alice'), 'users/alice'), { spaceIds: [] }))
  })
})

describe('spaces read', () => {
  it('active members read the space and members', async () => {
    await assertSucceeds(getDoc(spaceRef('bob')))
    await assertSucceeds(getDocs(collection(db('bob'), 'spaces', SID, 'members')))
  })
  it('pending, left, outsiders and signed-out users cannot', async () => {
    for (const uid of ['pat', 'lee', 'eve', undefined]) {
      await assertFails(getDoc(spaceRef(uid)))
      await assertFails(getDoc(doc(db(uid), 'spaces', SID, 'members', 'alice')))
    }
  })
  it('personal space is only readable by its owner', async () => {
    await assertSucceeds(getDoc(spaceRef('alice', 'p_alice')))
    await assertFails(getDoc(spaceRef('bob', 'p_alice')))
  })
})

describe('spaces update (WS-01·02·04)', () => {
  const patch = (extra: object) => ({ ...extra, updatedAt: serverTimestamp() })

  it('owner and manager update general, modules and settings', async () => {
    await assertSucceeds(updateDoc(spaceRef('alice'), patch({ name: '새 이름', color: 'red', description: '소개' })))
    await assertSucceeds(updateDoc(spaceRef('mia'), patch({ modules: { ...MODULES, math: true } })))
    await assertSucceeds(updateDoc(spaceRef('mia'), patch({ settings: { ...SETTINGS, whoCanInvite: 'managers' } })))
  })
  it('members and outsiders cannot', async () => {
    await assertFails(updateDoc(spaceRef('bob'), patch({ name: 'x' })))
    await assertFails(updateDoc(spaceRef('eve'), patch({ name: 'x' })))
  })
  it('server-managed fields are read-only', async () => {
    for (const field of [{ memberCount: 99 }, { ownerId: 'mia' }, { maxMembers: 1000 }, { deleteScheduledAt: null }, { kind: 'personal' }]) {
      await assertFails(updateDoc(spaceRef('alice'), patch(field)))
    }
  })
  it('values are validated', async () => {
    await assertFails(updateDoc(spaceRef('alice'), patch({ name: '' })))
    await assertFails(updateDoc(spaceRef('alice'), patch({ name: 'a'.repeat(41) })))
    await assertFails(updateDoc(spaceRef('alice'), patch({ color: 'black' })))
    await assertFails(updateDoc(spaceRef('alice'), patch({ description: 'a'.repeat(201) })))
    await assertFails(updateDoc(spaceRef('alice'), patch({ modules: { ...MODULES, hack: true } })))
    await assertFails(updateDoc(spaceRef('alice'), patch({ modules: { ...MODULES, vocab: 'yes' } })))
    await assertFails(updateDoc(spaceRef('alice'), patch({ settings: { ...SETTINGS, joinPolicy: 'open' } })))
    await assertFails(updateDoc(spaceRef('alice'), patch({ settings: { ...SETTINGS, ranking: { enabled: false } } })))
  })
  it('updatedAt must be the server time', async () => {
    await assertFails(updateDoc(spaceRef('alice'), { name: 'x' }))
  })
  it('personal space cannot be edited by the client', async () => {
    await assertFails(updateDoc(spaceRef('alice', 'p_alice'), patch({ name: 'x' })))
  })
})

describe('members', () => {
  it('clients cannot write member docs', async () => {
    await assertFails(updateDoc(doc(db('bob'), 'spaces', SID, 'members', 'bob'), { access: 'owner' }))
    await assertFails(setDoc(doc(db('eve'), 'spaces', SID, 'members', 'eve'), { access: 'member', status: 'active' }))
  })
})

describe('invites (WS-10·11)', () => {
  const invites = (uid: string) => collection(db(uid), 'spaces', SID, 'invites')

  it('creator reads own invite, manager reads all', async () => {
    await assertSucceeds(getDoc(doc(invites('bob'), 'BOBINV')))
    await assertFails(getDoc(doc(invites('bob'), 'MIAINV')))
    await assertSucceeds(getDocs(invites('mia')))
    await assertSucceeds(getDocs(invites('alice')))
  })
  it('member lists only with createdBy filter', async () => {
    await assertFails(getDocs(invites('bob')))
    await assertSucceeds(getDocs(query(invites('bob'), where('createdBy', '==', 'bob'))))
  })
  it('outsiders and pending users cannot read', async () => {
    await assertFails(getDoc(doc(invites('eve'), 'BOBINV')))
    await assertFails(getDoc(doc(invites('pat'), 'BOBINV')))
  })
  it('creator or manager can only toggle disabled', async () => {
    await assertSucceeds(updateDoc(doc(invites('bob'), 'BOBINV'), { disabled: true, updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(doc(invites('mia'), 'BOBINV'), { disabled: false, updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(invites('bob'), 'MIAINV'), { disabled: true, updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(invites('bob'), 'BOBINV'), { uses: 99, updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(invites('bob'), 'BOBINV'), { disabled: 'yes', updatedAt: serverTimestamp() }))
  })
  it('clients cannot create invites (server only)', async () => {
    await assertFails(setDoc(doc(invites('alice'), 'NEWINV'), { code: 'NEWINV', createdBy: 'alice', uses: 0, disabled: false }))
  })
})

describe('decks (VOC-01·02·03·05)', () => {
  const deck = (over: object = {}) => ({
    title: '토익', description: '', langFrom: 'en', langTo: 'ko', tags: [], folderId: null, fields: ['pos'],
    visibility: 'space', groupIds: [], editPolicy: 'author', collaboratorIds: [], createdBy: 'bob',
    cardCount: 0, learnerCount: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...over,
  })
  const deckRef = (uid: string, id: string, sid = SID) => doc(db(uid), 'spaces', sid, 'decks', id)
  const seed = (id: string, data: object) => env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'spaces', SID, 'decks', id), data))

  it('members create decks as themselves with zero counters', async () => {
    await assertSucceeds(setDoc(deckRef('bob', 'd1'), deck()))
    await assertFails(setDoc(deckRef('bob', 'd2'), deck({ createdBy: 'alice' })))
    await assertFails(setDoc(deckRef('bob', 'd3'), deck({ cardCount: 5 })))
    await assertFails(setDoc(deckRef('pat', 'd4'), deck({ createdBy: 'pat' })))
    await assertFails(setDoc(deckRef('bob', 'd5'), deck({ visibility: 'public' })))
  })

  it('whoCanCreate=managers allows only owner/manager', async () => {
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'spaces', SID), { 'settings.whoCanCreate': 'managers' }))
    await assertFails(setDoc(deckRef('bob', 'd1'), deck()))
    await assertSucceeds(setDoc(deckRef('mia', 'd2'), deck({ createdBy: 'mia' })))
  })

  it('visibility: space for members, private for author, group for group members', async () => {
    await seed('s', deck())
    await seed('p', deck({ visibility: 'private' }))
    await seed('g', deck({ visibility: 'group', groupIds: ['g1'] }))
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'spaces', SID, 'members', 'mia'), { groupIds: ['g1'] }))
    await assertSucceeds(getDoc(deckRef('alice', 's')))
    await assertFails(getDoc(deckRef('lee', 's')))
    await assertSucceeds(getDoc(deckRef('bob', 'p')))
    await assertFails(getDoc(deckRef('alice', 'p')))
    await assertSucceeds(getDoc(deckRef('mia', 'g')))
    await assertFails(getDoc(deckRef('alice', 'g')))
  })

  it('list query must be limited to space-visible or own decks', async () => {
    await seed('p', deck({ visibility: 'private' }))
    const decks = collection(db('alice'), 'spaces', SID, 'decks')
    await assertSucceeds(getDocs(query(decks, or(where('visibility', '==', 'space'), where('createdBy', '==', 'alice')))))
    await assertFails(getDocs(decks))
  })

  it('edit policy: author / collaborators / everyone; roles only by author', async () => {
    await seed('a', deck())
    await seed('c', deck({ editPolicy: 'collaborators', collaboratorIds: ['mia'] }))
    await seed('e', deck({ editPolicy: 'everyone' }))
    const edit = (uid: string, id: string, patch: object) => updateDoc(deckRef(uid, id), { ...patch, updatedAt: serverTimestamp() })
    await assertSucceeds(edit('bob', 'a', { title: '토익 2', visibility: 'private' }))
    await assertFails(edit('alice', 'a', { title: 'x' }))
    await assertSucceeds(edit('mia', 'c', { title: '토익 3' }))
    await assertFails(edit('mia', 'c', { visibility: 'private' }))
    await assertFails(edit('alice', 'c', { title: 'x' }))
    await assertSucceeds(edit('alice', 'e', { title: '모두' }))
    await assertFails(edit('alice', 'e', { cardCount: 3 }))
    await assertFails(edit('alice', 'e', { createdBy: 'alice' }))
  })

  it('delete: author or manager', async () => {
    await seed('a', deck({ createdBy: 'alice' }))
    await seed('b', deck())
    await assertFails(deleteDoc(deckRef('bob', 'a')))
    await assertSucceeds(deleteDoc(deckRef('mia', 'a')))
    await assertSucceeds(deleteDoc(deckRef('bob', 'b')))
  })

  it('personal space: only the owner, no group visibility', async () => {
    await assertSucceeds(setDoc(deckRef('alice', 'd1', 'p_alice'), deck({ createdBy: 'alice', visibility: 'private' })))
    await assertFails(setDoc(deckRef('alice', 'd2', 'p_alice'), deck({ createdBy: 'alice', visibility: 'group', groupIds: ['g1'] })))
    await assertFails(setDoc(deckRef('bob', 'd3', 'p_alice'), deck()))
  })

  it('folders: members create own, owner/manager edit', async () => {
    const folder = (uid: string, id: string) => doc(db(uid), 'spaces', SID, 'deckFolders', id)
    await assertSucceeds(setDoc(folder('bob', 'f1'), { name: '토익', order: 0, ownerId: 'bob' }))
    await assertFails(setDoc(folder('bob', 'f2'), { name: '토익', order: 0, ownerId: 'alice' }))
    await assertSucceeds(updateDoc(folder('mia', 'f1'), { name: '토익 RC' }))
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'spaces', SID, 'deckFolders', 'f3'), { name: 'A', order: 1, ownerId: 'alice' }))
    await assertFails(updateDoc(folder('bob', 'f3'), { name: 'B' }))
    await assertFails(deleteDoc(folder('bob', 'f3')))
    await assertSucceeds(getDocs(collection(db('bob'), 'spaces', SID, 'deckFolders')))
  })
})

describe('cards (VOC-10·11·13)', () => {
  const deck = (over: object = {}) => ({ title: '토익', visibility: 'space', groupIds: [], editPolicy: 'author', collaboratorIds: [], createdBy: 'bob', cardCount: 0, learnerCount: 0, ...over })
  const card = (over: object = {}) => ({ front: 'apple', back: ['사과'], examples: [], tags: [], synonyms: [], antonyms: [], collocations: [], order: 0, contentRev: 0, ...over })
  const cardRef = (uid: string, deckId: string, id: string) => doc(db(uid), 'spaces', SID, 'decks', deckId, 'cards', id)
  const seed = (path: string, data: object) => env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'spaces', SID, path), data))

  it('deck editors write cards, other members only read', async () => {
    await seed('decks/a', deck())
    await assertSucceeds(setDoc(cardRef('bob', 'a', 'c1'), card()))
    await assertFails(setDoc(cardRef('alice', 'a', 'c2'), card()))
    await assertSucceeds(getDoc(cardRef('alice', 'a', 'c1')))
    await assertSucceeds(getDocs(collection(db('alice'), 'spaces', SID, 'decks', 'a', 'cards')))
    await assertFails(getDoc(cardRef('lee', 'a', 'c1')))
    await assertFails(deleteDoc(cardRef('alice', 'a', 'c1')))
    await assertSucceeds(deleteDoc(cardRef('bob', 'a', 'c1')))
  })

  it('private deck cards are hidden from others', async () => {
    await seed('decks/p', deck({ visibility: 'private' }))
    await seed('decks/p/cards/c1', card())
    await assertSucceeds(getDoc(cardRef('bob', 'p', 'c1')))
    await assertFails(getDoc(cardRef('alice', 'p', 'c1')))
  })

  it('collaborators and everyone policies', async () => {
    await seed('decks/c', deck({ editPolicy: 'collaborators', collaboratorIds: ['mia'] }))
    await seed('decks/e', deck({ editPolicy: 'everyone' }))
    await assertSucceeds(setDoc(cardRef('mia', 'c', 'c1'), card()))
    await assertFails(setDoc(cardRef('alice', 'c', 'c1'), card()))
    await assertSucceeds(setDoc(cardRef('alice', 'e', 'c1'), card()))
  })

  it('validates cards; contentRev is server-only', async () => {
    await seed('decks/a', deck())
    await assertFails(setDoc(cardRef('bob', 'a', 'x1'), card({ contentRev: 1 })))
    await assertFails(setDoc(cardRef('bob', 'a', 'x2'), card({ back: [] })))
    await assertFails(setDoc(cardRef('bob', 'a', 'x3'), card({ front: '' })))
    await seed('decks/a/cards/c1', card({ contentRev: 2 }))
    await assertSucceeds(updateDoc(cardRef('bob', 'a', 'c1'), { front: 'apples', order: 3 }))
    await assertFails(updateDoc(cardRef('bob', 'a', 'c1'), { contentRev: 0 }))
  })

  it('a 400-card paste batch passes the rules read limit', async () => {
    await seed('decks/a', deck())
    const bob = db('bob')
    const batch = writeBatch(bob)
    for (let i = 0; i < 400; i++) batch.set(doc(bob, 'spaces', SID, 'decks', 'a', 'cards', `b${i}`), card({ order: i }))
    await assertSucceeds(batch.commit())
  })
})

describe('study records (VOC-23·32)', () => {
  const session = (over: object = {}) => ({ uid: 'bob', deckId: 'a', mode: 'learn', cards: 10, correct: 8, newlyMastered: 0, durationSec: 60, startedAt: serverTimestamp(), endedAt: serverTimestamp(), ...over })
  const ref = (uid: string, id: string) => doc(db(uid), 'spaces', SID, 'studySessions', id)

  it('members write only their own sessions; nobody edits them', async () => {
    await assertSucceeds(setDoc(ref('bob', 's1'), session()))
    await assertFails(setDoc(ref('bob', 's2'), session({ uid: 'alice' })))
    await assertFails(setDoc(ref('bob', 's3'), session({ mode: 'cheat' })))
    await assertFails(setDoc(ref('pat', 's4'), session({ uid: 'pat' })))
    await assertFails(updateDoc(ref('bob', 's1'), { correct: 10 }))
  })

  it('others read sessions only when progress sharing allows', async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'spaces', SID, 'studySessions', 's1'), session()))
    await assertSucceeds(getDoc(ref('alice', 's1')))
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'spaces', SID, 'members', 'bob'), { hideProgress: true }))
    await assertFails(getDoc(ref('alice', 's1')))
    await assertSucceeds(getDoc(ref('bob', 's1')))
  })

  it('match ranking is readable by members and server-only', async () => {
    const top = (uid: string) => doc(db(uid), 'spaces', SID, 'decks', 'a', 'matchTop', 'top')
    await assertSucceeds(getDoc(top('alice')))
    await assertFails(getDoc(top('lee')))
    await assertFails(setDoc(top('bob'), { entries: [] }))
  })
})
