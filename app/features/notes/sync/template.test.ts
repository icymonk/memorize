import { describe, expect, it } from 'vitest'
import { fromBlocks, toBlocks } from './serialize'
import { journalTemplate } from './template'

describe('journalTemplate (NOTE-35)', () => {
  it('heading + empty line per section, ending with a todo, and survives an editor round trip', () => {
    const blocks = journalTemplate(['오늘 배운 것', '어려웠던 점', '내일 할 것'])
    expect(blocks.map(b => b.type)).toEqual(['heading', 'paragraph', 'heading', 'paragraph', 'heading', 'todoItem'])
    expect(new Set(blocks.map(b => b.id)).size).toBe(6)
    const stored = blocks.map((b, i) => ({ ...b, order: `a${i}` }))
    expect(toBlocks(fromBlocks(stored))).toEqual(blocks)
  })
})
