import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { and, collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, or, query, serverTimestamp, setDoc, updateDoc, Timestamp, where, writeBatch } from 'firebase/firestore'
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

describe('groups (2-F1, WS-30~33)', () => {
  const g = (uid: string, id: string) => doc(db(uid), 'spaces', SID, 'groups', id)
  const group = (by: string, over: object = {}) => ({ name: '1반', color: 'blue', joinable: true, createdBy: by, deletedAt: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...over })
  const mem = (uid: string, who: string) => doc(db(uid), 'spaces', SID, 'members', who)

  it('any member creates, renames, deletes and restores groups; outsiders cannot', async () => {
    await assertSucceeds(setDoc(g('bob', 'g1'), group('bob')))
    await assertFails(setDoc(g('bob', 'g2'), group('alice')))
    await assertFails(setDoc(g('bob', 'g3'), group('bob', { name: '' })))
    await assertFails(setDoc(g('bob', 'g4'), group('bob', { extra: 1 })))
    await assertFails(setDoc(g('lee', 'g5'), group('lee')))
    await assertFails(setDoc(doc(db('alice'), 'spaces/p_alice/groups/g6'), group('alice')))
    await assertSucceeds(getDoc(g('mia', 'g1')))
    await assertFails(getDoc(g('eve', 'g1')))
    await assertSucceeds(updateDoc(g('mia', 'g1'), { name: '2반', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(g('mia', 'g1'), { createdBy: 'mia', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(g('mia', 'g1'), { deletedAt: serverTimestamp(), deletedBy: 'bob', updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(g('mia', 'g1'), { deletedAt: serverTimestamp(), deletedBy: 'mia', updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(g('bob', 'g1'), { deletedAt: null, updatedAt: serverTimestamp() }))
    await assertFails(deleteDoc(g('bob', 'g1')))
  })

  it('any member changes group membership, nothing else on member docs', async () => {
    await assertSucceeds(updateDoc(mem('bob', 'alice'), { groupIds: ['g1'] }))
    await assertSucceeds(updateDoc(mem('bob', 'bob'), { groupIds: [] }))
    await assertFails(updateDoc(mem('bob', 'alice'), { access: 'member' }))
    await assertFails(updateDoc(mem('bob', 'bob'), { groupIds: ['g1'], hideProgress: true }))
    await assertFails(updateDoc(mem('lee', 'bob'), { groupIds: ['g1'] }))
  })

  it('a member changes only their own display name and progress hiding', async () => {
    await assertSucceeds(updateDoc(mem('bob', 'bob'), { displayName: '밥', hideProgress: true }))
    await assertFails(updateDoc(mem('bob', 'alice'), { displayName: '앨리스' }))
    await assertFails(updateDoc(mem('bob', 'bob'), { displayName: '' }))
    await assertFails(updateDoc(mem('bob', 'bob'), { hideProgress: 'yes' }))
    await assertFails(updateDoc(mem('bob', 'bob'), { displayName: '밥', access: 'manager' }))
  })
})

describe('group visibility (2-F1, WS-32)', () => {
  it('group decks and pages are visible to members of those groups only', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const d = ctx.firestore()
      await updateDoc(doc(d, 'spaces', SID, 'members', 'bob'), { groupIds: ['g1'] })
      await setDoc(doc(d, 'spaces', SID, 'decks', 'gd'), { title: '그룹 단어장', visibility: 'group', groupIds: ['g1'], createdBy: 'alice' })
      await setDoc(doc(d, 'spaces', SID, 'pages', 'gp'), { title: '그룹 노트', visibility: 'group', groupIds: ['g1'], ownerId: 'alice', deletedAt: null, ownerStatus: 'active', editorIds: [] })
    })
    await assertSucceeds(getDoc(doc(db('bob'), 'spaces', SID, 'decks', 'gd')))
    await assertFails(getDoc(doc(db('mia'), 'spaces', SID, 'decks', 'gd')))
    await assertSucceeds(getDocs(query(collection(db('bob'), 'spaces', SID, 'decks'), and(where('visibility', '==', 'group'), where('groupIds', 'array-contains-any', ['g1'])))))
    await assertSucceeds(getDoc(doc(db('bob'), 'spaces', SID, 'pages', 'gp')))
    await assertFails(getDoc(doc(db('mia'), 'spaces', SID, 'pages', 'gp')))
    await assertSucceeds(getDocs(query(collection(db('bob'), 'spaces', SID, 'pages'), and(where('deletedAt', '==', null), where('visibility', '==', 'group'), where('groupIds', 'array-contains-any', ['g1']), where('ownerStatus', '==', 'active')))))
  })
})

describe('workspace subjects (2-F2, WS-09)', () => {
  it('owners and managers edit the shared subject list, members cannot', async () => {
    const subjects = [{ id: 'en', name: '영어', color: 'blue' }]
    await assertSucceeds(updateDoc(spaceRef('mia'), { subjects, updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(spaceRef('bob'), { subjects: [], updatedAt: serverTimestamp() }))
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
    await assertSucceeds(updateDoc(spaceRef('mia'), patch({ settings: { ...SETTINGS, journalVisibility: 'private' } })))
    await assertSucceeds(updateDoc(spaceRef('mia'), patch({ settings: { ...SETTINGS, feedback: { scoreEnabled: true, scoreFormat: 'grade' } } })))
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
    await assertFails(updateDoc(spaceRef('alice'), patch({ settings: { ...SETTINGS, journalVisibility: 'people' } })))
    await assertFails(updateDoc(spaceRef('alice'), patch({ settings: { ...SETTINGS, feedback: { scoreEnabled: true, scoreFormat: 'percent' } } })))
    await assertFails(updateDoc(spaceRef('alice'), patch({ settings: { ...SETTINGS, feedback: { scoreEnabled: 'yes', scoreFormat: '100' } } })))
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

describe('card states (VOC-40·44, WS-53)', () => {
  const state = (uid: string, cardId: string, over: object = {}) => ({ uid, deckId: 'a', cardId, status: 'review', ease: 2.5, intervalDays: 1, due: new Date(), reps: 1, lapses: 0, correct: 1, wrong: 0, contentRev: 0, ...over })
  const ref = (as: string, id: string) => doc(db(as), 'spaces', SID, 'cardStates', id)

  it('members write only their own state with the {uid}_{cardId} id', async () => {
    await assertSucceeds(setDoc(ref('bob', 'bob_c1'), state('bob', 'c1')))
    await assertFails(setDoc(ref('bob', 'alice_c1'), state('alice', 'c1')))
    await assertFails(setDoc(ref('bob', 'bob_c2'), state('bob', 'c1')))
    await assertFails(setDoc(ref('bob', 'bob_c3'), state('bob', 'c3', { status: 'genius' })))
    await assertFails(setDoc(ref('pat', 'pat_c1'), state('pat', 'c1')))
    await assertSucceeds(updateDoc(ref('bob', 'bob_c1'), { intervalDays: 3 }))
    await assertFails(updateDoc(ref('bob', 'bob_c1'), { deckId: 'b' }))
    await assertFails(updateDoc(ref('alice', 'bob_c1'), { intervalDays: 9 }))
  })

  it('due queries: own space query and collection group need uid == me', async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'spaces', SID, 'cardStates', 'bob_c1'), state('bob', 'c1')))
    const bob = db('bob')
    await assertSucceeds(getDocs(query(collection(bob, 'spaces', SID, 'cardStates'), where('uid', '==', 'bob'), where('due', '<=', new Date()))))
    await assertSucceeds(getDocs(query(collectionGroup(bob, 'cardStates'), where('uid', '==', 'bob'))))
    await assertFails(getDocs(query(collectionGroup(bob, 'cardStates'), where('uid', '==', 'alice'))))
  })
})

describe('deck progress (VOC-41·45)', () => {
  const ref = (as: string, id: string) => doc(db(as), 'spaces', SID, 'deckProgress', id)
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'spaces', SID, 'deckProgress', 'bob_a'), { uid: 'bob', deckId: 'a', masteredCount: 1, learningCount: 2 })
    })
  })

  it('my progress list query, others per document, nobody writes', async () => {
    const bob = db('bob')
    await assertSucceeds(getDocs(query(collection(bob, 'spaces', SID, 'deckProgress'), where('uid', '==', 'bob'))))
    await assertSucceeds(getDoc(ref('alice', 'bob_a')))
    await assertFails(getDoc(ref('lee', 'bob_a')))
    await assertFails(setDoc(ref('bob', 'bob_b'), { uid: 'bob', deckId: 'b', masteredCount: 99, learningCount: 0 }))
  })

  it('star-only state for an unseen card is allowed', async () => {
    await assertSucceeds(setDoc(doc(db('bob'), 'spaces', SID, 'cardStates', 'bob_c9'), { uid: 'bob', deckId: 'a', cardId: 'c9', status: 'new', ease: 2.5, intervalDays: 0, due: new Date(Date.UTC(9999, 0, 1)), reps: 0, lapses: 0, correct: 0, wrong: 0, contentRev: 0, starred: true }))
  })
})

describe('pages and blocks (NOTE-01·10)', () => {
  const page = (o: object = {}) => ({
    type: 'page', title: '', icon: '', cover: null, ownerId: 'bob', root: 'shared', parentId: null, order: 'V', ancestorIds: [], props: {},
    visibility: 'space', groupIds: [], sharedWith: [], editorIds: [], reviewerIds: [], excerpt: '', blockCount: 0, textLength: 0,
    lock: null, ownerStatus: 'active', deletedAt: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...o,
  })
  const block = (uid: string, o: object = {}) => ({
    type: 'paragraph', parentBlockId: null, order: 'V', attrs: {}, content: [{ type: 'text', text: 'hi' }], rev: 1, updatedBy: uid, updatedAt: serverTimestamp(), ...o,
  })
  const seed = (path: string, data: object) => env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'spaces', SID, path), data))
  const pageRef = (uid: string, id: string, sid = SID) => doc(db(uid), 'spaces', sid, 'pages', id)

  it('members create pages as themselves with empty stats', async () => {
    await assertSucceeds(setDoc(pageRef('bob', 'p1'), page()))
    await assertFails(setDoc(pageRef('bob', 'p2'), page({ ownerId: 'alice' })))
    await assertFails(setDoc(pageRef('bob', 'p3'), page({ blockCount: 3 })))
    await assertFails(setDoc(pageRef('bob', 'p4'), page({ visibility: 'groups' })))
    await assertFails(setDoc(pageRef('pat', 'p5'), page({ ownerId: 'pat' })))
    await assertSucceeds(setDoc(pageRef('alice', 'mine', 'p_alice'), page({ ownerId: 'alice', root: 'private', visibility: 'private' })))
    await assertFails(setDoc(pageRef('alice', 'open', 'p_alice'), page({ ownerId: 'alice' })))
  })

  it('private pages and their blocks are hidden from others', async () => {
    await seed('pages/priv', page({ visibility: 'private', root: 'private' }))
    await seed('pages/priv/blocks/b1', block('bob'))
    await assertSucceeds(getDoc(pageRef('bob', 'priv')))
    await assertSucceeds(getDocs(collection(db('bob'), 'spaces', SID, 'pages', 'priv', 'blocks')))
    await assertFails(getDoc(pageRef('alice', 'priv')))
    await assertFails(getDocs(collection(db('alice'), 'spaces', SID, 'pages', 'priv', 'blocks')))
    const pages = collection(db('alice'), 'spaces', SID, 'pages')
    await assertSucceeds(getDocs(query(pages, and(where('deletedAt', '==', null), or(where('visibility', '==', 'space'), where('ownerId', '==', 'alice'))))))
    await assertFails(getDocs(pages))
  })

  it('owner and editors write blocks with page meta in one batch; others read only', async () => {
    await seed('pages/a', page({ editorIds: ['mia'], editPolicy: 'editors' }))
    for (const uid of ['bob', 'mia']) {
      const d = db(uid)
      const batch = writeBatch(d)
      batch.set(doc(d, 'spaces', SID, 'pages', 'a', 'blocks', `b-${uid}`), block(uid))
      batch.update(doc(d, 'spaces', SID, 'pages', 'a'), { excerpt: 'hi', blockCount: 1, textLength: 2, updatedAt: serverTimestamp() })
      await assertSucceeds(batch.commit())
    }
    await assertSucceeds(getDoc(doc(db('alice'), 'spaces', SID, 'pages', 'a', 'blocks', 'b-bob')))
    await assertFails(setDoc(doc(db('alice'), 'spaces', SID, 'pages', 'a', 'blocks', 'x'), block('alice')))
    await assertFails(deleteDoc(doc(db('alice'), 'spaces', SID, 'pages', 'a', 'blocks', 'b-bob')))
    await assertFails(updateDoc(pageRef('alice', 'a'), { title: 'x', updatedAt: serverTimestamp() }))
  })

  it('block writes must be attributed to the writer and well-formed', async () => {
    await seed('pages/a', page())
    const ref = doc(db('bob'), 'spaces', SID, 'pages', 'a', 'blocks', 'b')
    await assertFails(setDoc(ref, block('alice')))
    await assertFails(setDoc(ref, block('bob', { order: '' })))
    await assertFails(setDoc(ref, block('bob', { content: 'text' })))
    await assertSucceeds(setDoc(ref, block('bob')))
    await assertSucceeds(deleteDoc(ref))
  })

  it('a 400-block batch with page meta passes', async () => {
    await seed('pages/big', page())
    const d = db('bob')
    const batch = writeBatch(d)
    for (let i = 0; i < 399; i++) batch.set(doc(d, 'spaces', SID, 'pages', 'big', 'blocks', `b${i}`), block('bob', { order: `a${i + 1}` }))
    batch.update(doc(d, 'spaces', SID, 'pages', 'big'), { blockCount: 399, updatedAt: serverTimestamp() })
    await assertSucceeds(batch.commit())
  })

  it('only the owner changes sharing; editors keep to content; owner or manager deletes', async () => {
    await seed('pages/a', page({ ownerId: 'mia', editorIds: ['bob'] }))
    await assertFails(updateDoc(pageRef('bob', 'a'), { visibility: 'private', updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(pageRef('bob', 'a'), { title: '함께', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(pageRef('mia', 'a'), { ownerId: 'bob', updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(pageRef('mia', 'a'), { editorIds: [], updatedAt: serverTimestamp() }))
    await assertFails(deleteDoc(pageRef('bob', 'a')))
    await seed('pages/c', page())
    await assertFails(deleteDoc(pageRef('alice', 'c')))
  })

  it('subpages must match the parent root and ancestors; clients cannot move or trash', async () => {
    await seed('pages/top', page({ ancestorIds: [] }))
    await assertSucceeds(setDoc(pageRef('bob', 'sub'), page({ parentId: 'top', ancestorIds: ['top'] })))
    await assertFails(setDoc(pageRef('bob', 'bad1'), page({ parentId: 'top', ancestorIds: [] })))
    await assertFails(setDoc(pageRef('bob', 'bad2'), page({ parentId: 'top', ancestorIds: ['top'], root: 'private', visibility: 'private' })))
    await assertFails(updateDoc(pageRef('bob', 'top'), { parentId: 'x', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(pageRef('bob', 'top'), { deletedAt: serverTimestamp(), updatedAt: serverTimestamp() }))
  })

  it('trashed pages: only the owner or the trasher reads them; nobody edits', async () => {
    await seed('pages/gone', page({ deletedAt: new Date(), deletedBy: 'alice', trashRootId: 'gone' }))
    await seed('pages/gone/blocks/b', block('bob'))
    await assertSucceeds(getDoc(pageRef('bob', 'gone')))
    await assertSucceeds(getDoc(pageRef('alice', 'gone')))
    await assertFails(getDoc(pageRef('mia', 'gone')))
    await assertFails(getDoc(doc(db('mia'), 'spaces', SID, 'pages', 'gone', 'blocks', 'b')))
    await assertFails(updateDoc(pageRef('bob', 'gone'), { title: 'x', updatedAt: serverTimestamp() }))
    await assertFails(setDoc(doc(db('bob'), 'spaces', SID, 'pages', 'gone', 'blocks', 'n'), block('bob')))
    await assertSucceeds(getDocs(query(collection(db('alice'), 'spaces', SID, 'pages'), where('deletedBy', '==', 'alice'))))
  })

  it('favorites and recent pages are private per member', async () => {
    const prefs = { favoritePageIds: ['a'], recentPageIds: ['a', 'b'] }
    await assertSucceeds(setDoc(doc(db('bob'), 'spaces', SID, 'userPrefs', 'bob'), prefs))
    await assertSucceeds(getDoc(doc(db('bob'), 'spaces', SID, 'userPrefs', 'bob')))
    await assertFails(getDoc(doc(db('alice'), 'spaces', SID, 'userPrefs', 'bob')))
    await assertFails(setDoc(doc(db('alice'), 'spaces', SID, 'userPrefs', 'bob'), prefs))
    await assertFails(setDoc(doc(db('bob'), 'spaces', SID, 'userPrefs', 'bob'), { ...prefs, extra: 1 }))
  })

  it('people visibility, editors and shared edit policy (NOTE-50·54)', async () => {
    await seed('pages/ppl', page({ visibility: 'people', root: 'private', sharedWith: ['mia'] }))
    await assertSucceeds(getDoc(pageRef('mia', 'ppl')))
    await assertFails(getDoc(pageRef('alice', 'ppl')))
    await assertFails(updateDoc(pageRef('mia', 'ppl'), { title: 'x', updatedAt: serverTimestamp() }))
    await seed('pages/sh', page({ editPolicy: 'editors' }))
    await assertFails(updateDoc(pageRef('alice', 'sh'), { title: 'x', updatedAt: serverTimestamp() }))
    await seed('pages/open', page())
    await assertSucceeds(updateDoc(pageRef('alice', 'open'), { title: 'x', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(pageRef('alice', 'open'), { editPolicy: 'editors', updatedAt: serverTimestamp() }))
  })

  it('edit lock blocks other editors until it expires (NOTE-60)', async () => {
    await seed('pages/lk', page())
    await assertSucceeds(updateDoc(pageRef('bob', 'lk'), { lock: { uid: 'bob', name: 'Bob', at: serverTimestamp() }, updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(pageRef('alice', 'lk'), { lock: { uid: 'alice', name: 'A', at: serverTimestamp() }, updatedAt: serverTimestamp() }))
    await assertFails(setDoc(doc(db('alice'), 'spaces', SID, 'pages', 'lk', 'blocks', 'x'), block('alice')))
    await assertSucceeds(setDoc(doc(db('bob'), 'spaces', SID, 'pages', 'lk', 'blocks', 'x'), block('bob')))
    await seed('pages/old', page({ lock: { uid: 'bob', name: 'Bob', at: new Date(Date.now() - 120_000) } }))
    await assertSucceeds(setDoc(doc(db('alice'), 'spaces', SID, 'pages', 'old', 'blocks', 'x'), block('alice')))
  })

  it('collections: shared vs private, settings by owner/manager (NOTE-46·49)', async () => {
    const col = (o: object = {}) => ({ kind: 'custom', name: '표현', icon: '', ownerId: 'bob', scope: 'shared', schema: [], views: [], templateIds: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...o })
    const colRef = (uid: string, id: string, sid = SID) => doc(db(uid), 'spaces', sid, 'collections', id)
    await assertSucceeds(setDoc(colRef('bob', 'c1'), col()))
    await assertSucceeds(setDoc(colRef('bob', 'c2'), col({ scope: 'private' })))
    await assertFails(setDoc(colRef('bob', 'c3'), col({ ownerId: 'alice' })))
    await assertFails(setDoc(colRef('pat', 'c4'), col({ ownerId: 'pat' })))
    await assertFails(setDoc(colRef('alice', 'c5', 'p_alice'), col({ ownerId: 'alice' })))
    await assertSucceeds(setDoc(colRef('alice', 'c6', 'p_alice'), col({ ownerId: 'alice', scope: 'private' })))
    await assertSucceeds(getDoc(colRef('alice', 'c1')))
    await assertFails(getDoc(colRef('alice', 'c2')))
    const cols = collection(db('alice'), 'spaces', SID, 'collections')
    await assertSucceeds(getDocs(query(cols, or(where('scope', '==', 'shared'), where('ownerId', '==', 'alice')))))
    await assertFails(getDocs(cols))
    const edit = { name: '새 이름', updatedAt: serverTimestamp() }
    await assertSucceeds(updateDoc(colRef('mia', 'c1'), edit))
    await assertSucceeds(setDoc(colRef('mia', 'c7'), col({ ownerId: 'mia' })))
    await assertFails(updateDoc(colRef('bob', 'c7'), { name: 'x', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(colRef('bob', 'c1'), { scope: 'private', updatedAt: serverTimestamp() }))
    await assertFails(deleteDoc(colRef('bob', 'c1')))
  })

  it('collection pages follow the collection scope (NOTE-46·49)', async () => {
    const base = { kind: 'custom', name: '표현', icon: '', ownerId: 'bob', schema: [], views: [], templateIds: [] }
    await seed('collections/sh', { ...base, scope: 'shared' })
    await seed('collections/pv', { ...base, scope: 'private' })
    const item = (o: object) => page({ type: 'item', ownerId: 'alice', props: { p1: 'a' }, ...o })
    await assertSucceeds(setDoc(pageRef('alice', 'i1'), item({ collectionId: 'sh' })))
    await assertFails(setDoc(pageRef('alice', 'i2'), item({ collectionId: 'pv', root: 'private', visibility: 'private' })))
    await assertSucceeds(setDoc(pageRef('bob', 'i3'), item({ ownerId: 'bob', collectionId: 'pv', root: 'private', visibility: 'private' })))
    await assertFails(setDoc(pageRef('alice', 'i4'), item({ collectionId: 'sh', root: 'private', visibility: 'private' })))
    await assertFails(setDoc(pageRef('alice', 'i5'), item({ collectionId: 'missing' })))
    await assertFails(setDoc(pageRef('alice', 'i6'), item({})))
    await assertSucceeds(updateDoc(pageRef('mia', 'i1'), { 'props.p1': 'b', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(pageRef('alice', 'i1'), { collectionId: 'pv', updatedAt: serverTimestamp() }))
  })

  it('journal: any member writes their own, others cannot edit (NOTE-30·31)', async () => {
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'spaces', SID), { 'settings.whoCanCreate': 'managers' }))
    const sys = { kind: 'system', systemType: 'journal', name: '학습일지', icon: '', ownerId: 'bob', scope: 'shared', schema: [], views: [], templateIds: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
    const colDoc = (uid: string, id: string) => doc(db(uid), 'spaces', SID, 'collections', id)
    await assertFails(setDoc(colDoc('bob', 'other'), sys))
    await assertSucceeds(getDoc(colDoc('bob', 'journal')))
    await assertFails(setDoc(colDoc('bob', 'journal'), { ...sys, scope: 'private' }))
    await assertSucceeds(setDoc(colDoc('bob', 'journal'), sys))
    const j = (o: object) => page({ type: 'journal', collectionId: 'journal', editPolicy: 'editors', props: { date: '2026-10-12' }, ...o })
    await assertSucceeds(setDoc(pageRef('bob', 'j1'), j({})))
    await assertFails(setDoc(pageRef('bob', 'j2'), j({ editPolicy: 'everyone' })))
    await assertFails(setDoc(pageRef('bob', 'j3'), page({ type: 'journal', collectionId: 'sh', editPolicy: 'editors' })))
    await assertFails(setDoc(pageRef('bob', 'j4'), page({ type: 'item', collectionId: 'journal' })))
    await assertFails(updateDoc(pageRef('mia', 'j1'), { title: 'x', updatedAt: serverTimestamp() }))
  })

  it('book review: any member writes their own about a book, others cannot edit (REV-01·02)', async () => {
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'spaces', SID), { 'settings.whoCanCreate': 'managers' }))
    const sys = { kind: 'system', systemType: 'bookReview', name: '독후감', icon: '', ownerId: 'bob', scope: 'shared', schema: [], views: [], templateIds: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
    const colDoc = (uid: string, id: string) => doc(db(uid), 'spaces', SID, 'collections', id)
    await assertSucceeds(getDoc(colDoc('bob', 'bookReview')))
    await assertFails(setDoc(colDoc('bob', 'bookReview'), { ...sys, systemType: 'journal' }))
    await assertSucceeds(setDoc(colDoc('bob', 'bookReview'), sys))
    const book = { bookKey: 'isbn:9788936434120', title: '소년이 온다', authors: ['한강'], cover: '' }
    const r = (o: object) => page({ type: 'bookReview', collectionId: 'bookReview', editPolicy: 'editors', visibility: 'private', book, ...o })
    await assertSucceeds(setDoc(pageRef('bob', 'r1'), r({})))
    await assertFails(setDoc(pageRef('bob', 'r2'), r({ book: null })))
    await assertFails(setDoc(pageRef('bob', 'r3'), r({ editPolicy: 'everyone' })))
    await assertFails(setDoc(pageRef('bob', 'r4'), r({ collectionId: 'journal' })))
    await assertFails(setDoc(pageRef('bob', 'r5'), page({ type: 'item', collectionId: 'bookReview' })))
    await assertFails(updateDoc(pageRef('bob', 'r1'), { book: { ...book, title: 'x' }, updatedAt: serverTimestamp() }))
    await assertFails(getDoc(pageRef('alice', 'r1')))
  })

  it('book review publish: only the author sets publishedAt and opens it to the space (REV-10)', async () => {
    const book = { bookKey: 'isbn:9788936434120', title: '소년이 온다', authors: ['한강'], cover: '' }
    await seed('pages/rv', page({ type: 'bookReview', collectionId: 'bookReview', editPolicy: 'editors', visibility: 'private', book }))
    await assertFails(getDoc(pageRef('alice', 'rv')))
    await assertFails(updateDoc(pageRef('alice', 'rv'), { visibility: 'space', publishedAt: serverTimestamp(), updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(pageRef('bob', 'rv'), { visibility: 'space', publishedAt: serverTimestamp(), updatedAt: serverTimestamp() }))
    await assertSucceeds(getDoc(pageRef('alice', 'rv')))
    await assertFails(updateDoc(pageRef('alice', 'rv'), { publishedAt: null, visibility: 'private', updatedAt: serverTimestamp() }))
  })

  it('my journals across spaces: collectionGroup read of my own pages only (NOTE-39)', async () => {
    await seed('pages/mine', page({ type: 'journal', collectionId: 'journal', editPolicy: 'editors', ownerId: 'bob' }))
    await assertSucceeds(getDocs(query(collectionGroup(db('bob'), 'pages'), where('ownerId', '==', 'bob'), where('type', '==', 'journal'))))
    await assertFails(getDocs(query(collectionGroup(db('bob'), 'pages'), where('ownerId', '==', 'alice'), where('type', '==', 'journal'))))
  })
})

describe('access matrix (security.md 6)', () => {
  const seed = (path: string, data: object) => env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'spaces', SID, path), data))
  const ref = (uid: string | undefined, path: string) => doc(db(uid), 'spaces', SID, path)
  const pageData = (o: object = {}) => ({ type: 'page', ownerId: 'bob', root: 'shared', visibility: 'space', sharedWith: [], editorIds: [], ownerStatus: 'active', deletedAt: null, ...o })

  beforeEach(async () => {
    await seed('decks/d1', { title: 'd', visibility: 'space', createdBy: 'bob', groupIds: [], editPolicy: 'author', collaboratorIds: [] })
    await seed('pages/p1', pageData())
    await seed('collections/c1', { kind: 'custom', scope: 'shared', ownerId: 'bob', name: 'c', icon: '', schema: [], views: [], templateIds: [] })
    await seed('studySessions/s1', { uid: 'bob', mode: 'review', cards: 1, correct: 1, durationSec: 1 })
  })

  it('signed-out users, outsiders, pending and left members read nothing', async () => {
    for (const who of [undefined, 'zed', 'pat', 'lee']) {
      for (const path of ['decks/d1', 'pages/p1', 'collections/c1', 'studySessions/s1'])
        await assertFails(getDoc(ref(who, path)))
    }
    await assertSucceeds(getDoc(ref('bob', 'decks/d1')))
  })

  it('owners and managers cannot read private notes or hidden progress', async () => {
    await seed('pages/p2', pageData({ root: 'private', visibility: 'private' }))
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'spaces', SID, 'members', 'bob'), { hideProgress: true }))
    await assertFails(getDoc(ref('mia', 'pages/p2')))
    await assertFails(getDoc(ref('alice', 'pages/p2')))
    await assertFails(getDoc(ref('mia', 'studySessions/s1')))
    await assertSucceeds(getDoc(ref('bob', 'studySessions/s1')))
  })

  it("a left member's notes are hidden from others, and the page list query must say so (WS-23)", async () => {
    await seed('pages/p3', pageData({ ownerId: 'lee', ownerStatus: 'left' }))
    await assertFails(getDoc(ref('bob', 'pages/p3')))
    await assertFails(getDoc(ref('mia', 'pages/p3')))
    await assertSucceeds(getDoc(ref('bob', 'pages/p1')))
    const pages = collection(db('bob'), 'spaces', SID, 'pages')
    const active = where('ownerStatus', '==', 'active')
    await assertSucceeds(getDocs(query(pages, and(where('deletedAt', '==', null), or(
      and(where('visibility', '==', 'space'), active),
      where('ownerId', '==', 'bob'),
      and(where('sharedWith', 'array-contains', 'bob'), active),
      and(where('editorIds', 'array-contains', 'bob'), active),
    )))))
  })
})

describe('comments (CMN-20·22)', () => {
  const seed = (path: string, data: object) => env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'spaces', SID, path), data))
  const ref = (uid: string, id: string) => doc(db(uid), 'spaces', SID, 'comments', id)
  const pageData = (o: object = {}) => ({ type: 'page', ownerId: 'bob', root: 'shared', visibility: 'space', sharedWith: [], editorIds: [], ownerStatus: 'active', deletedAt: null, ...o })
  const c = (uid: string, o: object = {}) => ({ targetType: 'page', targetId: 'p1', uid, kind: 'comment', body: '좋아요', mentions: [], createdAt: serverTimestamp(), ...o })

  it('members who can read the page comment as themselves; others cannot', async () => {
    await seed('pages/p1', pageData())
    await seed('pages/p2', pageData({ root: 'private', visibility: 'private' }))
    await assertSucceeds(setDoc(ref('mia', 'c1'), c('mia', { mentions: ['bob'] })))
    await assertFails(setDoc(ref('mia', 'c2'), c('bob')))
    await assertFails(setDoc(ref('mia', 'c3'), c('mia', { targetId: 'p2' })))
    await assertFails(setDoc(ref('mia', 'c4'), c('mia', { kind: 'feedback' })))
    await assertFails(setDoc(ref('lee', 'c5'), c('lee')))
    await assertSucceeds(setDoc(ref('bob', 'c6'), c('bob', { targetId: 'p2' })))
    await assertFails(getDoc(ref('mia', 'c6')))
    await assertSucceeds(getDoc(ref('alice', 'c1')))
  })

  it('author edits; author or manager deletes', async () => {
    await seed('pages/p1', pageData())
    await seed('comments/c1', { targetType: 'page', targetId: 'p1', uid: 'bob', kind: 'comment', body: 'a', mentions: [], createdAt: new Date() })
    await assertSucceeds(updateDoc(ref('bob', 'c1'), { body: 'b', editedAt: serverTimestamp() }))
    await assertFails(updateDoc(ref('mia', 'c1'), { body: 'x', editedAt: serverTimestamp() }))
    await assertFails(updateDoc(ref('bob', 'c1'), { targetId: 'p9', editedAt: serverTimestamp() }))
    await assertSucceeds(deleteDoc(ref('mia', 'c1')))
  })
  it('CMN-23·25: requested reviewers can read a private page; feedback is server-only but deletable by its author', async () => {
    await seed('pages/p3', pageData({ root: 'private', visibility: 'private', reviewerIds: ['mia'] }))
    await assertSucceeds(getDoc(doc(db('mia'), 'spaces', SID, 'pages', 'p3')))
    await assertFails(getDoc(doc(db('alice'), 'spaces', SID, 'pages', 'p3')))
    await seed('comments/fb', { targetType: 'page', targetId: 'p3', uid: 'mia', kind: 'feedback', stamp: 'great', body: '', mentions: [], createdAt: new Date() })
    await assertSucceeds(getDoc(ref('mia', 'fb')))
    await assertFails(updateDoc(ref('mia', 'fb'), { body: 'x', editedAt: serverTimestamp() }))
    await assertSucceeds(deleteDoc(ref('mia', 'fb')))
  })
})


describe('reactions (CMN-21)', () => {
  it('one reaction per person per page, only for readers', async () => {
    const seed = (path: string, data: object) => env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'spaces', SID, path), data))
    await seed('pages/p1', { type: 'page', ownerId: 'bob', root: 'shared', visibility: 'space', sharedWith: [], editorIds: [], ownerStatus: 'active', deletedAt: null })
    await seed('pages/p2', { type: 'page', ownerId: 'bob', root: 'private', visibility: 'private', sharedWith: [], editorIds: [], ownerStatus: 'active', deletedAt: null })
    const ref = (uid: string, id: string) => doc(db(uid), 'spaces', SID, 'reactions', id)
    const r = (uid: string, targetId = 'p1') => ({ targetType: 'page', targetId, uid, emoji: '👍' })
    await assertSucceeds(setDoc(ref('mia', 'page_p1_mia'), r('mia')))
    await assertFails(setDoc(ref('mia', 'page_p1_bob'), r('bob')))
    await assertFails(setDoc(ref('mia', 'other'), r('mia')))
    await assertFails(setDoc(ref('mia', 'page_p2_mia'), r('mia', 'p2')))
    await assertFails(deleteDoc(ref('bob', 'page_p1_mia')))
    await assertSucceeds(deleteDoc(ref('mia', 'page_p1_mia')))
  })

  it('members react to feed rows and list those reactions (CMN-12)', async () => {
    const ref = (uid: string, id: string) => doc(db(uid), 'spaces', SID, 'reactions', id)
    const r = (uid: string, targetId = 'd_mia_2026-10-12') => ({ targetType: 'feed', targetId, uid, emoji: '🎉' })
    await assertSucceeds(setDoc(ref('bob', 'feed_d_mia_2026-10-12_bob'), r('bob')))
    await assertSucceeds(setDoc(ref('mia', 'feed_a1_mia'), r('mia', 'a1')))
    await assertFails(setDoc(ref('bob', 'feed_a1_mia'), r('mia', 'a1')))
    await assertFails(setDoc(ref('lee', 'feed_a1_lee'), r('lee', 'a1')))
    const list = (uid: string) => getDocs(query(collection(db(uid), 'spaces', SID, 'reactions'), where('targetType', '==', 'feed'), where('targetId', 'in', ['a1', 'd_mia_2026-10-12'])))
    await assertSucceeds(list('mia'))
    await assertFails(list('lee'))
  })
})

