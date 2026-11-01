import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { blocksToMarkdown, fromBlocks, toBlocks } from '../sync/serialize'
import { ensureUniqueIds, noteExtensions } from './index'

const attrs = { refType: 'deck', refId: 'd1' }

describe('link blocks', () => {
  it('is a saved block with its link attrs and survives a round trip', () => {
    const e = new Editor({ extensions: noteExtensions(), content: { type: 'doc', content: [{ type: 'paragraph' }] } })
    e.commands.insertContent({ type: 'appEmbed', attrs })
    ensureUniqueIds(e)
    const blocks = toBlocks(e.getJSON())
    const card = blocks.find(b => b.type === 'appEmbed')!
    expect(card.id).toBeTruthy()
    expect(card.attrs).toEqual(attrs)
    const again = toBlocks(fromBlocks(blocks.map((b, i) => ({ ...b, order: String(i) }))))
    expect(again.find(b => b.type === 'appEmbed')!.attrs).toEqual(attrs)
    e.destroy()
  })

  it('exports its target to markdown', () => {
    const md = blocksToMarkdown([{ id: 'x', type: 'appEmbed', parentBlockId: null, order: 'a', attrs, content: [] }] as never)
    expect(md).toContain('[deck: d1]')
  })
})
