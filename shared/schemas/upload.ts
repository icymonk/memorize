import { z } from 'zod'
import { LIMITS } from '../limits'

/** CMN-60·61: 업로드 경로·형식·용량 (docs/dev/data-model.md 12절) */
export const UPLOAD_TYPE = /^(?:image|audio|video|text)\/|^application\//
export const MAX_ATTACHMENTS = 10
export const IMAGE_MAX_SIDE = 2048

export const uploadPath = (sid: string, uid: string, fileId: string, name: string) => `spaces/${sid}/files/${uid}/${fileId}/${name}`

/** 경로에 쓸 수 없는 글자를 바꾸고 너무 긴 이름은 뒤쪽(확장자 쪽)을 남긴다 */
export function safeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const n = name.normalize('NFC').replace(/[/\\#?[\]*\u0000-\u001F]/g, '_').trim()
  return (n.length > 120 ? n.slice(-120) : n) || 'file'
}

const fileId = z.string().regex(/^[\w-]{8,40}$/)

export const registerUploadInput = z.object({
  sid: z.string().min(1).max(128),
  fileId,
  name: z.string().min(1).max(200),
  refType: z.enum(['mission', 'page', 'card']).nullable().default(null),
  refId: z.string().max(300).nullable().default(null),
})
export type RegisterUploadInput = z.input<typeof registerUploadInput>

export const deleteUploadInput = z.object({ fileId })
export type DeleteUploadInput = z.infer<typeof deleteUploadInput>

/** 첨부한 곳(제출 등)에 복사해 두는 파일 정보 */
export interface Attachment {
  id: string
  name: string
  path: string
  contentType: string
  size: number
}

export interface StorageUsage {
  usedBytes: number
  limitBytes: number
}

export interface RegisterUploadOutput extends StorageUsage {
  file: Attachment
}

/** CMN-62: 80% 넘으면 경고 */
export function storageLevel(used: number, limit: number = LIMITS.storageBytesPerUser): 'ok' | 'warn' | 'full' {
  const r = limit > 0 ? used / limit : 1
  return r >= 1 ? 'full' : r >= 0.8 ? 'warn' : 'ok'
}

export function formatBytes(n: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let v = Math.max(0, n)
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${i === 0 ? v : Math.round(v * 10) / 10}${units[i]}`
}

/** 긴 변이 max를 넘으면 비율을 지켜 줄인 크기 */
export function fitWithin(width: number, height: number, max = IMAGE_MAX_SIDE) {
  const s = Math.min(1, max / Math.max(width, height))
  return { width: Math.round(width * s), height: Math.round(height * s) }
}
