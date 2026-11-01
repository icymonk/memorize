/**
 * MATH-14 문제 틀 계산기. eval 없이 직접 파싱한다.
 * 수는 정확한 유리수(bigint 분자/분모)로 계산하고, 제곱근처럼 유리수가 아닌 값만 근삿값(number)이 된다.
 * 문법: + - * / % ^, 비교 == != < <= > >=, 논리 && || !, 괄호, 함수 gcd lcm abs sqrt round floor ceil min max
 */
export interface Rat { n: bigint, d: bigint, dec?: boolean }
export type Value = Rat | number

export class ExprError extends Error {
  constructor(public code: 'syntax' | 'name' | 'text' | 'math' | 'big', detail = '') {
    super(detail ? `${code}: ${detail}` : code)
  }
}

export const FUNCTIONS = ['gcd', 'lcm', 'abs', 'sqrt', 'round', 'floor', 'ceil', 'min', 'max'] as const
const FN = new Set<string>(FUNCTIONS)

export type Ast =
  | { k: 'num', v: Rat }
  | { k: 'name', name: string }
  | { k: 'un', op: '-' | '!', a: Ast }
  | { k: 'bin', op: string, a: Ast, b: Ast }
  | { k: 'call', fn: string, args: Ast[] }

const LIMIT = 10n ** 40n
const MAX_LEN = 300
const MAX_DEPTH = 40

// ---- 유리수 ----
const absB = (a: bigint) => (a < 0n ? -a : a)
function gcdB(a: bigint, b: bigint): bigint {
  a = absB(a)
  b = absB(b)
  while (b) [a, b] = [b, a % b]
  return a
}
export function rat(n: bigint, d = 1n, dec = false): Rat {
  if (d === 0n) throw new ExprError('math', 'division by zero')
  if (d < 0n) {
    n = -n
    d = -d
  }
  const g = gcdB(n, d) || 1n
  n /= g
  d /= g
  if (absB(n) > LIMIT || d > LIMIT) throw new ExprError('big')
  return dec ? { n, d, dec } : { n, d }
}
const isRat = (v: Value): v is Rat => typeof v === 'object'
export const toNumber = (v: Value) => (isRat(v) ? Number(v.n) / Number(v.d) : v)
const isInt = (v: Value) => (isRat(v) ? v.d === 1n : Number.isInteger(v))
const bool = (b: boolean) => rat(b ? 1n : 0n)
const truthy = (v: Value) => toNumber(v) !== 0
const decOf = (a: Value, b?: Value) => (isRat(a) && !!a.dec) || (!!b && isRat(b) && !!b.dec)
function float(x: number): number {
  if (!Number.isFinite(x)) throw new ExprError('math', 'not finite')
  return x
}
function bigOf(v: Value): bigint {
  if (!isInt(v)) throw new ExprError('math', 'integer required')
  return isRat(v) ? v.n : BigInt(v)
}
function floorR(v: Rat): bigint {
  const q = v.n / v.d
  return v.n < 0n && q * v.d !== v.n ? q - 1n : q
}

function arith(op: string, a: Value, b: Value): Value {
  if (isRat(a) && isRat(b)) {
    const dec = decOf(a, b)
    switch (op) {
      case '+': return rat(a.n * b.d + b.n * a.d, a.d * b.d, dec)
      case '-': return rat(a.n * b.d - b.n * a.d, a.d * b.d, dec)
      case '*': return rat(a.n * b.n, a.d * b.d, dec)
      case '/': return rat(a.n * b.d, a.d * b.n, dec)
      case '%': {
        if (b.n === 0n) throw new ExprError('math', 'division by zero')
        const q = floorR(rat(a.n * b.d, a.d * b.n))
        return arith('-', a, arith('*', b, rat(q)))
      }
      case '^': {
        if (b.d === 1n && absB(b.n) <= 64n) {
          if (b.n < 0n && a.n === 0n) throw new ExprError('math', 'division by zero')
          const e = absB(b.n)
          const r = rat(a.n ** e, a.d ** e, dec)
          return b.n < 0n ? rat(r.d, r.n, dec) : r
        }
        return float(toNumber(a) ** toNumber(b))
      }
    }
  }
  const x = toNumber(a)
  const y = toNumber(b)
  switch (op) {
    case '+': return float(x + y)
    case '-': return float(x - y)
    case '*': return float(x * y)
    case '/': if (y === 0) throw new ExprError('math', 'division by zero'); return float(x / y)
    case '%': if (y === 0) throw new ExprError('math', 'division by zero'); return float(x - y * Math.floor(x / y))
    case '^': return float(x ** y)
  }
  throw new ExprError('syntax', op)
}

function compare(a: Value, b: Value): number {
  if (isRat(a) && isRat(b)) {
    const l = a.n * b.d
    const r = b.n * a.d
    return l === r ? 0 : l < r ? -1 : 1
  }
  const x = toNumber(a)
  const y = toNumber(b)
  if (Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y))) return 0
  return x < y ? -1 : 1
}

