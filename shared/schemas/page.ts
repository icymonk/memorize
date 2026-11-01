import { z } from 'zod'

const id = z.string().min(1).max(128)

/** NOTE-22 휴지통 이동·복원 (하위 페이지 포함) */
export const pageRefInput = z.object({ spaceId: id, pageId: id })
export type PageRefInput = z.infer<typeof pageRefInput>

/** NOTE-20 페이지 옮기기: 다른 페이지 안으로(parentId) 또는 맨 위로(null) */
export const movePageInput = pageRefInput.extend({
  parentId: id.nullable(),
  order: z.string().min(1).max(256).regex(/^[0-9A-Za-z]+$/),
})
export type MovePageInput = z.infer<typeof movePageInput>

export interface PageOpOutput { count: number }

/** 하위 페이지 깊이 한도 */
export const MAX_PAGE_DEPTH = 10

/** NOTE-63 버전 기록: 잠금이 풀릴 때와 편집 중 10분마다 서버가 블록 전체를 저장한다 */
export const versionRefInput = pageRefInput.extend({ versionId: id })
export type VersionRefInput = z.infer<typeof versionRefInput>
export interface VersionBlock {
  id: string
  type: string
  parentBlockId: string | null
  order: string
  attrs: Record<string, unknown>
  content: unknown[]
}
export interface GetVersionOutput { blocks: VersionBlock[] }
export const VERSION_INTERVAL_MS = 10 * 60_000
export const MAX_VERSIONS = 50
