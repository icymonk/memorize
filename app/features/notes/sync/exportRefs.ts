import type { MyJournal } from '../services/journal'

/** NOTE-70·71 내보내기 대상 고르기·인쇄 주소 (순수 함수) */
export interface PageRef { sid: string, id: string }
export const MAX_PRINT_PAGES = 100

export const safeName = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 100) || 'memorize'

/** NOTE-71: 기간 안(양 끝 포함)의 일지를 날짜순으로 */
export function journalsInRange(list: MyJournal[], from: string, to: string) {
  return list.filter(j => !!j.date && j.date >= from && j.date <= to).sort((a, b) => a.date!.localeCompare(b.date!) || a.title.localeCompare(b.title))
}

export const printUrl = (refs: PageRef[]) => `/print?items=${refs.slice(0, MAX_PRINT_PAGES).map(r => `${r.sid}/${r.id}`).join(',')}`
export function parsePrintItems(q: unknown): PageRef[] {
  return String(q ?? '').split(',').map(s => s.split('/')).filter(p => p.length === 2 && !!p[0] && !!p[1]).map(([sid, id]) => ({ sid: sid!, id: id! })).slice(0, MAX_PRINT_PAGES)
}