describe('leading: pages asking me for feedback (CMN-06)', () => {
  it('a reviewer lists private pages that ask them for feedback', async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'spaces', SID, 'pages', 'fb1'), { ownerId: 'alice', visibility: 'private', root: 'private', parentId: null, deletedAt: null, ownerStatus: 'active', editorIds: [], reviewerIds: ['bob'] }))
    const asked = (uid: string) => getDocs(query(collection(db(uid), 'spaces', SID, 'pages'), where('deletedAt', '==', null), where('ownerStatus', '==', 'active'), where('reviewerIds', 'array-contains', uid)))
    await assertSucceeds(asked('bob'))
    await assertSucceeds(getDoc(doc(db('bob'), 'spaces', SID, 'pages', 'fb1')))
    await assertFails(getDoc(doc(db('mia'), 'spaces', SID, 'pages', 'fb1')))
  })
})

describe('uploads (CMN-62)', () => {
  it('only the owner reads their upload list; clients never write it', async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'users/bob/uploads/f1'), { size: 1 }))
    await assertSucceeds(getDoc(doc(db('bob'), 'users/bob/uploads/f1')))
    await assertFails(getDoc(doc(db('alice'), 'users/bob/uploads/f1')))
    await assertFails(setDoc(doc(db('bob'), 'users/bob/uploads/f2'), { size: 1 }))
    await assertFails(updateDoc(doc(db('bob'), 'users/bob/uploads/f1'), { size: 0 }))
  })
})

