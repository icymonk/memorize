import type { User } from 'firebase/auth'
import type { EnsureAccountOutput } from '#shared/schemas/account'
import {
  GoogleAuthProvider,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { defineStore } from 'pinia'
import { callFn } from '~/lib/functions'

const EMAIL_KEY = 'memorize:emailForSignIn'

export const useAuthStore = defineStore('auth', () => {
  const { $auth, $functions } = useNuxtApp()

  const user = shallowRef<User | null>(null)
  const ready = ref(false)
  const account = ref<EnsureAccountOutput | null>(null)
  const accountError = ref(false)

  let readyPromise: Promise<void> | null = null
  let accountPromise: Promise<EnsureAccountOutput | null> | null = null

  function init() {
    readyPromise ??= new Promise((resolve) => {
      onAuthStateChanged($auth, (u) => {
        user.value = u
        account.value = null
        accountError.value = false
        accountPromise = null
        ready.value = true
        resolve()
      })
    })
    return readyPromise
  }

  /** 첫 로그인 시 계정·내 공간을 만들고, 이후에는 상태만 확인한다 (ACC-04, WS-50) */
  function ensureAccount() {
    if (!user.value) return Promise.resolve(null)
    if (account.value) return Promise.resolve(account.value)
    accountPromise ??= callFn($functions, 'ensureAccount', {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: navigator.language,
    })
      .then((result) => {
        account.value = result
        return result
      })
      .catch(() => {
        accountError.value = true
        accountPromise = null
        return null
      })
    return accountPromise
  }

  async function completeOnboarding(displayName: string, timezone: string) {
    await callFn($functions, 'completeOnboarding', { displayName, timezone })
    if (account.value) account.value = { ...account.value, needsOnboarding: false }
  }

  function signInWithGoogle() {
    return signInWithPopup($auth, new GoogleAuthProvider())
  }

  async function sendEmailLink(email: string, redirect?: string) {
    const url = new URL('/login/finish', window.location.origin)
    if (redirect) url.searchParams.set('redirect', redirect)
    await sendSignInLinkToEmail($auth, email, { url: url.toString(), handleCodeInApp: true })
    window.localStorage.setItem(EMAIL_KEY, email)
  }

  const isEmailLink = (href: string) => isSignInWithEmailLink($auth, href)
  const storedEmail = () => window.localStorage.getItem(EMAIL_KEY)

  async function finishEmailLink(email: string, href: string) {
    await signInWithEmailLink($auth, email, href)
    window.localStorage.removeItem(EMAIL_KEY)
  }

  function signOut() {
    return firebaseSignOut($auth)
  }

  return {
    user,
    ready,
    account,
    accountError,
    init,
    ensureAccount,
    completeOnboarding,
    signInWithGoogle,
    sendEmailLink,
    isEmailLink,
    storedEmail,
    finishEmailLink,
    signOut,
  }
})
