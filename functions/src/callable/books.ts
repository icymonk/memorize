import type { BookHit, BookSearchOutput } from '../../../shared/schemas/book'
import { defineString } from 'firebase-functions/params'
import { logger } from 'firebase-functions'
import { bookSearchInput, pickIsbn13 } from '../../../shared/schemas/book'
import { authedCallable } from '../lib/callable'

/** 비어 있으면 그 검색원을 건너뛴다. Google Books는 키 없이도 적은 양은 된다 */
const kakaoKey = defineString('KAKAO_REST_KEY', { default: '' })
const googleKey = defineString('GOOGLE_BOOKS_KEY', { default: '' })

const https = (url: string) => url.replace(/^http:\/\//, 'https://')

export async function searchKakao(query: string, key: string): Promise<BookHit[]> {
  if (!key) return []
  const res = await fetch(`https://dapi.kakao.com/v3/search/book?size=20&query=${encodeURIComponent(query)}`, { headers: { Authorization: `KakaoAK ${key}` } })
  if (!res.ok) {
    logger.warn('kakao book search failed', res.status)
    return []
  }
  const body = await res.json() as { documents?: any[] }
  return (body.documents ?? []).map(d => ({
    title: String(d.title ?? ''),
    authors: (d.authors ?? []).map(String),
    publisher: String(d.publisher ?? ''),
    cover: https(String(d.thumbnail ?? '')),
    isbn13: pickIsbn13(String(d.isbn ?? '')),
    pages: null,
    source: 'kakao' as const,
  })).filter(b => b.title)
}

export async function searchGoogle(query: string, key: string): Promise<BookHit[]> {
  const q = /^[\d-]{10,17}$/.test(query) ? `isbn:${query.replace(/-/g, '')}` : query
  const res = await fetch(`https://www.googleapis.com/books/v1/volumes?maxResults=20&q=${encodeURIComponent(q)}${key ? `&key=${key}` : ''}`)
  if (!res.ok) {
    logger.warn('google book search failed', res.status)
    return []
  }
  const body = await res.json() as { items?: any[] }
  return (body.items ?? []).map(({ volumeInfo: v = {} }) => ({
    title: [v.title, v.subtitle].filter(Boolean).join(': '),
    authors: (v.authors ?? []).map(String),
    publisher: String(v.publisher ?? ''),
    cover: https(String(v.imageLinks?.thumbnail ?? '')),
    isbn13: pickIsbn13((v.industryIdentifiers ?? []).map((i: any) => i.identifier).join(' ')),
    pages: typeof v.pageCount === 'number' && v.pageCount > 0 ? v.pageCount : null,
    source: 'google' as const,
  })).filter(b => b.title)
}

/** READ-01: 카카오에서 먼저 찾고, 없으면 Google Books */
export const searchBooks = authedCallable(bookSearchInput, async ({ data }): Promise<BookSearchOutput> => {
  const kakao = await searchKakao(data.query, kakaoKey.value())
  return { items: kakao.length ? kakao : await searchGoogle(data.query, googleKey.value()) }
})