function sqrtB(n: bigint): bigint | null {
  if (n < 0n) return null
  let x = BigInt(Math.floor(Math.sqrt(Number(n))))
  while (x * x > n) x--
  while ((x + 1n) * (x + 1n) <= n) x++
  return x * x === n ? x : null
}

function roundTo(v: Value, digits: Value | undefined, mode: 'round' | 'floor' | 'ceil'): Value {
  const k = digits === undefined ? 0 : Number(bigOf(digits))
  if (k < 0 || k > 8) throw new ExprError('math', 'digits')
  const scale = 10n ** BigInt(k)
  const r: Rat = isRat(v) ? v : toRat(v)
  const x = rat(r.n * scale, r.d)
  let i: bigint
  if (mode === 'floor') i = floorR(x)
  else if (mode === 'ceil') i = -floorR(rat(-x.n, x.d))
  else {
    // 반올림: 0.5는 0에서 먼 쪽으로 (학교 방식)
    const h = floorR(rat(absB(x.n) * 2n + x.d, x.d * 2n))
    i = x.n < 0n ? -h : h
  }
  return rat(i, scale, k > 0 || (isRat(v) && !!v.dec))
}

function toRat(x: number): Rat {
  const s = x.toFixed(12)
  const [w, f = ''] = s.split('.')
  return rat(BigInt(w! + f), 10n ** BigInt(f.length), true)
}

function call(fn: string, args: Value[]): Value {
  const need = (min: number, max = min) => {
    if (args.length < min || args.length > max) throw new ExprError('syntax', `${fn} arguments`)
  }
  switch (fn) {
    case 'gcd':
    case 'lcm': {
      if (!args.length) throw new ExprError('syntax', `${fn} arguments`)
      let acc = absB(bigOf(args[0]!))
      for (const v of args.slice(1)) {
        const b = absB(bigOf(v))
        acc = fn === 'gcd' ? gcdB(acc, b) : (acc === 0n || b === 0n ? 0n : acc / gcdB(acc, b) * b)
      }
      return rat(acc)
    }
    case 'abs': {
      need(1)
      const v = args[0]!
      return isRat(v) ? rat(absB(v.n), v.d, v.dec) : Math.abs(v)
    }
    case 'sqrt': {
      need(1)
      const v = args[0]!
      if (compare(v, rat(0n)) < 0) throw new ExprError('math', 'sqrt of negative')
      if (isRat(v)) {
        const n = sqrtB(v.n)
        const d = sqrtB(v.d)
        if (n !== null && d !== null) return rat(n, d, v.dec)
      }
      return Math.sqrt(toNumber(v))
    }
    case 'round':
    case 'floor':
    case 'ceil':
      need(1, 2)
      return roundTo(args[0]!, args[1], fn)
    case 'min':
    case 'max': {
      if (!args.length) throw new ExprError('syntax', `${fn} arguments`)
      return args.reduce((a, b) => (fn === 'min' ? (compare(b, a) < 0 ? b : a) : (compare(b, a) > 0 ? b : a)))
    }
  }
  throw new ExprError('name', fn)
}

// ---- 파서 ----
const TOKEN = /\s*(?:(\d+(?:\.\d+)?|\.\d+)|([A-Za-z_]\w*)|(<=|>=|==|!=|&&|\|\||[-+*/^%(),<>!]))/y

function tokenize(src: string): string[] {
  if (src.length > MAX_LEN) throw new ExprError('syntax', 'too long')
  const out: string[] = []
  TOKEN.lastIndex = 0
  while (TOKEN.lastIndex < src.length) {
    if (/^\s*$/.test(src.slice(TOKEN.lastIndex))) break
    const m = TOKEN.exec(src)
    if (!m) throw new ExprError('syntax', src.slice(TOKEN.lastIndex).trim().slice(0, 10))
    out.push(m[1] ?? m[2] ?? m[3]!)
  }
  return out
}

function numLit(s: string): Rat {
  const [w = '0', f = ''] = s.split('.')
  return rat(BigInt((w || '0') + f), 10n ** BigInt(f.length), f.length > 0)
}

