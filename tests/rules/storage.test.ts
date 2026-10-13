import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { getBytes, ref, uploadString } from 'firebase/storage'
import { afterAll, beforeAll, describe, it } from 'vitest'

let env: RulesTestEnvironment

beforeAll(async () => {
  const [host, port] = (process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? '127.0.0.1:9199').split(':')
  env = await initializeTestEnvironment({
    projectId: 'demo-memorize-rules',
    storage: { host, port: Number(port), rules: readFileSync(resolve(import.meta.dirname, '../../storage.rules'), 'utf8') },
  })
})
afterAll(() => env.cleanup())

describe('storage (security.md 6)', () => {
  it('uploads and reads stay closed until file features ship', async () => {
    const s = env.authenticatedContext('bob').storage()
    await assertFails(uploadString(ref(s, 'spaces/ws1/files/a.txt'), 'hi'))
    await assertFails(getBytes(ref(s, 'spaces/ws1/files/a.txt')))
    await assertFails(uploadString(ref(env.unauthenticatedContext().storage(), 'x.txt'), 'hi'))
  })
})
