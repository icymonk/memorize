// 블록·페이지 순서 키 (fractional indexing). 키끼리 문자열 크기 비교가 곧 순서이고,
// 두 키 사이에는 언제나 새 키를 만들 수 있어 다른 블록의 키를 고치지 않고 끼워 넣는다.
// 글자는 ASCII 순서인 0-9A-Za-z만 쓰므로 Firestore orderBy와 같은 순서가 된다.
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

export const compareOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let n = 0
    while ((a[n] ?? '0') === b[n]) n++
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n))
  }
  const da = a ? DIGITS.indexOf(a[0]!) : 0
  const db = b !== null ? DIGITS.indexOf(b[0]!) : DIGITS.length
  if (db - da > 1) return DIGITS[Math.round((da + db) / 2)]!
  if (b !== null && b.length > 1) return b.slice(0, 1)
  return DIGITS[da] + midpoint(a.slice(1), null)
}

function check(key: string) {
  if (!key || key.endsWith('0') || [...key].some(c => !DIGITS.includes(c))) throw new Error(`invalid order key: ${key}`)
}

/** a 바로 뒤의 짧은 키. 문서 끝에 계속 덧붙여도 키가 천천히 길어지게 한다 */
function after(a: string): string {
  if (!a) return DIGITS[1]!
  const i = DIGITS.indexOf(a[0]!)
  return i < DIGITS.length - 1 ? DIGITS[i + 1]! : a[0] + after(a.slice(1))
}

/** a와 b 사이의 키. a가 null이면 맨 앞, b가 null이면 맨 뒤 */
export function keyBetween(a: string | null, b: string | null): string {
  if (a !== null) check(a)
  if (b !== null) check(b)
  if (a !== null && b !== null && a >= b) throw new Error(`${a} >= ${b}`)
  return a !== null && b === null ? after(a) : midpoint(a ?? '', b)
}

/** a와 b 사이에 고르게 퍼진 키 n개 (붙여넣기처럼 한 구간에 여러 블록이 생길 때) */
export function keysBetween(a: string | null, b: string | null, n: number): string[] {
  if (n <= 0) return []
  const c = keyBetween(a, b)
  const left = Math.floor((n - 1) / 2)
  return [...keysBetween(a, c, left), c, ...keysBetween(c, b, n - 1 - left)]
}
