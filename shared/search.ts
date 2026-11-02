import { z } from 'zod'

/** CMN-50 통합 검색: 공간 안 제목·카드 앞면 */
export const SEARCH_TYPES = ['page', 'deck', 'card', 'book', 'mission', 'test'] as const
export type SearchType = typeof SEARCH_TYPES[number]

export const searchInput = z.object({ spaceId: z.string().min(1).max(128), q: z.string().trim().min(1).max(50) })
export type SearchInput = z.infer<typeof searchInput>

export interface SearchHit {
  type: SearchType
  id: string
  title: string
  /** 카드의 단어장 제목, 책의 저자 등 */
  sub?: string
  /** 카드가 속한 단어장 */
  parentId?: string
}
export interface SearchOutput { hits: SearchHit[] }

export const SEARCH_PER_TYPE = 8

export function normalizeSearch(s: string) {
  return s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** 0 = 안 맞음, 3 = 똑같음, 2 = 앞부분, 1 = 중간 어딘가 (띄어쓰기는 무시하고 한 번 더 본다) */
export function matchScore(text: string, q: string) {
  const t = normalizeSearch(text)
  const n = normalizeSearch(q)
  if (!t || !n) return 0
  if (t === n) return 3
  if (t.startsWith(n)) return 2
  if (t.includes(n) || t.replace(/ /g, '').includes(n.replace(/ /g, ''))) return 1
  return 0
}

/** 맞는 것만 점수 → 짧은 제목 순으로 limit개 */
export function rankHits<T extends { title: string }>(items: T[], q: string, limit = SEARCH_PER_TYPE): T[] {
  return items
    .map(item => ({ item, score: matchScore(item.title, q) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.length - b.item.title.length || a.item.title.localeCompare(b.item.title))
    .slice(0, limit)
    .map(x => x.item)
}

export function hitPath(sid: string, h: SearchHit) {
  const base = `/s/${sid}`
  switch (h.type) {
    case 'page': return `${base}/notes/${h.id}`
    case 'deck': return `${base}/decks/${h.id}`
    case 'card': return `${base}/decks/${h.parentId}`
    case 'book': return `${base}/reading?book=${encodeURIComponent(h.id)}`
    case 'mission': return `${base}/missions/${h.id}`
    case 'test': return `${base}/tests/${h.id}`
  }
}