describe('study settings (ACC-24)', () => {
  it('lets a user change only their own valid study map', async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'users/mia'), { kind: 'standard', displayName: 'Mia' }))
    const ok = { dailyNewCards: 5, dailyReviewCards: 50, flashcardFront: 'back' }
    await assertSucceeds(updateDoc(doc(db('mia'), 'users', 'mia'), { study: ok }))
    await assertFails(updateDoc(doc(db('mia'), 'users', 'mia'), { study: { ...ok, dailyNewCards: 500 } }))
    await assertFails(updateDoc(doc(db('mia'), 'users', 'mia'), { study: { ...ok, flashcardFront: 'side' } }))
    await assertFails(updateDoc(doc(db('mia'), 'users', 'mia'), { study: ok, displayName: 'x' }))
    await assertFails(updateDoc(doc(db('bob'), 'users', 'mia'), { study: ok }))
  })
})

describe('reading groups (READ-40·41·45)', () => {
  const group = (over: object = {}) => ({
    bookKey: 'isbn:9788936434120',
    book: { title: '소년이 온다', authors: ['한강'], cover: '' },
    unit: 'page',
    startAt: '2026-11-01',
    endAt: '2026-11-28',
    assignees: { all: false, uids: ['mia'], groupIds: [] },
    joinable: false,
    schedule: [{ id: 'w1', label: '1주차', from: 1, to: 50, dueDate: '2026-11-07' }],
    createdBy: 'bob',
    hostIds: ['bob'],
    participantIds: ['bob'],
    closedAt: null,
    ...over,
  })
  const ref = (uid: string, id = 'g1', sid = SID) => doc(db(uid), 'spaces', sid, 'readingGroups', id)

  it('members open groups as host and first participant; not in a personal space', async () => {
    await assertSucceeds(setDoc(ref('bob'), group()))
    await assertFails(setDoc(ref('bob', 'g2'), group({ participantIds: ['bob', 'mia'] })))
    await assertFails(setDoc(ref('bob', 'g3'), group({ createdBy: 'alice', hostIds: ['alice'], participantIds: ['alice'] })))
    await assertFails(setDoc(ref('bob', 'g4'), group({ endAt: '2026-10-01' })))
    await assertFails(setDoc(ref('pat', 'g5'), group({ createdBy: 'pat', hostIds: ['pat'], participantIds: ['pat'] })))
    await assertFails(setDoc(ref('alice', 'g6', 'p_alice'), group({ createdBy: 'alice', hostIds: ['alice'], participantIds: ['alice'] })))
    await assertSucceeds(getDoc(ref('alice')))
  })

  it('assigned members or anyone in a joinable group join themselves; hosts edit the schedule', async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'spaces', SID, 'readingGroups', 'g1'), group()))
    await assertFails(updateDoc(ref('alice'), { participantIds: ['bob', 'alice'] }))
    await assertSucceeds(updateDoc(ref('mia'), { participantIds: ['bob', 'mia'] }))
    await assertSucceeds(updateDoc(ref('mia'), { participantIds: ['bob'] }))
    await assertFails(updateDoc(ref('bob'), { participantIds: [] }))
    await assertFails(updateDoc(ref('mia'), { schedule: [] }))
    await assertSucceeds(updateDoc(ref('bob'), { schedule: [], joinable: true }))
    await assertSucceeds(updateDoc(ref('alice'), { participantIds: ['bob', 'alice'] }))
    await assertFails(deleteDoc(ref('alice')))
    await assertSucceeds(deleteDoc(ref('bob')))
  })
})

