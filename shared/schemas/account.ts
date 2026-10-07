import { z } from 'zod'

export const personalSpaceId = (uid: string) => `p_${uid}`

export const ensureAccountInput = z.object({
  timezone: z.string().min(1).max(64),
  locale: z.string().min(2).max(16),
})
export type EnsureAccountInput = z.infer<typeof ensureAccountInput>

export const ensureAccountOutput = z.object({
  created: z.boolean(),
  needsOnboarding: z.boolean(),
  personalSpaceId: z.string(),
})
export type EnsureAccountOutput = z.infer<typeof ensureAccountOutput>

export const completeOnboardingInput = z.object({
  displayName: z.string().trim().min(1).max(30),
  timezone: z.string().min(1).max(64),
})
export type CompleteOnboardingInput = z.infer<typeof completeOnboardingInput>

/** callable 이름 → 입력·출력 타입 (앱의 callFn과 서버가 함께 쓴다) */
export interface Callables {
  ensureAccount: { input: EnsureAccountInput, output: EnsureAccountOutput }
  completeOnboarding: { input: CompleteOnboardingInput, output: { ok: true } }
}
