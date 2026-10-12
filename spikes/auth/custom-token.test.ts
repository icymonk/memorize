// S4: custom token issue (Admin SDK) → client sign-in, against the Auth emulator.
// Real-project IAM (iam.serviceAccounts.signBlob on the 2nd gen runtime service account) cannot be exercised here.
import { deleteApp as deleteAdminApp, initializeApp as initAdmin } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInWithCustomToken } from 'firebase/auth'
import { afterAll, describe, expect, it } from 'vitest'

const projectId = 'demo-memorize-spike'
const host = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9199'
const admin = initAdmin({ projectId }, 'admin')
const client = initializeApp({ apiKey: 'demo-key', projectId }, 'client')
const auth = getAuth(client)
connectAuthEmulator(auth, `http://${host}`, { disableWarnings: true })

afterAll(async () => { await Promise.all([deleteAdminApp(admin), deleteApp(client)]) })

describe('S4 custom token for child accounts', () => {
  it('Admin SDK token signs the child in and carries custom claims', async () => {
    const token = await getAdminAuth(admin).createCustomToken('child_1', { child: true, guardianUid: 'parent_1' })
    const cred = await signInWithCustomToken(auth, token)
    expect(cred.user.uid).toBe('child_1')
    const { claims } = await cred.user.getIdTokenResult()
    expect(claims.child).toBe(true)
    expect(claims.guardianUid).toBe('parent_1')
  })

  it('persistent claims set via setCustomUserClaims (e.g. guardian wards) show up after refresh', async () => {
    const adminAuth = getAdminAuth(admin)
    await adminAuth.createUser({ uid: 'parent_1' }).catch(() => undefined)
    await adminAuth.setCustomUserClaims('parent_1', { wards: ['child_1'] })
    const cred = await signInWithCustomToken(auth, await adminAuth.createCustomToken('parent_1'))
    const { claims } = await cred.user.getIdTokenResult(true)
    expect(claims.wards).toEqual(['child_1'])
  })
})