describe('reading goal (READ-51)', () => {
  it('lets a user set only their own valid yearly goal', async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'users/mia'), { kind: 'standard', displayName: 'Mia' }))
    await assertSucceeds(updateDoc(doc(db('mia'), 'users', 'mia'), { readingGoal: { year: 2026, books: 24 } }))
    await assertFails(updateDoc(doc(db('mia'), 'users', 'mia'), { readingGoal: { year: 2026, books: 0 } }))
    await assertFails(updateDoc(doc(db('mia'), 'users', 'mia'), { readingGoal: { year: 2026, books: 24, extra: 1 } }))
    await assertFails(updateDoc(doc(db('bob'), 'users', 'mia'), { readingGoal: { year: 2026, books: 24 } }))
  })
})

describe('notifications (CMN-30)', () => {
  it('only the recipient reads, marks read, deletes; clients cannot create', async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'users/mia/notifications/n1'), {
      spaceId: SID, type: 'mention', actorId: 'bob', refPath: '/', title: 't', body: 'b', read: false, createdAt: null,
    }))
    const ref = (uid: string, id = 'n1') => doc(db(uid), 'users', 'mia', 'notifications', id)
    await assertSucceeds(getDoc(ref('mia')))
    await assertFails(getDoc(ref('bob')))
    await assertFails(setDoc(ref('mia', 'n2'), { type: 'mention', read: false }))
    await assertFails(setDoc(ref('bob', 'n2'), { type: 'mention', read: false }))
    await assertFails(updateDoc(ref('mia'), { title: 'x' }))
    await assertFails(updateDoc(ref('bob'), { read: true }))
    await assertSucceeds(updateDoc(ref('mia'), { read: true }))
    await assertFails(deleteDoc(ref('bob')))
    await assertSucceeds(deleteDoc(ref('mia')))
  })
})

