// @vitest-environment happy-dom
import type { JSONContent } from '@tiptap/core'
import { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { afterEach, describe, expect, it } from 'vitest'
import { toBlocks } from '../sync/serialize'
import { youtubeEmbed } from './blocks'
import { duplicateBlock, findBlockPos, indentBlock, insertBlock, moveBlock, outdentBlock, splitItem, turnInto } from './commands'
import { noteExtensions } from './index'

let editor: Editor | undefined
afterEach(() => editor?.destroy())

async function make(content: JSONContent) {
  const e = new Editor({ extensions: noteExtensions(), content })
  await new Promise(resolve => e.on('create', resolve))
  return e
}
const text = (t: string) => (t ? [{ type: 'text', text: t }] : [])
const p = (id: string, t: string): JSONContent => ({ type: 'paragraph', attrs: { id }, content: text(t) })
const item = (type: string, id: string, t: string, children: JSONContent[] = []): JSONContent =>
  ({ type, attrs: { id }, content: [{ type: 'itemLine', content: text(t) }, ...children] })
const shape = (e: Editor) => toBlocks(e.getJSON()).map(b => `${b.id}:${b.type}:${b.parentBlockId ?? '-'}`)

/** 해당 글자 끝(또는 offset)으로 커서 이동 */
function cursor(e: Editor, t: string, offset = t.length) {
  let pos = -1
  e.state.doc.descendants((n, at) => { if (n.isText && n.text === t) pos = at + offset })
  e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, pos)))
}
function type(e: Editor, s: string) {
  for (const ch of s) {
    const { from, to } = e.state.selection
    const handled = e.view.someProp('handleTextInput', f => f(e.view, from, to, ch, () => e.state.tr.insertText(ch, from, to)))
    if (!handled) e.view.dispatch(e.state.tr.insertText(ch, from, to))
  }
}

describe('indent / outdent', () => {
  it('Tab nests a block under the previous list item and keeps its id', async () => {
    const e = editor = await make({ type: 'doc', content: [item('bulletItem', 'a', 'A'), item('bulletItem', 'b', 'B')] })
    cursor(e, 'B')
    expect(indentBlock(e)).toBe(true)
    expect(shape(e)).toEqual(['a:bulletItem:-', 'b:bulletItem:a'])
    expect(e.state.selection.$from.parent.textContent).toBe('B')
  })

  it('Tab does nothing when the previous block is not a list item', async () => {
    const e = editor = await make({ type: 'doc', content: [p('a', 'A'), item('bulletItem', 'b', 'B')] })
    cursor(e, 'B')
    expect(indentBlock(e)).toBe(false)
  })

  it('Shift+Tab lifts the block after its parent; later siblings become its children', async () => {
    const e = editor = await make({ type: 'doc', content: [item('bulletItem', 'a', 'A', [item('bulletItem', 'b', 'B'), item('bulletItem', 'c', 'C')])] })
    cursor(e, 'B')
    expect(outdentBlock(e)).toBe(true)
    expect(shape(e)).toEqual(['a:bulletItem:-', 'b:bulletItem:-', 'c:bulletItem:b'])
    expect(e.state.selection.$from.parent.textContent).toBe('B')
  })
})

describe('Enter in list items', () => {
  it('splits at the cursor into a new sibling with a fresh id', async () => {
    const e = editor = await make({ type: 'doc', content: [item('todoItem', 'a', 'helloworld')] })
    cursor(e, 'helloworld', 5)
    expect(splitItem(e, 'todoItem')).toBe(true)
    const blocks = toBlocks(e.getJSON())
    expect(blocks.map(b => [b.type, b.parentBlockId, b.content[0]?.text])).toEqual([['todoItem', null, 'hello'], ['todoItem', null, 'world']])
    expect(blocks[0]!.id).toBe('a')
    expect(blocks[1]!.id).not.toBe('a')
  })

  it('on an item with children, the new item becomes the first child', async () => {
    const e = editor = await make({ type: 'doc', content: [item('toggle', 't', 'T', [p('c', 'child')])] })
    cursor(e, 'T')
    splitItem(e, 'toggle')
    const [, first, second] = toBlocks(e.getJSON())
    expect([first!.type, first!.parentBlockId, second!.id]).toEqual(['toggle', 't', 'c'])
  })

  it('on an empty item turns it into a paragraph (top level) or outdents (nested)', async () => {
    const e = editor = await make({ type: 'doc', content: [item('bulletItem', 'a', 'A', [item('bulletItem', 'b', '')])] })
    e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, e.state.doc.content.size - 3)))
    expect(splitItem(e, 'bulletItem')).toBe(true)
    expect(shape(e)).toEqual(['a:bulletItem:-', 'b:bulletItem:-'])
    expect(splitItem(e, 'bulletItem')).toBe(true)
    expect(shape(e)).toEqual(['a:bulletItem:-', 'b:paragraph:-'])
  })
})

