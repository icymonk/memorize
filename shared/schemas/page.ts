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