describe('notification settings (ACC-20)', () => {
  it('only the user changes only their notifications map', async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'users/mia'), { displayName: 'Mia' }))
    const ref = (uid: string) => doc(db(uid), 'users', 'mia')
    await assertSucceeds(updateDoc(ref('mia'), { notifications: { mention: { inApp: false } } }))
    await assertFails(updateDoc(ref('bob'), { notifications: { mention: { inApp: false } } }))
    await assertFails(updateDoc(ref('mia'), { displayName: 'X' }))
    await assertFails(updateDoc(ref('mia'), { notifications: { other: { inApp: false } } }))
    await assertSucceeds(updateDoc(ref('mia'), { notifications: { feedbackRequest: { inApp: false }, feedback: { inApp: true } } }))
  })
})

describe('activities (CMN-10)', () => {
  it('members read public activities, private only by owner, nobody writes', async () => {
    const seed = (id: string, data: object) => env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'spaces', SID, 'activities', id), data))
    await seed('a1', { uid: 'bob', visibility: 'space', type: 'session' })
    await seed('a2', { uid: 'bob', visibility: 'private', type: 'session' })
    const ref = (uid: string | undefined, id: string) => doc(db(uid), 'spaces', SID, 'activities', id)
    await assertSucceeds(getDoc(ref('mia', 'a1')))
    await assertFails(getDoc(ref('mia', 'a2')))
    await assertSucceeds(getDoc(ref('bob', 'a2')))
    await assertFails(getDoc(ref(undefined, 'a1')))
    await assertSucceeds(getDocs(query(collection(db('mia'), 'spaces', SID, 'activities'), where('visibility', '==', 'space'))))
    await assertFails(getDocs(collection(db('mia'), 'spaces', SID, 'activities')))
    await assertFails(setDoc(ref('mia', 'a3'), { uid: 'mia', visibility: 'space' }))
  })
})

describe('tags (CMN-51)', () => {
  it('members read and create, only managers rename or delete', async () => {
    const ref = (u: string | undefined, id: string) => doc(db(u), 'spaces', SID, 'tags', id)
    const tag = (u: string, name = '시험') => ({ name, color: 'blue', createdBy: u, createdAt: serverTimestamp() })
    await assertSucceeds(setDoc(ref('bob', '시험'), tag('bob')))
    await assertSucceeds(getDoc(ref('bob', '시험')))
    await assertFails(getDoc(ref('lee', '시험')))
    await assertFails(getDoc(ref(undefined, '시험')))
    await assertFails(setDoc(ref('bob', 'x'), tag('mia')))
    await assertFails(setDoc(ref('bob', 'y'), { ...tag('bob'), extra: 1 }))
    await assertFails(setDoc(ref('bob', 'z'), tag('bob', 'a'.repeat(31))))
    await assertFails(setDoc(ref('lee', 'w'), tag('lee')))
    await assertFails(setDoc(ref('bob', '시험'), tag('bob', '덮어쓰기')))
    await assertFails(updateDoc(ref('bob', '시험'), { color: 'red' }))
    await assertSucceeds(updateDoc(ref('mia', '시험'), { color: 'red' }))
    await assertFails(updateDoc(ref('mia', '시험'), { createdBy: 'mia' }))
    await assertFails(deleteDoc(ref('bob', '시험')))
    await assertSucceeds(deleteDoc(ref('mia', '시험')))
  })
})

describe('missions (2-E1, MIS-10~12·14·34)', () => {
  const mission = (over: object = {}) => ({
    title: '매일 영어 일기',
    description: '',
    type: 'check',
    recurrence: { kind: 'daily', weekdays: [] },
    startDate: '2026-10-12',
    endDate: null,
    allowLate: false,
    assignees: { all: true, uids: [] },
    includeSelf: false,
    joinable: false,
    isPersonal: false,
    notifyOnComplete: 'feed',
    reviewerIds: [],
    hostIds: ['bob'],
    participantIds: ['alice', 'mia'],
    createdBy: 'bob',
    closedAt: null,
    ...over,
  })
  const ref = (uid: string, id: string, sid = SID) => doc(db(uid), 'spaces', sid, 'missions', id)
  const goal = { isPersonal: true, hostIds: ['bob'], participantIds: ['bob'], assignees: { all: false, uids: ['bob'] } }

  it('members host missions as themselves; whoCanHost=managers limits to managers but not personal goals', async () => {
    await assertSucceeds(setDoc(ref('bob', 'm1'), mission()))
    await assertFails(setDoc(ref('bob', 'm2'), mission({ createdBy: 'alice' })))
    await assertFails(setDoc(ref('bob', 'm3'), mission({ hostIds: ['alice'] })))
    await assertFails(setDoc(ref('bob', 'm4'), mission({ endDate: '2026-10-01' })))
    await assertFails(setDoc(ref('lee', 'm5'), mission({ createdBy: 'lee', hostIds: ['lee'] })))
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'spaces', SID), { 'settings.whoCanHost': 'managers' }))
    await assertFails(setDoc(ref('bob', 'm6'), mission()))
    await assertSucceeds(setDoc(ref('bob', 'g1'), mission(goal)))
    await assertSucceeds(setDoc(ref('mia', 'm7'), mission({ createdBy: 'mia', hostIds: ['mia'] })))
  })

  it('personal goals stay with their creator; the personal space only takes personal goals', async () => {
    await assertFails(setDoc(ref('bob', 'g2'), mission({ ...goal, participantIds: ['bob', 'alice'] })))
    await assertSucceeds(setDoc(ref('bob', 'g1'), mission(goal)))
    await assertFails(getDoc(ref('alice', 'g1')))
    await assertSucceeds(getDoc(ref('bob', 'g1')))
    await assertSucceeds(getDocs(query(collection(db('alice'), 'spaces', SID, 'missions'), or(where('isPersonal', '==', false), where('createdBy', '==', 'alice')))))
    const own = { ...goal, hostIds: ['alice'], participantIds: ['alice'], createdBy: 'alice' }
    await assertSucceeds(setDoc(ref('alice', 'pg', 'p_alice'), mission(own)))
    await assertFails(setDoc(ref('alice', 'pm', 'p_alice'), mission({ createdBy: 'alice', hostIds: ['alice'] })))
  })

  it('only hosts edit or close; the creator stays and nobody deletes a shared mission', async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'spaces', SID, 'missions', 'm1'), mission({ hostIds: ['bob', 'mia'] })))
    await assertSucceeds(updateDoc(ref('mia', 'm1'), { title: '주 3회 일기', closedAt: serverTimestamp() }))
    await assertFails(updateDoc(ref('alice', 'm1'), { title: 'x' }))
    await assertFails(updateDoc(ref('bob', 'm1'), { createdBy: 'mia' }))
    await assertFails(updateDoc(ref('bob', 'm1'), { isPersonal: true }))
    await assertFails(deleteDoc(ref('bob', 'm1')))
    await assertSucceeds(getDoc(ref('alice', 'm1')))
  })
})

describe('mission join and submissions (2-E2, MIS-21~24·32)', () => {
  const base = {
    title: '독후감', description: '', type: 'submission', recurrence: { kind: 'once', weekdays: [] }, startDate: '2026-10-12', endDate: null,
    allowLate: false, assignees: { all: false, uids: ['alice'] }, includeSelf: false, joinable: true, isPersonal: false, notifyOnComplete: 'feed',
    reviewerIds: ['mia'], hostIds: ['bob'], participantIds: ['alice'], createdBy: 'bob', closedAt: null,
  }
  const mref = (uid: string) => doc(db(uid), 'spaces', SID, 'missions', 'm1')
  const sref = (uid: string, id: string) => doc(db(uid), 'spaces', SID, 'missions', 'm1', 'submissions', id)
  const sub = (over: object = {}) => ({ uid: 'alice', periodKey: 'once', status: 'submitted', content: '재밌었다', pageId: null, late: false, reviewerUids: ['bob', 'mia'], submittedAt: serverTimestamp(), ...over })
  const seed = (over: object = {}) => env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'spaces', SID, 'missions', 'm1'), { ...base, ...over }))

  it('members join or leave open missions only for themselves', async () => {
    await seed()
    await assertFails(updateDoc(mref('mia'), { participantIds: ['alice', 'bob'] }))
    await assertFails(updateDoc(mref('mia'), { participantIds: ['alice', 'mia'], title: 'x' }))
    await assertSucceeds(updateDoc(mref('mia'), { participantIds: ['alice', 'mia'] }))
    await assertSucceeds(updateDoc(mref('mia'), { participantIds: ['alice'] }))
    await seed({ joinable: false })
    await assertFails(updateDoc(mref('mia'), { participantIds: ['alice', 'mia'] }))
  })

  it('participants submit their own period; reviewers are hosts and reviewers minus the submitter', async () => {
    await seed()
    await assertSucceeds(setDoc(sref('alice', 'alice_once'), sub()))
    await assertFails(setDoc(sref('alice', 'alice_x'), sub({ periodKey: 'once' })))
    await assertFails(setDoc(sref('mia', 'mia_once'), sub({ uid: 'mia' })))
    await assertFails(setDoc(sref('alice', 'alice_once'), sub({ status: 'approved' })))
    await assertFails(setDoc(sref('alice', 'alice_once'), sub({ reviewerUids: ['bob'] })))
    await assertFails(setDoc(sref('alice', 'alice_once'), sub({ late: true })))
    await assertSucceeds(getDoc(sref('mia', 'alice_once')))
    await assertSucceeds(getDoc(sref('bob', 'alice_once')))
    await assertFails(getDoc(sref('lee', 'alice_once')))
    await assertSucceeds(deleteDoc(sref('alice', 'alice_once')))
  })

  it('check missions are done at once; nothing is submitted after the mission closes', async () => {
    await seed({ type: 'check' })
    await assertFails(setDoc(sref('alice', 'alice_once'), sub()))
    await assertSucceeds(setDoc(sref('alice', 'alice_once'), sub({ status: 'done' })))
    await seed({ closedAt: serverTimestamp() })
    await assertFails(setDoc(sref('alice', 'alice_once'), sub()))
  })

  it('test-linked missions (MIS-16): only the server creates or completes them; hosts may only close', async () => {
    const linked = { type: 'auto', reviewerIds: [], joinable: false, autoRule: { kind: 'test', targetId: 't1', threshold: null }, linked: { type: 'test', id: 't1' } }
    await assertFails(setDoc(doc(db('bob'), 'spaces', SID, 'missions', 'm2'), { ...base, ...linked }))
    await seed(linked)
    await assertFails(setDoc(sref('alice', 'alice_once'), sub({ status: 'done', reviewerUids: ['bob'] })))
    await assertFails(updateDoc(mref('bob'), { title: '바꿈' }))
    await assertFails(updateDoc(mref('bob'), { type: 'check' }))
    await assertSucceeds(updateDoc(mref('bob'), { closedAt: serverTimestamp(), updatedAt: serverTimestamp() }))
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'spaces', SID, 'missions', 'm1', 'submissions', 'alice_once'), sub({ status: 'done', reviewerUids: ['bob'] })))
    await assertFails(deleteDoc(sref('alice', 'alice_once')))
  })
})

