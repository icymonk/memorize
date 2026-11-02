import { describe, expect, it } from 'vitest'
import { hitPath, matchScore, rankHits, searchInput } from './search'

describe('search (CMN-50)', () => {
  it('scores exact > prefix > contains, ignoring case and spaces', () => {
    expect(matchScore('Apple', 'apple')).toBe(3)
    expect(matchScore('여행 영어', '여행')).toBe(2)
    expect(matchScore('여행 영어', '영어')).toBe(1)
    expect(matchScore('여행 영어', '행영')).toBe(1)
    expect(matchScore('여행 영어', '수학')).toBe(0)
    expect(matchScore('', 'a')).toBe(0)
  })

  it('ranks by score then shorter titles, and limits', () => {
    const items = [{ title: '영어 단어 2' }, { title: '여행 영어' }, { title: '영어' }, { title: '수학' }]
    expect(rankHits(items, '영어').map(x => x.title)).toEqual(['영어', '영어 단어 2', '여행 영어'])
    expect(rankHits(items, '영어', 1)).toHaveLength(1)
  })

  it('validates input and builds paths', () => {
    expect(searchInput.safeParse({ spaceId: 's', q: '   ' }).success).toBe(false)
    expect(searchInput.safeParse({ spaceId: 's', q: 'x'.repeat(51) }).success).toBe(false)
    expect(hitPath('s1', { type: 'card', id: 'c', title: 'apple', parentId: 'd1' })).toBe('/s/s1/decks/d1')
    expect(hitPath('s1', { type: 'book', id: 'isbn:97 8', title: 'b' })).toBe('/s/s1/reading?book=isbn%3A97%208')
  })
})
