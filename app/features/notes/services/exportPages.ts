import type { Firestore } from 'firebase/firestore'
import type { MyJournal } from './journal'
import { ko } from '~/locales/ko'
import { blocksToMarkdown } from '../sync/serialize'
import { loadBlocks } from './pages'

/** NOTE-70·71 페이지·일지 내보내기 (마크다운 파일, 인쇄 화면으로 PDF) */
export { journalsInRange, MAX_PRINT_PAGES, parsePrintItems, printUrl, safeName } from '../sync/exportRefs'
export type { PageRef } from '../sync/exportRefs'

export function downloadText(name: string, text: string, type = 'text/markdown') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function pageMarkdown(db: Firestore, sid: string, id: string, heading: string) {
  return `# ${heading}\n\n${blocksToMarkdown(await loadBlocks(db, sid, id))}`
}

export async function bundleMarkdown(db: Firestore, journals: MyJournal[]) {
  const parts = await Promise.all(journals.map(j => pageMarkdown(db, j.sid, j.id, `${j.date} ${j.title || ko.notes.untitled}`)))
  return parts.join('\n---\n\n')
}
