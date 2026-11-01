/** MATH-12 숫자 정답: "3", "-2.5", "1,000", "3/4", "-1 1/2"(대분수), "\frac{3}{4}" 를 수로 읽는다. 못 읽으면 null */
export function parseNumber(src: string): number | null {
  let s = src.normalize('NFKC').trim().replace(/^\$+|\$+$/g, '').trim()
  s = s.replace(/\\[dt]?frac\{([^{}]+)\}\{([^{}]+)\}/g, '$1/$2').replace(/−/g, '-')
  const num = /^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$|^[+-]?\.\d+$/
  if (num.test(s)) return Number(s.replace(/,/g, ''))
  const frac = /^([+-]?)(?:(\d+)\s+)?(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(s)
  if (frac) {
    const [, sign, whole, n, d] = frac
    if (Number(d) === 0) return null
    const v = Number(whole ?? 0) + Number(n) / Number(d)
    return sign === '-' ? -v : v
  }
  return null
}

/** 허용 오차 안에서 같은 수인지. 0이면 계산 오차(1e-9)만 허용해 분수=소수를 같게 본다 */
export function sameNumber(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance + 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))
}
