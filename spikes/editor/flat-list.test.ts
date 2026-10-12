// @vitest-environment happy-dom
import { Editor, type JSONContent } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { afterEach, describe, expect, it } from 'vitest'
import { extensions, fromBlocks, toBlocks } from './flat-list'

let editor: Editor | undefined
afterEach(() => editor?.destroy())

let seq = 0
// Tiptap 3 emits `create` asynchronously; UniqueID assigns ids to initial content in onCreate.
async function make(content: JSONContent | string, gen = () => `id${++seq}`) {
  const e = new Editor({ extensions: extensions(gen), content })
  await new Promise(resolve => e.on('create', resolve))
  return e
}
const ids = (e: Editor) => toBlocks(e.getJSON()).map(b => b.id)

function cursorAtEndOfText(e: Editor, text: string) {
  let pos = -1
  e.state.doc.descendants((n, p) => { if (n.isText && n.text === text) pos = p + n.nodeSize })
  e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, pos)))
}

const item = (type: string, text: string, children: JSONContent[] = []): JSONContent =>
  ({ type, content: [{ type: 'itemLine', content: [{ type: 'text', text }] }, ...children] })

describe('S2 UniqueID on flat list blocks', () => {
  it('assigns unique ids to every block, including nested children', async () => {
    const e = editor = await make({ type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'p' }] },
      item('bulletItem', 'a', [item('bulletItem', 'a1'), item('todoItem', 'a2')]),
      item('toggle', 't', [{ type: 'paragraph', content: [{ type: 'text', text: 'inside' }] }]),
    ] })
    const all = ids(e)
    expect(all).toHaveLength(6)
    expect(all.every(Boolean)).toBe(true)
    expect(new Set(all).size).toBe(6)
  })

  it('Enter (splitListItem) on a list item creates a sibling with a fresh id', async () => {
    const e = editor = await make({ type: 'doc', content: [item('bulletItem', 'hello')] })
    const [first] = ids(e)
    cursorAtEndOfText(e, 'hello')
    expect(e.commands.splitListItem('bulletItem')).toBe(true)
    e.commands.insertContent('world')
    const blocks = toBlocks(e.getJSON())
    expect(blocks.map(b => b.type)).toEqual(['bulletItem', 'bulletItem'])
    expect(blocks[0]!.id).toBe(first)
    expect(blocks[1]!.id).not.toBe(first)
    expect(blocks[1]!.parentBlockId).toBeNull()
  })

  it('Enter in a paragraph (splitBlock) yields distinct ids', async () => {
    const e = editor = await make({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'abc' }] }] })
    cursorAtEndOfText(e, 'abc')
    e.commands.splitBlock()
    const all = ids(e)
    expect(all).toHaveLength(2)
    expect(new Set(all).size).toBe(2)
  })

  it('clipboard paste of existing blocks gets fresh ids (transformPasted strips ids)', async () => {
    const e = editor = await make({ type: 'doc', content: [item('bulletItem', 'a', [item('bulletItem', 'a1')]), { type: 'paragraph' }] })
    const html = e.getHTML()
    e.commands.setTextSelection(e.state.doc.content.size - 1)
    const dt = new DataTransfer()
    dt.setData('text/html', html)
    dt.setData('text/plain', 'a a1')
    e.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    const blocks = toBlocks(e.getJSON())
    expect(blocks.map(b => [b.type, b.content[0]?.text])).toEqual([
      ['bulletItem', 'a'], ['bulletItem', 'a1'], ['bulletItem', 'a'], ['bulletItem', 'a1'], ['paragraph', undefined],
    ])
    expect(blocks[3]!.parentBlockId).toBe(blocks[2]!.id)
    expect(new Set(blocks.map(b => b.id)).size).toBe(5)
  })

  it('programmatic insert of JSON that still carries ids is NOT deduplicated', async () => {
    const e = editor = await make({ type: 'doc', content: [item('bulletItem', 'a', [item('bulletItem', 'a1')])] })
    e.commands.insertContentAt(e.state.doc.content.size, e.getJSON().content!)
    const all = ids(e)
    expect(all).toHaveLength(4)
    expect(new Set(all).size).toBe(2)
  })

  it('indent (move block into previous sibling) keeps its id and sets parentBlockId', async () => {
    const e = editor = await make({ type: 'doc', content: [item('bulletItem', 'a'), item('bulletItem', 'b')] })
    const [aId, bId] = ids(e)
    const { doc } = e.state
    const a = doc.child(0)
    const b = doc.child(1)
    const bPos = a.nodeSize
    const insertAt = a.nodeSize - 1
    e.view.dispatch(e.state.tr.delete(bPos, bPos + b.nodeSize).insert(insertAt, b))
    const blocks = toBlocks(e.getJSON())
    expect(blocks.map(x => [x.id, x.parentBlockId])).toEqual([[aId, null], [bId, aId]])
  })

  it('undo of a split restores the original ids', async () => {
    const e = editor = await make({ type: 'doc', content: [item('bulletItem', 'hello')] })
    const before = ids(e)
    cursorAtEndOfText(e, 'hello')
    e.commands.splitListItem('bulletItem')
    e.commands.undo()
    expect(ids(e)).toEqual(before)
  })
})

describe('S2 block (de)serialization', () => {
  it('round-trips doc → stored blocks → doc without changing ids or structure', async () => {
    const e = editor = await make({ type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title', marks: [{ type: 'bold' }] }] },
      item('bulletItem', 'a', [item('todoItem', 'a1', [item('bulletItem', 'a1x')])]),
      { type: 'horizontalRule' },
      item('toggle', 't', [{ type: 'paragraph', content: [{ type: 'text', text: 'in' }] }]),
    ] })
    const json = e.getJSON()
    const blocks = toBlocks(json)
    expect(blocks.find(b => b.content[0]?.text === 'a1x')!.parentBlockId).toBe(blocks.find(b => b.content[0]?.text === 'a1')!.id)
    const shuffled = [...blocks].reverse()
    const rebuilt = fromBlocks(shuffled)
    expect(rebuilt).toEqual(json)

    const e2 = await make(rebuilt, () => `fresh${++seq}`)
    expect(e2.getJSON()).toEqual(json)
    e2.destroy()
  })
})
