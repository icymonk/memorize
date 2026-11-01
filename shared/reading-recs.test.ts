import { describe, expect, it } from 'vitest'
import { recommendBooks } from './reading'

const book = (bookKey: string, o: Partial<{ authors: string[], readerUids: string[], readingCount: number, avgRating: number | null }> = {}) => ({ bookKey, authors: [], readerUids: ['a'], readingCount: 0, avgRating: null, ...o })

describe('recommendBooks (READ-15)', () => {
  it('builds popular, top rated and same-author bundles', () => {
    const books = [
      book('a', { readingCount: 1 }),
      book('b', { readingCount: 3, avgRating: 4.5 }),
      book('c', { avgRating: 3.5, authors: ['한강'] }),
      book('d', { avgRating: 4.8, authors: [' 한강 '] }),
    ]
    const r = recommendBooks(books, [{ bookKey: 'c', authors: ['한강'] }])
    expect(r.popular.map(b => b.bookKey)).toEqual(['b', 'a'])
    expect(r.topRated.map(b => b.bookKey)).toEqual(['d', 'b'])
    expect(r.similar.map(b => b.bookKey)).toEqual(['d'])
  })
})
