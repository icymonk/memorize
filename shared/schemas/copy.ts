import { z } from 'zod'

const id = z.string().min(1).max(128)

export const COPY_KINDS = ['deck', 'page', 'collection', 'question', 'course'] as const
export type CopyKind = (typeof COPY_KINDS)[number]

/** WS-60~64 복사해 가져가기 (1단계: 단어장, 노트 페이지·모음) */
export const copyContentInput = z.object({
  kind: z.enum(COPY_KINDS),
  fromSpaceId: id,
  id,
  toSpaceId: id,
})
export type CopyContentInput = z.infer<typeof copyContentInput>
export interface CopyContentOutput { id: string }
