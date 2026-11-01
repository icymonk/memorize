/** VOC-12 단어장 파일 가져오기·내보내기: 엑셀(CSV), Quizlet(탭으로 단어·뜻, 줄마다 카드) */
export interface CsvCard { front: string, back: string[], reading?: string }

/** RFC 4180: 큰따옴표로 감싼 칸, "" 이스케이프, 칸 안 줄바꿈, CRLF */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const s = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    }
    else if (c === '"' && cell === '') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    }
    else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(x => x.trim() !== ''))
}

const HEADER = /^(front|term|word|단어|앞면)$/i

/** 1열 단어, 2열 뜻(;로 여러 개), 3열 읽기(선택). 첫 줄이 머리글이면 건너뛴다 */
export function cardsFromCsv(text: string): CsvCard[] {
  const rows = parseCsv(text)
  if (rows[0] && HEADER.test(rows[0][0]?.trim() ?? '')) rows.shift()
  return rows.map(r => ({
    front: (r[0] ?? '').trim(),
    back: (r[1] ?? '').split(';').map(x => x.trim()).filter(Boolean),
    ...(r[2]?.trim() ? { reading: r[2].trim() } : {}),
  }))
}

/** CSV를 붙여넣기 형식(탭, 뜻은 ;)으로 바꿔 기존 붙여넣기 미리보기에 넣는다 */
export const csvToPaste = (text: string) => cardsFromCsv(text).map(c => `${c.front}\t${c.back.join('; ')}`).join('\n')

const q = (v: string) => (/[",\r\n]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
export function cardsToCsv(cards: CsvCard[]): string {
  return ['front,back,reading', ...cards.map(c => [c.front, c.back.join('; '), c.reading ?? ''].map(q).join(','))].join('\r\n')
}
/** Quizlet 가져오기 기본 형식: 단어와 뜻 사이 탭, 카드 사이 줄바꿈 */
export const cardsToQuizlet = (cards: CsvCard[]) => cards.map(c => `${c.front.replace(/[\t\n]/g, ' ')}\t${c.back.join(', ').replace(/[\t\n]/g, ' ')}`).join('\n')
