import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
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
