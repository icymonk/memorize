import type { LogLike } from './reading'
import { describe, expect, it } from 'vitest'
import { pagesRead, readingStats, summarizeReading } from './reading'
import { quoteInput } from './schemas/book'

const log = (over: Partial<LogLike> = {}): LogLike => ({ bookKey: 'isbn:1', title: '어린 왕자', date: '2026-10-12', unit: 'page', from: 32, to: 40, minutes: 10, ...over })

describe('reading summary (NOTE-32)', () => {
  it('merges a day of logs per book into one range and total minutes', () => {
    const s = summarizeReading([log(), log({ from: 40, to: 58, minutes: 15 }), log({ bookKey: 'isbn:2', title: '데미안', unit: 'percent', from: null, to: 30, minutes: 0 })])
    expect(s.minutes).toBe(25)
    expect(s.books).toEqual([
      { bookKey: 'isbn:1', title: '어린 왕자', unit: 'page', from: 32, to: 58, minutes: 25 },
      { bookKey: 'isbn:2', title: '데미안', unit: 'percent', from: null, to: 30, minutes: 0 },
    ])
    expect(summarizeReading([])).toEqual({ minutes: 0, books: [] })
  })

  it('counts pages only for page logs that moved forward', () => {
    expect(pagesRead(log())).toBe(8)
    expect(pagesRead(log({ from: null }))).toBe(0)
    expect(pagesRead(log({ from: 50, to: 40 }))).toBe(0)
    expect(pagesRead(log({ unit: 'percent' }))).toBe(0)
  })
})

describe('reading stats (READ-50)', () => {
  it('counts finished books per month of the year, totals and average per reading day', () => {
    const s = readingStats([
      { status: 'done', format: 'paper', finishedAt: '2026-01-05' },
      { status: 'done', format: 'ebook', finishedAt: '2026-01-20' },
      { status: 'done', format: 'audio', finishedAt: '2025-12-31' },
      { status: 'reading', format: 'paper', finishedAt: null },
    ], [log(), log({ from: 40, to: 50, minutes: 20 }), log({ date: '2026-10-13', minutes: 0 })], 2026)
    expect(s.finishedByMonth[0]).toBe(2)
    expect(s.finished).toBe(2)
    expect(s.formats).toEqual({ paper: 2, ebook: 1, audio: 1 })
    expect(s.pages).toBe(26)
    expect(s.minutes).toBe(30)
    expect(s.avgMinutes).toBe(30)
    expect(s.minutesByDay).toEqual({ '2026-10-12': 30, '2026-10-13': 0 })
  })
})

describe('quote input (READ-30)', () => {
  it('needs text and defaults to private', () => {
    const q = quoteInput.parse({ bookKey: 'isbn:1', date: '2026-10-12', unit: 'page', position: 12, text: ' 가장 중요한 것은 ' })
    expect(q).toMatchObject({ text: '가장 중요한 것은', visibility: 'private' })
    expect(quoteInput.safeParse({ bookKey: 'isbn:1', date: '2026-10-12', unit: 'page', text: '  ' }).success).toBe(false)
    expect(quoteInput.safeParse({ bookKey: 'isbn:1', date: '2026-10-12', unit: 'page', text: 'x', visibility: 'group' }).success).toBe(false)
  })
})