describe('mission review (2-E3, MIS-31)', () => {
  const s = { uid: 'alice', periodKey: 'once', status: 'submitted', content: 'x', pageId: null, late: false, reviewerUids: ['bob', 'mia'] }
  const seed = (over: object = {}) => env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'spaces', SID, 'missions', 'm1'), { title: 'm', type: 'submission', isPersonal: false, createdBy: 'bob', hostIds: ['bob'], reviewerIds: ['mia'], participantIds: ['alice'], closedAt: null })
    await setDoc(doc(ctx.firestore(), 'spaces', SID, 'missions', 'm1', 'submissions', 'alice_once'), { ...s, ...over })
  })
  const ref = (uid: string) => doc(db(uid), 'spaces', SID, 'missions', 'm1', 'submissions', 'alice_once')
  const verdict = (uid: string, status: string, extra: object = {}) => updateDoc(ref(uid), { status, reviewedBy: uid, reviewedAt: serverTimestamp(), ...extra })

  it('reviewers approve or reject pending submissions; others cannot', async () => {
    await seed()
    await assertFails(verdict('alice', 'approved'))
    await assertFails(verdict('lee', 'approved'))
    await assertFails(updateDoc(ref('mia'), { status: 'approved', reviewedBy: 'bob', reviewedAt: serverTimestamp() }))
    await assertFails(verdict('mia', 'done'))
    await assertSucceeds(verdict('mia', 'rejected', { reason: '분량이 부족해요' }))
    await assertFails(verdict('bob', 'approved'))
    await seed()
    await assertSucceeds(verdict('bob', 'approved'))
  })
})

describe('shelf (2-C1, READ-01~03·10)', () => {
  const book = (uid: string, over: object = {}) => ({ uid, bookKey: 'isbn:9788936434120', title: '소년이 온다', authors: ['한강'], publisher: '창비', cover: 'https://img/x.jpg', format: 'paper', total: { pages: 216, minutes: null }, status: 'want', rating: null, ...over })
  const ref = (uid: string, id: string) => doc(db(uid), 'spaces', SID, 'shelf', id)

  it('members shelve books only as themselves under uid_bookKey; others read but cannot change them', async () => {
    await assertSucceeds(setDoc(ref('bob', 'bob_isbn:9788936434120'), book('bob')))
    await assertFails(setDoc(ref('bob', 'alice_isbn:9788936434120'), book('alice')))
    await assertFails(setDoc(ref('bob', 'bob_other'), book('bob')))
    await assertFails(setDoc(ref('bob', 'bob_isbn:9788936434120'), book('bob', { cover: 'http://img/x.jpg' })))
    await assertFails(setDoc(ref('lee', 'lee_isbn:9788936434120'), book('lee')))
    await assertSucceeds(getDoc(ref('alice', 'bob_isbn:9788936434120')))
    await assertFails(updateDoc(ref('alice', 'bob_isbn:9788936434120'), { status: 'done' }))
    await assertSucceeds(updateDoc(ref('bob', 'bob_isbn:9788936434120'), { status: 'done', rating: 5 }))
    await assertFails(updateDoc(ref('bob', 'bob_isbn:9788936434120'), { rating: 6 }))
    await assertSucceeds(updateDoc(ref('bob', 'bob_isbn:9788936434120'), { position: { page: 120 }, startedAt: '2026-10-01', finishedAt: '2026-10-12' }))
    await assertFails(updateDoc(ref('bob', 'bob_isbn:9788936434120'), { startedAt: 'yesterday' }))
    await assertFails(deleteDoc(ref('alice', 'bob_isbn:9788936434120')))
    await assertSucceeds(deleteDoc(ref('bob', 'bob_isbn:9788936434120')))
  })

  it('book groups are server-only', async () => {
    await assertSucceeds(getDocs(collection(db('bob'), 'spaces', SID, 'books')))
    await assertFails(setDoc(doc(db('bob'), 'spaces', SID, 'books', 'isbn:9788936434120'), { title: 'x' }))
  })
})

describe('reading logs (2-C3, READ-20·23; others see them like study sessions)', () => {
  const log = (uid: string, over: object = {}) => ({ uid, bookKey: 'isbn:9788936434120', title: '소년이 온다', date: '2026-10-12', unit: 'page', from: 10, to: 40, minutes: 30, memo: '', ...over })
  const ref = (uid: string, id: string) => doc(db(uid), 'spaces', SID, 'readingLogs', id)

  it('members log only as themselves and only they read their logs', async () => {
    await assertSucceeds(setDoc(ref('bob', 'l1'), log('bob')))
    await assertFails(setDoc(ref('bob', 'l2'), log('alice')))
    await assertFails(setDoc(ref('bob', 'l3'), log('bob', { unit: 'chapter' })))
    await assertFails(setDoc(ref('lee', 'l4'), log('lee')))
    await assertSucceeds(getDocs(query(collection(db('bob'), 'spaces', SID, 'readingLogs'), where('uid', '==', 'bob'), where('bookKey', '==', 'isbn:9788936434120'))))
    await assertSucceeds(getDoc(ref('alice', 'l1')))
    await assertFails(getDoc(ref('lee', 'l1')))
    await assertFails(deleteDoc(ref('alice', 'l1')))
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'spaces', SID, 'members', 'bob'), { hideProgress: true }))
    await assertFails(getDoc(ref('alice', 'l1')))
    await assertSucceeds(getDoc(ref('bob', 'l1')))
    await assertSucceeds(deleteDoc(ref('bob', 'l1')))
  })
})

describe('quotes (2-C4, READ-30·31)', () => {
  const quote = (uid: string, over: object = {}) => ({ uid, bookKey: 'isbn:9788936434120', title: '소년이 온다', date: '2026-10-12', unit: 'page', position: 12, text: '너는 내 손을 잡고', visibility: 'private', ...over })
  const ref = (uid: string, id: string) => doc(db(uid), 'spaces', SID, 'quotes', id)
  const quotes = (uid: string) => collection(db(uid), 'spaces', SID, 'quotes')

  it('private quotes are only for the author, space quotes for all members', async () => {
    await assertSucceeds(setDoc(ref('bob', 'q1'), quote('bob')))
    await assertSucceeds(setDoc(ref('bob', 'q2'), quote('bob', { visibility: 'space' })))
    await assertFails(setDoc(ref('bob', 'q3'), quote('alice')))
    await assertFails(setDoc(ref('bob', 'q4'), quote('bob', { text: '' })))
    await assertFails(setDoc(ref('bob', 'q5'), quote('bob', { visibility: 'group' })))
    await assertFails(setDoc(ref('lee', 'q6'), quote('lee')))
    await assertFails(getDoc(ref('alice', 'q1')))
    await assertSucceeds(getDoc(ref('alice', 'q2')))
    await assertFails(getDoc(ref('lee', 'q2')))
    await assertSucceeds(getDocs(query(quotes('alice'), where('visibility', '==', 'space'))))
    await assertFails(getDocs(quotes('alice')))
    await assertSucceeds(getDocs(query(quotes('bob'), where('uid', '==', 'bob'), where('date', '==', '2026-10-12'))))
    await assertFails(updateDoc(ref('alice', 'q2'), { visibility: 'private' }))
    await assertSucceeds(updateDoc(ref('bob', 'q1'), { visibility: 'space' }))
    await assertFails(deleteDoc(ref('alice', 'q2')))
    await assertSucceeds(deleteDoc(ref('bob', 'q2')))
  })
})

describe('former workspace records (ACC-32)', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const d = ctx.firestore()
      const page = { type: 'page', root: 'shared', visibility: 'space', deletedAt: null, editorIds: [] }
      await setDoc(doc(d, 'spaces', SID, 'pages', 'lp'), { ...page, title: '내 노트', ownerId: 'lee', ownerStatus: 'left' })
      await setDoc(doc(d, 'spaces', SID, 'pages', 'lp', 'blocks', 'b1'), { type: 'paragraph', order: 'a0', content: [] })
      await setDoc(doc(d, 'spaces', SID, 'pages', 'ap'), { ...page, title: '남의 노트', ownerId: 'alice', ownerStatus: 'active' })
    })
  })

  it('a member who left reads only their own pages there, and cannot edit them', async () => {
    const d = db('lee')
    await assertSucceeds(getDoc(doc(d, 'spaces', SID, 'pages', 'lp')))
    await assertSucceeds(getDocs(collection(d, 'spaces', SID, 'pages', 'lp', 'blocks')))
    await assertSucceeds(getDocs(query(collection(d, 'spaces', SID, 'pages'), where('ownerId', '==', 'lee'), where('deletedAt', '==', null))))
    await assertFails(getDoc(doc(d, 'spaces', SID, 'pages', 'ap')))
    await assertFails(updateDoc(doc(d, 'spaces', SID, 'pages', 'lp'), { title: '고침' }))
    await assertFails(getDoc(doc(db('bob'), 'spaces', SID, 'pages', 'lp')))
  })
})