describe('markdown shortcuts', () => {
  it('"- ", "1. ", "[] " turn a paragraph into a list block keeping the id; "> ", "## " change the text block', async () => {
    for (const [input, expected, keepsId] of [['- ', 'bulletItem', true], ['1. ', 'numberedItem', true], ['[] ', 'todoItem', true], ['> ', 'blockquote', false], ['## ', 'heading', false]] as const) {
      const e = editor = await make({ type: 'doc', content: [p('x', '')] })
      e.commands.focus('start')
      type(e, input)
      const [b] = toBlocks(e.getJSON())
      expect(b!.type).toBe(expected)
      if (keepsId) expect(b!.id).toBe('x')
      expect(b!.id).toBeTruthy()
      e.destroy()
      editor = undefined
    }
  })
})

describe('turn into / insert / move', () => {
  it('turns a list item into a heading and lifts its children', async () => {
    const e = editor = await make({ type: 'doc', content: [item('bulletItem', 'a', 'A', [p('c', 'C')])] })
    cursor(e, 'A')
    expect(turnInto(e, 'heading', { level: 2 })).toBe(true)
    expect(shape(e)).toEqual(['a:heading:-', 'c:paragraph:-'])
    expect(e.getJSON().content![0]!.attrs!.level).toBe(2)
  })

  it('turns a paragraph into a code block as plain text', async () => {
    const e = editor = await make({ type: 'doc', content: [{ type: 'paragraph', attrs: { id: 'a' }, content: [{ type: 'text', text: 'x', marks: [{ type: 'bold' }] }] }] })
    cursor(e, 'x')
    turnInto(e, 'codeBlock')
    expect(e.getJSON().content![0]).toMatchObject({ type: 'codeBlock', attrs: { id: 'a' }, content: [{ type: 'text', text: 'x' }] })
  })

  it('inserts a divider in place of an empty line and adds a paragraph after it', async () => {
    const e = editor = await make({ type: 'doc', content: [p('a', 'A'), p('b', '')] })
    e.commands.focus('end')
    insertBlock(e, 'horizontalRule')
    expect(toBlocks(e.getJSON()).map(b => b.type)).toEqual(['paragraph', 'horizontalRule', 'paragraph'])
  })

  it('moves, duplicates with new ids', async () => {
    const e = editor = await make({ type: 'doc', content: [p('a', 'A'), p('b', 'B')] })
    expect(moveBlock(e, findBlockPos(e.state.doc, 'b')!, -1)).toBe(true)
    expect(shape(e)).toEqual(['b:paragraph:-', 'a:paragraph:-'])
    expect(moveBlock(e, findBlockPos(e.state.doc, 'b')!, -1)).toBe(false)
    duplicateBlock(e, findBlockPos(e.state.doc, 'a')!)
    const ids = toBlocks(e.getJSON()).map(b => b.id)
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)
  })
})

describe('youtubeEmbed', () => {
  it('accepts youtube urls only', () => {
    const embed = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
    expect(youtubeEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')).toBe(embed)
    expect(youtubeEmbed('https://youtu.be/dQw4w9WgXcQ')).toBe(embed)
    expect(youtubeEmbed('https://m.youtube.com/shorts/dQw4w9WgXcQ')).toBe(embed)
    expect(youtubeEmbed('https://evil.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(youtubeEmbed('javascript:alert(1)')).toBeNull()
    expect(youtubeEmbed('nope')).toBeNull()
  })
})
