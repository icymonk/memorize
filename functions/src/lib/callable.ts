import type { CallableRequest } from 'firebase-functions/v2/https'
import type { z } from 'zod'
import { defineBoolean } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'

/** 운영에서 true로 설정 (docs/dev/functions.md 1절). 에뮬레이터·초기 개발은 false */
const enforceAppCheck = defineBoolean('ENFORCE_APP_CHECK', { default: false })

export interface AuthedRequest<I> {
  uid: string
  token: NonNullable<CallableRequest['auth']>['token']
  data: I
}

/** 로그인 확인 + 입력 검증 + 오류 정리를 담당하는 callable 래퍼 */
export function authedCallable<S extends z.ZodType, O>(
  schema: S,
  handler: (req: AuthedRequest<z.infer<S>>) => Promise<O>,
) {
  return onCall({ enforceAppCheck }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'sign-in required')
    const parsed = schema.safeParse(req.data)
    if (!parsed.success) throw new HttpsError('invalid-argument', 'invalid input', parsed.error.issues)
    try {
      return await handler({ uid: req.auth.uid, token: req.auth.token, data: parsed.data })
    }
    catch (error) {
      if (error instanceof HttpsError) throw error
      logger.error('callable failed', error)
      throw new HttpsError('internal', 'internal error')
    }
  })
}
