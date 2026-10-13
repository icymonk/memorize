import { describe, expect, it } from 'vitest'
import { bookKey, pickIsbn13, shelfInput } from './book'

describe('books (READ-01~03)', () => {
  it('picks ISBN-13 and converts ISBN-10', () => {
    expect(pickIsbn13('8936434128 9788936434120')).toBe('9788936434120')
    expect(pickIsbn13('89-364-3412-8')).toBe('9788936434120')
    expect(pickIsbn13('')).toBe('')
  })

  it('groups the same book by ISBN, otherwise by normalized title and authors', () => {
    expect(bookKey({ isbn13: '9788936434120', title: 'x', authors: [] })).toBe('isbn:9788936434120')
    const a = bookKey({ title: '소년이 온다', authors: ['한강'] })
    expect(a).toMatch(/^t:[0-9a-z]+$/)
    expect(bookKey({ title: ' 소년이  온다! ', authors: ['한 강'] })).toBe(a)
    expect(bookKey({ title: '소년이 온다', authors: ['다른 사람'] })).not.toBe(a)
  })

  it('accepts only https covers and positive totals', () => {
    expect(shelfInput.safeParse({ title: 'a', cover: 'http://x' }).success).toBe(false)
    expect(shelfInput.safeParse({ title: 'a', total: { pages: 0, minutes: null } }).success).toBe(false)
    expect(shelfInput.parse({ title: 'a' })).toMatchObject({ format: 'paper', status: 'want', authors: [] })
  })
})
