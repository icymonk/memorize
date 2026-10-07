import { getApps, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'
import { connectStorageEmulator, getStorage } from 'firebase/storage'
import { REGION } from '#shared/limits'

export default defineNuxtPlugin(() => {
  const { firebase: config, useEmulator } = useRuntimeConfig().public
  const existing = getApps()[0]
  const app = existing ?? initializeApp(config)

  const firestore = existing
    ? getFirestore(app)
    : initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
  const auth = getAuth(app)
  const storage = getStorage(app)
  const functions = getFunctions(app, REGION)

  if (useEmulator && !existing) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(firestore, '127.0.0.1', 8080)
    connectStorageEmulator(storage, '127.0.0.1', 9199)
    connectFunctionsEmulator(functions, '127.0.0.1', 5001)
  }

  return {
    provide: { firebaseApp: app, auth, firestore, storage, functions },
  }
})
