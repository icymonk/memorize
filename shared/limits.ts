/** 무료 한도·보관 기간 상수 (docs/dev/data-model.md 14절). 운영 중 조정한다. */
export const LIMITS = {
  workspaceMaxMembers: 100,
  storageBytesPerUser: 2 * 1024 ** 3,
  maxFileBytes: 500 * 1024 ** 2,
  blockMaxChars: 10_000,
  pageBlockWarn: 2_000,
  trashDays: 30,
  groupRestoreDays: 30,
  workspaceDeleteGraceDays: 7,
} as const

export const REGION = 'asia-northeast3'
