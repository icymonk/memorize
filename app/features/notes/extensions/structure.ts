// 구조 블록 (NOTE-06): 간단한 표, 2~3단 나누기. 칸 내용은 글자만 담고 attrs에 저장한다 (Firestore는 배열 안 배열이 안 돼서 행은 { cells })
import type { Component } from 'vue'
import { mergeAttributes, Node } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'

export interface StructureOptions {
  view?: Component
}

export interface TableRow { cells: string[] }
export const MAX_TABLE_ROWS = 20
export const MAX_TABLE_COLS = 6

function parseJson(raw: string | null, fallback: unknown) {
  try {
    return raw ? JSON.parse(raw) : fallback
  }
  catch {
    return fallback
  }
}

function structureNode(name: string, key: string, fallback: unknown) {
  return Node.create<StructureOptions>({
    name,
    group: 'block',
    atom: true,
    draggable: true,
    addOptions: () => ({}),
    addAttributes: () => ({
      [key]: {
        default: fallback,
        parseHTML: (el: HTMLElement) => parseJson(el.getAttribute(`data-${key}`), fallback),
        renderHTML: (a: Record<string, unknown>) => ({ [`data-${key}`]: JSON.stringify(a[key]) }),
      },
    }),
    parseHTML: () => [{ tag: `div[data-block="${name}"]` }],
    renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-block': name })],
    addNodeView() {
      return this.options.view ? VueNodeViewRenderer(this.options.view) : null
    },
  })
}

export const SimpleTable = structureNode('simpleTable', 'rows', [{ cells: ['', ''] }, { cells: ['', ''] }] satisfies TableRow[])
export const Columns = structureNode('columns', 'cols', ['', ''])
