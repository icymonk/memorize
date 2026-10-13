import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
import { deleteObject, getBytes, ref, uploadString } from 'firebase/storage'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let env: RulesTestEnvironment
const hostPort = (v: string | undefined, d: string) => {
  const [host, port] = (v ?? d).split(':')
  return { host: host!, port: Number(port) }
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-memorize-rules',
    storage: { ...hostPort(process.env.FIREBASE_STORAGE_EMULATOR_HOST, '127.0.0.1:9199'), rules: readFileSync(resolve(import.meta.dirname, '../../storage.rules'), 'utf8') },
    firestore: { ...hostPort(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080'), rules: readFileSync(resolve(import.meta.dirname, '../../firestore.rules'), 'utf8') },
  })
})
afterAll(() => env.cleanup())
beforeEach(async () => {
  await env.clearStorage()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore()
    await setDoc(doc(d, 'spaces/ws1/members/alice'), { access: 'owner', status: 'active' })
    await setDoc(doc(d, 'spaces/ws1/members/bob'), { access: 'member', status: 'active' })
    await setDoc(doc(d, 'spaces/ws1/members/lee'), { access: 'member', status: 'left' })
  })
})

const st = (uid?: string) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).storage()
const file = (uid: string | undefined, owner = 'bob', name = 'a.txt') => ref(st(uid), `spaces/ws1/files/${owner}/f1234567/${name}`)
const text = { contentType: 'text/plain' }

describe('storage (security.md 4절, CMN-60·61)', () => {
  it('active members upload into their own folder and read each other\'s files', async () => {
    await assertSucceeds(uploadString(file('bob'), 'hi', 'raw', text))
    await assertSucceeds(getBytes(file('alice')))
    await assertSucceeds(getBytes(file('bob')))
  })
  it('no uploads into another member\'s folder, by left members, outsiders or signed-out users', async () => {
    await assertFails(uploadString(file('alice'), 'hi', 'raw', text))
    await assertFails(uploadString(file('lee', 'lee'), 'hi', 'raw', text))
    await assertFails(uploadString(file('zed', 'zed'), 'hi', 'raw', text))
    await assertFails(uploadString(file(undefined), 'hi', 'raw', text))
  })
  it('only allowed file types', async () => {
    await assertFails(uploadString(file('bob', 'bob', 'x.woff2'), 'hi', 'raw', { contentType: 'font/woff2' }))
  })
  it('left members and outsiders cannot read; only the owner deletes', async () => {
    await assertSucceeds(uploadString(file('bob'), 'hi', 'raw', text))
    await assertFails(getBytes(file('lee')))
    await assertFails(getBytes(file('zed')))
    await assertFails(deleteObject(file('alice')))
    await assertSucceeds(deleteObject(file('bob')))
  })
  it('other paths stay closed', async () => {
    await assertFails(uploadString(ref(st('bob'), 'spaces/ws1/derived/x.txt'), 'hi', 'raw', text))
    await assertFails(uploadString(ref(st('bob'), 'x.txt'), 'hi', 'raw', text))
  })
})
