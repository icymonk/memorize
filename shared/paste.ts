/** VOC-11 붙여넣기 입력: 단어-뜻 구분자와 카드 구분자로 나눈다 */
export type TermSeparator = 'tab' | 'comma' | 'dash' | { custom: string }
export type CardSeparator = 'newline' | 'semicolon'

export interface PasteLine { line: number, raw: string, front: string, back: string[], error?: 'noSeparator' | 'emptyFront' | 'emptyBack' }

const TERM: Record<'tab' | 'comma' | 'dash', RegExp> = { tab: /\t/, comma: /,/, dash: /\s+[-–—]\s+|[-–—]/ }

const SPACED_DASH = /\s+[-–—]\s+/

/** 가장 많이 맞는 단어-뜻 구분자를 고른다 (탭 > 대시 > 쉼표 우선) */
export function detectTermSeparator(input: string): 'tab' | 'comma' | 'dash' {
  const lines = input.split(/\r?\n/).filter(l => l.trim())
  const score = (re: RegExp) => lines.filter(l => re.test(l)).length
  const tab = score(TERM.tab)
  if (tab && tab >= lines.length / 2) return 'tab'
  const dash = score(TERM.dash)
  const comma = score(TERM.comma)
  return dash >= comma && dash > 0 ? 'dash' : comma > 0 ? 'comma' : 'tab'
}

/** 뜻이 여러 개면 `;`가 아닌 카드 구분일 때 `/` 또는 `;`로 나눈다 */
function splitMeanings(back: string, cardSep: CardSeparator) {
  return back.split(cardSep === 'semicolon' ? /\s*\/\s*/ : /\s*[;/]\s*/).map(s => s.trim()).filter(Boolean)
}

export function parsePaste(input: string, termSep: TermSeparator, cardSep: CardSeparator = 'newline'): PasteLine[] {
  const chunks = input.split(cardSep === 'newline' ? /\r?\n/ : /;|\r?\n/)
  const out: PasteLine[] = []
  chunks.forEach((raw, i) => {
    if (!raw.trim()) return
    // 'well-known - 잘 알려진'처럼 앞뒤 공백이 있는 대시를 먼저 본다
    const re = typeof termSep === 'object' ? termSep.custom : termSep === 'dash' && SPACED_DASH.test(raw) ? SPACED_DASH : TERM[termSep]
    const idx = typeof re === 'string' ? raw.indexOf(re) : raw.search(re)
    const len = typeof re === 'string' ? re.length : (raw.match(re)?.[0].length ?? 0)
    if (idx < 0 || (typeof re === 'string' && !re)) {
      out.push({ line: i + 1, raw, front: raw.trim(), back: [], error: 'noSeparator' })
      return
    }
    const front = raw.slice(0, idx).trim()
    const back = splitMeanings(raw.slice(idx + len), cardSep)
    out.push({ line: i + 1, raw, front, back, error: !front ? 'emptyFront' : !back.length ? 'emptyBack' : undefined })
  })
  return out
}

const KANA_READING = /^(.+?)\s*[(（]\s*([\u3040-\u30FFー・\s]+?)\s*[)）]$/

/** 일본어 단어장: `漢字(かんじ)`처럼 단어 뒤 괄호 안 가나를 읽는 법으로 뗀다 */
export function splitKanaReading(front: string): { front: string, reading?: string } {
  const m = front.match(KANA_READING)
  return m ? { front: m[1]!.trim(), reading: m[2]!.trim() } : { front }
}