describe('question bank (3-A1, TST-01·07·08)', () => {
  const q = (uid: string, over: object = {}) => ({ type: 'short', prompt: '사과는 영어로?', choices: [], tags: [], difficulty: 'normal', defaultPoints: 10, createdBy: uid, sharing: 'private', answerVisibility: 'authors', rev: 1, deletedAt: null, ...over })
  const k = (uid: string, over: object = {}) => ({ answer: ['apple'], ignoreCase: true, ignoreSpaces: false, explanation: '', rubric: '', authorIds: [uid], answerVisibility: 'authors', ...over })
  const save = (uid: string, id: string, qo: object = {}, ko: object = {}) => {
    const d = db(uid)
    const b = writeBatch(d)
    b.set(doc(d, 'spaces', SID, 'questions', id), q(uid, qo))
    b.set(doc(d, 'spaces', SID, 'questionKeys', id), k(uid, ko))
    return b.commit()
  }
  const qRef = (uid: string, id: string) => doc(db(uid), 'spaces', SID, 'questions', id)
  const kRef = (uid: string, id: string) => doc(db(uid), 'spaces', SID, 'questionKeys', id)

  it('private questions and hidden answers stay with the author', async () => {
    await assertSucceeds(save('bob', 'q1'))
    await assertSucceeds(save('bob', 'q2', { sharing: 'space' }))
    await assertSucceeds(save('bob', 'q3', { sharing: 'space', answerVisibility: 'space' }, { answerVisibility: 'space' }))
    await assertFails(getDoc(qRef('alice', 'q1')))
    await assertSucceeds(getDoc(qRef('alice', 'q2')))
    await assertFails(getDoc(kRef('alice', 'q2')))
    await assertSucceeds(getDoc(kRef('alice', 'q3')))
    await assertSucceeds(getDoc(kRef('bob', 'q2')))
    await assertFails(getDoc(qRef('lee', 'q2')))
    await assertSucceeds(getDocs(query(collection(db('alice'), 'spaces', SID, 'questions'), where('sharing', '==', 'space'))))
    await assertFails(getDocs(collection(db('alice'), 'spaces', SID, 'questions')))
  })

  it('only the author edits; keys must match the question', async () => {
    await assertSucceeds(save('bob', 'q4'))
    await assertFails(save('alice', 'q4'))
    await assertFails(updateDoc(qRef('alice', 'q4'), { prompt: '바꿈' }))
    await assertSucceeds(updateDoc(qRef('bob', 'q4'), { prompt: '바꿈', rev: 2 }))
    await assertFails(save('bob', 'q5', {}, { answerVisibility: 'space' }))
    await assertFails(save('bob', 'q6', {}, { authorIds: ['bob', 'alice'] }))
    await assertFails(save('bob', 'q7', { type: 'drawing' }))
    await assertFails(setDoc(kRef('alice', 'q8'), k('alice')))
    await assertFails(deleteDoc(qRef('bob', 'q4')))
    await assertFails(save('lee', 'q9'))
  })

  it('15 generated questions with keys fit in one batch (TST-03)', async () => {
    const d = db('bob')
    const b = writeBatch(d)
    for (let i = 0; i < 15; i++) {
      b.set(doc(d, 'spaces', SID, 'questions', `g${i}`), q('bob', { type: 'single', choices: ['a', 'b', 'c', 'd'] }))
      b.set(doc(d, 'spaces', SID, 'questionKeys', `g${i}`), k('bob', { answer: [0] }))
    }
    await assertSucceeds(b.commit())
  })

  it('subject and up to 5 media files', async () => {
    const f = { id: 'f1', name: 'a.png', path: `spaces/${SID}/files/bob/f1/a.png`, contentType: 'image/png', size: 10 }
    await assertSucceeds(save('bob', 'q10', { subjectId: 's1', media: [f] }))
    await assertFails(save('bob', 'q11', { media: Array.from({ length: 6 }, () => f) }))
  })
})


describe('numeric keys and units (MATH-12·13)', () => {
  const q = { type: 'short', prompt: '1/2+1/4', choices: [], tags: [], difficulty: 'normal', defaultPoints: 10, createdBy: 'bob', sharing: 'private', answerVisibility: 'authors', rev: 1, deletedAt: null }
  const k = { answer: ['3/4'], ignoreCase: true, ignoreSpaces: false, explanation: '', rubric: '', authorIds: ['bob'], answerVisibility: 'authors' }
  const save = (qo: object, ko: object) => {
    const d = db('bob')
    const b = writeBatch(d)
    b.set(doc(d, 'spaces', SID, 'questions', 'n1'), { ...q, ...qo })
    b.set(doc(d, 'spaces', SID, 'questionKeys', 'n1'), { ...k, ...ko })
    return b.commit()
  }
  it('accepts a tolerance and a unit, rejects bad values', async () => {
    await assertSucceeds(save({ unit: { code: 'm1-04', custom: null } }, { tolerance: 0 }))
    await assertSucceeds(save({ unit: null }, { tolerance: null }))
    await assertFails(save({}, { tolerance: -1 }))
    await assertFails(save({}, { tolerance: '0' }))
    await assertFails(save({ unit: { code: 'm1', grade: 'm1' } }, {}))
  })
  it('stores a variant template only in the key', async () => {
    const template = { prompt: '{a}+{b}', explanation: '', hints: [], vars: [{ name: 'a', kind: 'int', min: 1, max: 9 }], calc: [], conds: [], answerExpr: 'a', wrongExprs: [] }
    await assertSucceeds(save({ variant: true }, { tolerance: 0, template }))
    await assertFails(save({ variant: 'yes' }, {}))
    await assertFails(save({}, { template: { ...template, secret: 1 } }))
    await assertFails(save({}, { template: { ...template, vars: Array.from({ length: 11 }, () => template.vars[0]) } }))
  })
})

describe('problem sets (MATH-10·13)', () => {
  const ps = (uid: string, over: object = {}) => ({ title: '일차방정식', description: '', grade: 'm1', unit: { code: 'm1-04', custom: null }, questionIds: [], visibility: 'private', editPolicy: 'owner', createdBy: uid, deletedAt: null, ...over })
  const ref = (uid: string, id: string, sid = SID) => doc(db(uid), 'spaces', sid, 'problemSets', id)

  it('private sets stay with the author; space sets are read by members', async () => {
    await assertSucceeds(setDoc(ref('bob', 's1'), ps('bob')))
    await assertSucceeds(setDoc(ref('bob', 's2'), ps('bob', { visibility: 'space' })))
    await assertFails(getDoc(ref('alice', 's1')))
    await assertSucceeds(getDoc(ref('alice', 's2')))
    await assertFails(getDoc(ref('lee', 's2')))
    await assertSucceeds(getDocs(query(collection(db('alice'), 'spaces', SID, 'problemSets'), where('visibility', '==', 'space'))))
    await assertFails(getDocs(collection(db('alice'), 'spaces', SID, 'problemSets')))
  })

  it('validates and owns', async () => {
    await assertFails(setDoc(ref('bob', 's3'), ps('alice')))
    await assertFails(setDoc(ref('bob', 's3'), ps('bob', { title: '' })))
    await assertFails(setDoc(ref('bob', 's3'), ps('bob', { editPolicy: 'members' })))
    await assertFails(setDoc(ref('bob', 's3'), ps('bob', { questionIds: Array.from({ length: 101 }, (_, i) => `q${i}`) })))
    await assertFails(setDoc(ref('pat', 's3'), ps('pat')))
    await assertSucceeds(setDoc(ref('alice', 'p1', 'p_alice'), ps('alice')))
    await assertFails(setDoc(ref('alice', 'p2', 'p_alice'), ps('alice', { visibility: 'space' })))
    await assertFails(deleteDoc(ref('bob', 's1')))
  })

  it('members edit only the question list of open space sets', async () => {
    await assertSucceeds(setDoc(ref('bob', 's4'), ps('bob', { visibility: 'space', editPolicy: 'members' })))
    await assertSucceeds(setDoc(ref('bob', 's5'), ps('bob', { visibility: 'space' })))
    await assertSucceeds(updateDoc(ref('alice', 's4'), { questionIds: ['qa'] }))
    await assertFails(updateDoc(ref('alice', 's4'), { title: '바꿈' }))
    await assertFails(updateDoc(ref('alice', 's5'), { questionIds: ['qa'] }))
    await assertSucceeds(updateDoc(ref('bob', 's5'), { title: '바꿈', questionIds: ['qb'] }))
    await assertFails(updateDoc(ref('bob', 's5'), { createdBy: 'alice' }))
  })
})

describe('problem solving (MATH-20~22)', () => {
  it('hint penalty and key hints are bounded', async () => {
    const ps = { title: '연습', description: '', grade: null, unit: null, questionIds: [], visibility: 'private', editPolicy: 'owner', createdBy: 'bob', deletedAt: null }
    await assertSucceeds(setDoc(doc(db('bob'), 'spaces', SID, 'problemSets', 'h1'), { ...ps, hintPenalty: 20 }))
    await assertFails(setDoc(doc(db('bob'), 'spaces', SID, 'problemSets', 'h2'), { ...ps, hintPenalty: 51 }))
    await assertFails(setDoc(doc(db('bob'), 'spaces', SID, 'problemSets', 'h3'), { ...ps, hintPenalty: 1.5 }))
    const q = { type: 'short', prompt: '1+1', choices: [], tags: [], difficulty: 'normal', defaultPoints: 10, createdBy: 'bob', sharing: 'private', answerVisibility: 'authors', rev: 1, deletedAt: null }
    const k = { answer: ['2'], ignoreCase: true, ignoreSpaces: false, explanation: '', rubric: '', authorIds: ['bob'], answerVisibility: 'authors' }
    const save = (hints: unknown) => {
      const d = db('bob')
      const b = writeBatch(d)
      b.set(doc(d, 'spaces', SID, 'questions', 'h1'), q)
      b.set(doc(d, 'spaces', SID, 'questionKeys', 'h1'), { ...k, hints })
      return b.commit()
    }
    await assertSucceeds(save(['하나씩 세요']))
    await assertFails(save(Array.from({ length: 6 }, () => '힌트')))
    await assertFails(save('힌트'))
  })

  it('attempts are read by their owner and written only by the server', async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'spaces', SID, 'problemAttempts', 'bob_q1'), { uid: 'bob', questionId: 'q1', seed: 7, tries: 1 }))
    await assertSucceeds(getDoc(doc(db('bob'), 'spaces', SID, 'problemAttempts', 'bob_q1')))
    await assertSucceeds(getDoc(doc(db('bob'), 'spaces', SID, 'problemAttempts', 'bob_q2')))
    await assertFails(getDoc(doc(db('alice'), 'spaces', SID, 'problemAttempts', 'bob_q1')))
    await assertFails(setDoc(doc(db('bob'), 'spaces', SID, 'problemAttempts', 'bob_q3'), { uid: 'bob', questionId: 'q3', tries: 0 }))
    await assertFails(updateDoc(doc(db('bob'), 'spaces', SID, 'problemAttempts', 'bob_q1'), { done: true }))
  })

  it('solution notes belong to their writer', async () => {
    const n = (uid: string, id: string) => doc(db(uid), 'spaces', SID, 'problemNotes', id)
    await assertSucceeds(getDoc(n('bob', 'bob_q1')))
    await assertSucceeds(setDoc(n('bob', 'bob_q1'), { uid: 'bob', questionId: 'q1', text: '$x=2$', updatedAt: serverTimestamp() }))
    await assertFails(setDoc(n('bob', 'bob_q2'), { uid: 'bob', questionId: 'q1', text: '' }))
    await assertFails(setDoc(n('bob', 'alice_q1'), { uid: 'alice', questionId: 'q1', text: '' }))
    await assertFails(setDoc(n('bob', 'bob_q3'), { uid: 'bob', questionId: 'q3', text: 'x'.repeat(5001) }))
    await assertFails(getDoc(n('alice', 'bob_q1')))
    await assertFails(getDoc(n('lee', 'lee_q1')))
    await assertSucceeds(deleteDoc(n('bob', 'bob_q1')))
  })
})

