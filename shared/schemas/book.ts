import { z } from 'zod'

/** READ-05·10: 책 형식과 내 책장 상태 */
export const BOOK_FORMATS = ['paper', 'ebook', 'audio'] as const
export type BookFormat = typeof BOOK_FORMATS[number]
export const SHELF_STATUS = ['want', 'reading', 'done', 'dropped'] as const
export type ShelfStatus = typeof SHELF_STATUS[number]

export const bookSearchInput = z.object({ query: z.string().trim().min(1).max(100) })
export type BookSearchInput = z.infer<typeof bookSearchInput>

export interface BookHit {
  title: string
  authors: string[]
  publisher: string
  cover: string
  isbn13: string
  pages: number | null
  source: 'kakao' | 'google'
}
export interface BookSearchOutput { items: BookHit[] }

/** "8936434128 9788936434120" 같은 문자열에서 ISBN-13만 고른다 (ISBN-10은 13으로 바꾼다) */
export function pickIsbn13(raw: string): string {
  const parts = raw.replace(/-/g, '').split(/[\s,]+/).filter(Boolean)
  const thirteen = parts.find(p => /^97[89]\d{10}$/.test(p))
  if (thirteen) return thirteen
  const ten = parts.find(p => /^\d{9}[\dX]$/i.test(p))
  if (!ten) return ''
  const body = `978${ten.slice(0, 9)}`
  const sum = [...body].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0)
  return `${body}${(10 - (sum % 10)) % 10}`
}

const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s\p{P}]/gu, '')

/** FNV-1a 32비트 → base36. 같은 제목·저자면 같은 키 */
function hash(s: string): string {
  let h = 0x811C9DC5
  for (const c of s) {
    h ^= c.codePointAt(0)!
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

/** READ-03: 같은 책 묶기 키 (data-model.md 7절) */
export function bookKey(b: { isbn13?: string, title: string, authors: string[] }): string {
  if (b.isbn13 && /^97[89]\d{10}$/.test(b.isbn13)) return `isbn:${b.isbn13}`
  return `t:${hash(`${norm(b.title)}|${norm(b.authors.join(','))}`)}`
}

export const shelfId = (uid: string, key: string) => `${uid}_${key}`

const count = z.number().int().min(1).max(100000).nullable().default(null)

/** READ-01·02·05·11: 내 책장에 담는 책 */
export const shelfInput = z.object({
  title: z.string().trim().min(1).max(200),
  authors: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
  publisher: z.string().trim().max(100).default(''),
  cover: z.string().trim().max(500).refine(v => !v || /^https:\/\//.test(v), 'https only').default(''),
  isbn13: z.string().default(''),
  format: z.enum(BOOK_FORMATS).default('paper'),
  total: z.object({ pages: count, minutes: count }).default({ pages: null, minutes: null }),
  status: z.enum(SHELF_STATUS).default('want'),
})
export type ShelfInput = z.infer<typeof shelfInput>
