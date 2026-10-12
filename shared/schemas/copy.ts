import { z } from 'zod'

const id = z.string().min(1).max(128)

/** WS-60~64 복사해 가져가기 (1단계는 단어장) */
export const copyContentInput = z.object({
  kind: z.literal('deck'),
  fromSpaceId: id,
  id,
  toSpaceId: id,
})
export type CopyContentInput = z.infer<typeof copyContentInput>
export interface CopyContentOutput { id: string }
