import { describe, expect, it } from 'vitest'
import { bookKey, pickIsbn13, reachedEnd, readingLogInput, shelfInput, statusPatch } from './book'

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
  it('fills start and finish dates when status changes (READ-11)', () => {
    expect(statusPatch({}, 'reading', '2026-10-12')).toEqual({ status: 'reading', startedAt: '2026-10-12' })
    expect(statusPatch({ startedAt: '2026-10-01' }, 'done', '2026-10-12')).toEqual({ status: 'done', finishedAt: '2026-10-12' })
    expect(statusPatch({ startedAt: '2026-10-01', finishedAt: '2026-10-05' }, 'done', '2026-10-12')).toEqual({ status: 'done', finishedAt: '2026-10-05' })
    expect(statusPatch({}, 'want', '2026-10-12')).toEqual({ status: 'want' })
  })
  it('validates reading logs and detects the end of a book (READ-20·24)', () => {
    expect(readingLogInput.parse({ bookKey: 'isbn:9788936434120', date: '2026-10-12', unit: 'page', to: 120 })).toMatchObject({ from: null, minutes: 0, memo: '' })
    expect(readingLogInput.safeParse({ bookKey: 'isbn:1', date: '10/12', unit: 'page' }).success).toBe(false)
    expect(reachedEnd('page', 216, { pages: 216, minutes: null })).toBe(true)
    expect(reachedEnd('page', 100, { pages: null, minutes: null })).toBe(false)
    expect(reachedEnd('percent', 100, { pages: null, minutes: null })).toBe(true)
    expect(reachedEnd('minute', 30, { pages: null, minutes: 600 })).toBe(false)
  })
})