describe('wrong notes (3-C1, WRN-01·03)', () => {
  it('are read only by their owner and written only by the server', async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'spaces', SID, 'wrongNotes', 'bob_card_c1'), { uid: 'bob', refType: 'card', refId: 'c1', wrongCount: 1, resolved: false, consecutiveCorrect: 1 }))
    const n = (uid: string, id: string) => doc(db(uid), 'spaces', SID, 'wrongNotes', id)
    await assertSucceeds(getDoc(n('bob', 'bob_card_c1')))
    await assertSucceeds(getDocs(query(collection(db('bob'), 'spaces', SID, 'wrongNotes'), where('uid', '==', 'bob'))))
    await assertFails(getDoc(n('alice', 'bob_card_c1')))
    await assertFails(getDoc(n('lee', 'lee_card_c1')))
    await assertFails(setDoc(n('bob', 'bob_card_c2'), { uid: 'bob', refType: 'card', refId: 'c2', wrongCount: 0 }))
    await assertFails(updateDoc(n('bob', 'bob_card_c1'), { wrongCount: 0 }))
    await assertSucceeds(updateDoc(n('bob', 'bob_card_c1'), { resolved: true, resolvedAt: serverTimestamp(), consecutiveCorrect: 0 }))
    await assertSucceeds(updateDoc(n('bob', 'bob_card_c1'), { resolved: false, resolvedAt: null, consecutiveCorrect: 0 }))
    await assertFails(updateDoc(n('bob', 'bob_card_c1'), { resolved: true, consecutiveCorrect: 2 }))
    await assertFails(updateDoc(n('alice', 'bob_card_c1'), { resolved: true, consecutiveCorrect: 0 }))
    await assertFails(deleteDoc(n('bob', 'bob_card_c1')))
  })
})

describe('tests (3-B1, TST-10~16)', () => {
  const settings = { timeLimitMin: null, openAt: null, closeAt: null, maxAttempts: 1, scoring: 'best', shuffleQuestions: false, shuffleChoices: false, resultRelease: 'instant', practice: false }
  const t = (uid: string, over: object = {}) => ({ title: '1단원', description: '', questionRefs: [{ questionId: 'q1', points: 10 }], settings, assignees: { all: true, uids: [], groupIds: [] }, status: 'draft', createdBy: uid, hostIds: [uid], deletedAt: null, ...over })
  const tRef = (uid: string, id: string) => doc(db(uid), 'spaces', SID, 'tests', id)

  it('hosts create and edit drafts; others cannot see drafts or open them', async () => {
    await assertSucceeds(setDoc(tRef('bob', 't1'), t('bob')))
    await assertFails(setDoc(tRef('bob', 't2'), t('bob', { status: 'open' })))
    await assertFails(setDoc(tRef('bob', 't3'), t('bob', { participantIds: ['bob'] })))
    await assertFails(setDoc(tRef('pat', 't4'), t('pat')))
    await assertFails(getDoc(tRef('alice', 't1')))
    await assertSucceeds(updateDoc(tRef('bob', 't1'), { title: '고침' }))
    await assertSucceeds(updateDoc(tRef('bob', 't1'), { mission: { enabled: true, minScore: 8 } }))
    await assertFails(updateDoc(tRef('bob', 't1'), { mission: { enabled: true, minScore: 0 } }))
    await assertFails(updateDoc(tRef('bob', 't1'), { missionId: 'm1' }))
    await assertFails(setDoc(tRef('bob', 't5'), t('bob', { missionId: 'm1' })))
    await assertFails(updateDoc(tRef('bob', 't1'), { status: 'open' }))
    await assertFails(updateDoc(tRef('bob', 't1'), { hostIds: ['bob', 'alice'] }))
    await assertFails(updateDoc(tRef('alice', 't1'), { title: '남의 것' }))
  })

  it('open tests: takers read the test and paper, only hosts read the key, hosts only close', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const d = ctx.firestore()
      await setDoc(doc(d, 'spaces', SID, 'tests', 'o1'), t('bob', { status: 'open', participantIds: ['alice'] }))
      await setDoc(doc(d, 'spaces', SID, 'tests', 'o1', 'paper', 'main'), { items: [], hostIds: ['bob'] })
      await setDoc(doc(d, 'spaces', SID, 'tests', 'o1', 'secret', 'key'), { items: {} })
      await setDoc(doc(d, 'spaces', SID, 'tests', 'o2'), t('bob', { status: 'open', participantIds: ['alice'], settings: { ...settings, openAt: Date.now() + 3600_000 } }))
      await setDoc(doc(d, 'spaces', SID, 'tests', 'o2', 'paper', 'main'), { items: [], hostIds: ['bob'] })
    })
    await assertSucceeds(getDoc(tRef('alice', 'o1')))
    await assertSucceeds(getDocs(query(collection(db('alice'), 'spaces', SID, 'tests'), where('participantIds', 'array-contains', 'alice'), where('status', 'in', ['open', 'closed']))))
    await assertFails(getDoc(tRef('mia', 'o1')))
    await assertSucceeds(getDoc(doc(db('alice'), 'spaces', SID, 'tests', 'o1', 'paper', 'main')))
    await assertFails(getDoc(doc(db('alice'), 'spaces', SID, 'tests', 'o2', 'paper', 'main')))
    await assertSucceeds(getDoc(doc(db('bob'), 'spaces', SID, 'tests', 'o2', 'paper', 'main')))
    await assertSucceeds(getDoc(doc(db('bob'), 'spaces', SID, 'tests', 'o1', 'secret', 'key')))
    await assertFails(setDoc(doc(db('bob'), 'spaces', SID, 'tests', 'o1', 'paper', 'main'), { items: [], hostIds: ['bob'] }))
    await assertFails(updateDoc(tRef('bob', 'o1'), { title: '열린 뒤 고침' }))
    await assertFails(updateDoc(tRef('bob', 'o1'), { status: 'draft' }))
    await assertSucceeds(updateDoc(tRef('bob', 'o1'), { status: 'closed' }))
  })
})

describe('attempts and results (3-B2, TST-21~23)', () => {
  const settings = { timeLimitMin: null, openAt: null, closeAt: null, maxAttempts: 1, scoring: 'best', shuffleQuestions: false, shuffleChoices: false, resultRelease: 'hidden', practice: false }
  const aRef = (uid: string, id: string) => doc(db(uid), 'spaces', SID, 'tests', 'x1', 'attempts', id)
  const rRef = (uid: string, id: string) => doc(db(uid), 'spaces', SID, 'tests', 'x1', 'results', id)
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const d = ctx.firestore()
      const base = { uid: 'alice', isPractice: false, submittedAt: null, order: ['q1'], choiceOrder: {}, answers: {}, maxScore: 10, hostIds: ['bob'], gradingStatus: null }
      await setDoc(doc(d, 'spaces', SID, 'tests', 'x1'), { title: 't', description: '', questionRefs: [], settings, assignees: { all: true, uids: [], groupIds: [] }, status: 'open', createdBy: 'bob', hostIds: ['bob'], participantIds: ['alice'], deletedAt: null })
      await setDoc(doc(d, 'spaces', SID, 'tests', 'x1', 'attempts', 'a1'), { ...base, deadlineAt: Timestamp.fromMillis(Date.now() + 600_000) })
      await setDoc(doc(d, 'spaces', SID, 'tests', 'x1', 'attempts', 'late'), { ...base, deadlineAt: Timestamp.fromMillis(Date.now() - 120_000) })
      await setDoc(doc(d, 'spaces', SID, 'tests', 'x1', 'attempts', 'done'), { ...base, deadlineAt: null, submittedAt: Timestamp.now() })
      await setDoc(doc(d, 'spaces', SID, 'tests', 'x1', 'results', 'done'), { uid: 'alice', isPractice: false, score: 5, maxScore: 10, gradingStatus: 'done', items: {}, comments: {}, hostIds: ['bob'] })
    })
  })

  it('takers save answers before the deadline only; nobody else writes', async () => {
    await assertSucceeds(getDoc(aRef('alice', 'a1')))
    await assertSucceeds(getDoc(aRef('bob', 'a1')))
    await assertFails(getDoc(aRef('mia', 'a1')))
    await assertSucceeds(updateDoc(aRef('alice', 'a1'), { answers: { q1: [0] } }))
    await assertFails(updateDoc(aRef('alice', 'a1'), { submittedAt: Timestamp.now() }))
    await assertFails(updateDoc(aRef('alice', 'late'), { answers: { q1: [1] } }))
    await assertFails(updateDoc(aRef('alice', 'done'), { answers: { q1: [1] } }))
    await assertFails(updateDoc(aRef('bob', 'a1'), { answers: { q1: [1] } }))
    await assertFails(setDoc(aRef('alice', 'new'), { uid: 'alice' }))
  })

  it('only hosts read the answer key; results are server-written', async () => {
    await env.withSecurityRulesDisabled(async ctx => setDoc(doc(ctx.firestore(), 'spaces', SID, 'tests', 'x1', 'secret', 'key'), { items: {} }))
    await assertSucceeds(getDoc(doc(db('bob'), 'spaces', SID, 'tests', 'x1', 'secret', 'key')))
    await assertFails(getDoc(doc(db('alice'), 'spaces', SID, 'tests', 'x1', 'secret', 'key')))
    await assertFails(updateDoc(rRef('bob', 'done'), { score: 10 }))
  })

  it('results follow the release setting; hosts always read', async () => {
    await assertFails(getDoc(rRef('alice', 'done')))
    await assertSucceeds(getDoc(rRef('bob', 'done')))
    await assertFails(setDoc(rRef('alice', 'x'), { uid: 'alice', score: 10 }))
    await env.withSecurityRulesDisabled(async ctx => updateDoc(doc(ctx.firestore(), 'spaces', SID, 'tests', 'x1'), { 'settings.resultRelease': 'afterClose' }))
    await assertFails(getDoc(rRef('alice', 'done')))
    await env.withSecurityRulesDisabled(async ctx => updateDoc(doc(ctx.firestore(), 'spaces', SID, 'tests', 'x1'), { status: 'closed' }))
    await assertSucceeds(getDoc(rRef('alice', 'done')))
  })
})
