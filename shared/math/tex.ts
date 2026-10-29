// 지문·해설의 `$…$`(줄 안)·`$$…$$`(따로 줄) 수식 나누기 (MATH-01)
export type TexPart =
  | { kind: 'text', value: string }
  | { kind: 'math', value: string, display: boolean }

/** `\$`는 글자 그대로의 $. 닫히지 않은 $는 글자로 둔다 */
export function splitTex(src: string): TexPart[] {
  const parts: TexPart[] = []
  let text = ''
  let i = 0
  const pushText = () => {
    if (text) parts.push({ kind: 'text', value: text })
    text = ''
  }
  while (i < src.length) {
    const ch = src[i]!
    if (ch === '\\' && src[i + 1] === '$') {
      text += '$'
      i += 2
      continue
    }
    if (ch !== '$') {
      text += ch
      i++
      continue
    }
    const display = src[i + 1] === '$'
    const open = display ? 2 : 1
    const end = findClose(src, i + open, display)
    const body = end < 0 ? '' : src.slice(i + open, end).trim()
    if (end < 0 || !body) {
      text += src.slice(i, i + open)
      i += open
      continue
    }
    pushText()
    parts.push({ kind: 'math', value: body, display })
    i = end + open
  }
  pushText()
  return parts
}

function findClose(src: string, from: number, display: boolean): number {
  for (let j = from; j < src.length; j++) {
    if (src[j] === '\\') {
      j++
      continue
    }
    if (src[j] !== '$') continue
    if (!display) return j
    if (src[j + 1] === '$') return j
  }
  return -1
}

export const hasTex = (src: string) => splitTex(src).some(p => p.kind === 'math')
