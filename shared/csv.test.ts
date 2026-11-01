import { describe, expect, it } from 'vitest'
import { cardsFromCsv, cardsToCsv, cardsToQuizlet, csvToPaste, parseCsv } from './csv'

describe('csv (VOC-12)', () => {
  it('parses quoted cells, escaped quotes, newlines and CRLF', () => {
    expect(parseCsv('a,"b, c"\r\n"say ""hi""","x\ny"\n\n')).toEqual([['a', 'b, c'], ['say "hi"', 'x\ny']])
  })
  it('reads cards, skips a header and splits meanings on ;', () => {
    expect(cardsFromCsv('\uFEFFfront,back,reading\napple,사과; 능금\n食べる,먹다,たべる\n')).toEqual([
      { front: 'apple', back: ['사과', '능금'] },
      { front: '食べる', back: ['먹다'], reading: 'たべる' },
    ])
    expect(csvToPaste('apple,"사과; 능금"')).toBe('apple\t사과; 능금')
  })
  it('round-trips export and writes Quizlet format', () => {
    const cards = [{ front: 'a, b', back: ['x "y"', 'z'] }, { front: '食べる', back: ['먹다'], reading: 'たべる' }]
    expect(cardsFromCsv(cardsToCsv(cards))).toEqual(cards)
    expect(cardsToQuizlet(cards)).toBe('a, b\tx "y", z\n食べる\t먹다')
  })
})
