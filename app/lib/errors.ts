import { FirebaseError } from 'firebase/app'
import { ko } from '~/locales/ko'

const messages: Record<string, string> = {
  'auth/popup-closed-by-user': ko.errors.popupClosed,
  'auth/cancelled-popup-request': ko.errors.popupClosed,
  'auth/popup-blocked': ko.errors.popupBlocked,
  'auth/invalid-email': ko.errors.invalidEmail,
  'auth/invalid-action-code': ko.errors.linkExpired,
  'auth/expired-action-code': ko.errors.linkExpired,
  'auth/network-request-failed': ko.errors.network,
  'functions/unavailable': ko.errors.network,
  'functions/unauthenticated': ko.errors.signInAgain,
  'functions/invalid-argument': ko.errors.invalidInput,
  'functions/failed-precondition': ko.errors.accountNotReady,
}

/** 사용자에게 보여줄 오류 문구. 무시해도 되는 오류(팝업 닫기)는 null */
export function errorMessage(error: unknown): string | null {
  if (error instanceof FirebaseError) {
    if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') return null
    return messages[error.code] ?? ko.errors.unknown
  }
  return ko.errors.unknown
}
