// 연결 블록 (NOTE-07, docs/dev/editor.md 8절): 페이지 링크, 앱 카드(단어장·책·미션), 오늘의 학습 요약
import type { Component } from 'vue'
import { mergeAttributes, Node } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'

export const EMBED_REFS = ['deck', 'book', 'mission'] as const
export type EmbedRef = typeof EMBED_REFS[number]

/** 책은 refId에 bookKey. 제목·아이콘은 저장하지 않고 볼 때 대상 문서에서 읽는다 */
export type LinkBlock =
  | { type: 'pageLink', attrs: { pageId: string } }
  | { type: 'appEmbed', attrs: { refType: EmbedRef, refId: string } }
  | { type: 'todaySummary', attrs: { uid: string, date: string } }

export interface LinkCardOptions {
  sid: string
  /** 카드 화면(Vue). 없으면 빈 div로 그린다 (테스트 등) */
  view?: Component
}

function refNode(name: LinkBlock['type'], defaults: Record<string, string>) {
  return Node.create<LinkCardOptions>({
    name,
    group: 'block',
    atom: true,
    draggable: true,
    addOptions: () => ({ sid: '' }),
    addAttributes: () => Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, { default: v }])),
    parseHTML: () => [{ tag: `div[data-link="${name}"]` }],
    renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-link': name })],
    addNodeView() {
      return this.options.view ? VueNodeViewRenderer(this.options.view) : null
    },
  })
}

export const PageLink = refNode('pageLink', { pageId: '' })
export const AppEmbed = refNode('appEmbed', { refType: 'deck', refId: '' })
export const TodaySummary = refNode('todaySummary', { uid: '', date: '' })