export function parseExpr(src: string): Ast {
  const t = tokenize(src)
  let i = 0
  let depth = 0
  const peek = () => t[i]
  const eat = (s: string) => {
    if (t[i] !== s) throw new ExprError('syntax', t[i] ?? 'end')
    i++
  }
  const bin = (next: () => Ast, ops: string[], once = false) => (): Ast => {
    let a = next()
    while (ops.includes(peek() ?? '')) {
      const op = t[i++]!
      a = { k: 'bin', op, a, b: next() }
      if (once) break
    }
    return a
  }
  const atom = (): Ast => {
    const s = t[i++]
    if (s === undefined) throw new ExprError('syntax', 'end')
    if (s === '(') {
      const e = or()
      eat(')')
      return e
    }
    if (/^[\d.]/.test(s)) return { k: 'num', v: numLit(s) }
    if (/^[A-Z_a-z]/.test(s)) {
      if (peek() !== '(') return { k: 'name', name: s }
      if (!FN.has(s)) throw new ExprError('name', s)
      i++
      const args: Ast[] = []
      if (peek() !== ')') {
        args.push(or())
        while (peek() === ',') {
          i++
          args.push(or())
        }
      }
      eat(')')
      return { k: 'call', fn: s, args }
    }
    throw new ExprError('syntax', s)
  }
  const pow = (): Ast => {
    const a = atom()
    if (peek() !== '^') return a
    i++
    return { k: 'bin', op: '^', a, b: unary() }
  }
  const unary = (): Ast => {
    if (++depth > MAX_DEPTH) throw new ExprError('syntax', 'too deep')
    try {
      const s = peek()
      if (s === '-' || s === '!') {
        i++
        return { k: 'un', op: s, a: unary() }
      }
      if (s === '+') {
        i++
        return unary()
      }
      return pow()
    }
    finally {
      depth--
    }
  }
  const mul = bin(unary, ['*', '/', '%'])
  const add = bin(mul, ['+', '-'])
  const cmp = bin(add, ['==', '!=', '<', '<=', '>', '>='], true)
  const and = bin(cmp, ['&&'])
  const or: () => Ast = bin(and, ['||'])
  const e = or()
  if (i < t.length) throw new ExprError('syntax', t[i]!)
  return e
}

/** 식에 쓰인 이름 (함수 이름 제외) */
export function exprNames(ast: Ast, out = new Set<string>()): Set<string> {
  switch (ast.k) {
    case 'name': out.add(ast.name); break
    case 'un': exprNames(ast.a, out); break
    case 'bin': exprNames(ast.a, out); exprNames(ast.b, out); break
    case 'call': ast.args.forEach(a => exprNames(a, out)); break
  }
  return out
}

export type Env = Record<string, Value | string>

export function evalAst(ast: Ast, env: Env): Value {
  switch (ast.k) {
    case 'num': return ast.v
    case 'name': {
      if (!Object.hasOwn(env, ast.name)) throw new ExprError('name', ast.name)
      const v = env[ast.name]!
      if (typeof v === 'string') throw new ExprError('text', ast.name)
      return v
    }
    case 'un': {
      const v = evalAst(ast.a, env)
      if (ast.op === '!') return bool(!truthy(v))
      return isRat(v) ? rat(-v.n, v.d, v.dec) : -v
    }
    case 'bin': {
      if (ast.op === '&&') return bool(truthy(evalAst(ast.a, env)) && truthy(evalAst(ast.b, env)))
      if (ast.op === '||') return bool(truthy(evalAst(ast.a, env)) || truthy(evalAst(ast.b, env)))
      const a = evalAst(ast.a, env)
      const b = evalAst(ast.b, env)
      switch (ast.op) {
        case '==': return bool(compare(a, b) === 0)
        case '!=': return bool(compare(a, b) !== 0)
        case '<': return bool(compare(a, b) < 0)
        case '<=': return bool(compare(a, b) <= 0)
        case '>': return bool(compare(a, b) > 0)
        case '>=': return bool(compare(a, b) >= 0)
      }
      return arith(ast.op, a, b)
    }
    case 'call': return call(ast.fn, ast.args.map(a => evalAst(a, env)))
  }
}

export const evalExpr = (src: string, env: Env = {}) => evalAst(parseExpr(src), env)
export const isTrue = truthy

function decimalString(v: Rat): string | null {
  let d = v.d
  let k = 0
  while (d % 10n === 0n) { d /= 10n; k++ }
  while (d % 2n === 0n) { d /= 2n; k++ }
  while (d % 5n === 0n) { d /= 5n; k++ }
  if (d !== 1n || k > 12) return null
  const scaled = absB(v.n) * (10n ** BigInt(k) / v.d)
  const s = scaled.toString().padStart(k + 1, '0')
  const out = k ? `${s.slice(0, -k)}.${s.slice(-k)}`.replace(/\.?0+$/, '') : s
  return (v.n < 0n ? '-' : '') + out
}

/** 화면용: 정수 "3", 분수 "3/4"(tex면 \frac{3}{4}), 소수에서 온 값 "2.35", 근삿값은 유효숫자 10자리 */
export function formatValue(v: Value, tex = false): string {
  if (!isRat(v)) return String(Number(v.toPrecision(10)))
  if (v.d === 1n) return v.n.toString()
  if (v.dec) {
    const s = decimalString(v)
    if (s) return s
  }
  if (!tex) return `${v.n}/${v.d}`
  return `${v.n < 0n ? '-' : ''}\\frac{${absB(v.n)}}{${v.d}}`
}

export const sameValue = (a: Value, b: Value) => compare(a, b) === 0
