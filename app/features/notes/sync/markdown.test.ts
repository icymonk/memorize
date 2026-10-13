import type { StoredBlock } from './serialize'
import { describe, expect, it } from 'vitest'
import { blocksToMarkdown } from './serialize'

const b = (id: string, type: string, text: string, order: string, over: Partial<StoredBlock> = {}): StoredBlock =>
  ({ id, type, parentBlockId: null, attrs: {}, content: text ? [{ type: 'text', text }] : [], order, ...over })

describe('blocksToMarkdown (ACC-32)', () => {
  it('writes headings, paragraphs, nested lists and todos', () => {
    expect(blocksToMarkdown([
      b('a', 'heading', '제목', 'a0', { attrs: { level: 2 } }),
      b('b', 'paragraph', '본문', 'a1'),
      b('c', 'bulletItem', '하나', 'a2'),
      b('d', 'bulletItem', '둘', 'a0', { parentBlockId: 'c' }),
      b('e', 'todoItem', '할 일', 'a3', { attrs: { checked: true } }),
      b('f', 'horizontalRule', '', 'a4'),
    ])).toBe('## 제목\n본문\n- 하나\n  - 둘\n- [x] 할 일\n---\n')
  })

  it('returns an empty line for an empty page', () => {
    expect(blocksToMarkdown([])).toBe('\n')
  })
})
