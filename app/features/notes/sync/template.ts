import type { FlatBlock } from './serialize'

/** NOTE-35 학습일지 기본 템플릿: 제목마다 빈 칸, 마지막은 할 일 목록 */
export function journalTemplate(titles: readonly string[]): FlatBlock[] {
  const id = () => crypto.randomUUID()
  return titles.flatMap((text, i) => [
    { id: id(), type: 'heading', parentBlockId: null, attrs: { level: 2 }, content: [{ type: 'text', text }] },
    { id: id(), type: i === titles.length - 1 ? 'todoItem' : 'paragraph', parentBlockId: null, attrs: i === titles.length - 1 ? { checked: false } : {}, content: [] },
  ])
}
