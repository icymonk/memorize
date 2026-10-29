import type { Ast, Env, Value } from './expr'
import { z } from 'zod'
import { evalAst, ExprError, exprNames, formatValue, FUNCTIONS, isTrue, parseExpr, rat, sameValue } from './expr'
import { splitTex } from './tex'

/**
 * MATH-14 변형 문제 틀: 지문의 {이름}·{식} 자리에 뽑은 숫자를 넣는다.
 * 변수 종류: int(min~max, step 간격, exclude 제외), dec(min~max, 소수 digits자리), frac(분모 min~max의 진분수, 약분), pick(options 중 하나)
 */
const NAME = /^[a-z][a-z0-9]{0,7}$/
const expr = z.string().trim().min(1).max(200)
export const MAX_TRIES = 200

export const templateVar = z.object({
  name: z.string().regex(NAME),
  kind: z.enum(['int', 'dec', 'frac', 'pick']),
  min: z.number().finite().min(-1_000_000).max(1_000_000).default(1),
  max: z.number().finite().min(-1_000_000).max(1_000_000).default(9),
  step: z.number().positive().max(1_000_000).nullable().default(null),
  digits: z.number().int().min(1).max(4).nullable().default(null),
  exclude: z.array(z.number().finite()).max(20).default([]),
  options: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
})
export type TemplateVar = z.infer<typeof templateVar>

export const templateInput = z.object({
  prompt: z.string().trim().min(1).max(2000),
  explanation: z.string().trim().max(2000).default(''),
  hints: z.array(z.string().trim().min(1).max(500)).max(5).default([]),
  vars: z.array(templateVar).min(1).max(10),
  calc: z.array(z.object({ name: z.string().regex(NAME), expr })).max(10).default([]),
  conds: z.array(expr).max(10).default([]),
  answerExpr: expr,
  wrongExprs: z.array(expr).max(5).default([]),
})
export type Template = z.infer<typeof templateInput>
export type TemplateDraft = z.input<typeof templateInput>

export interface TemplateIssue {
  code: 'parse' | 'name' | 'dup' | 'reserved' | 'range' | 'options' | 'text'
  /** 문제가 있는 칸: 'var:a' | 'calc:s' | 'cond:0' | 'answer' | 'wrong:1' */
  at: string
}

const RESERVED = new Set<string>(FUNCTIONS)

function tryParse(src: string): Ast | null {
  try {
    return parseExpr(src)
  }
  catch {
    return null
  }
}

/** 저장 전에 고칠 것: 식 문법, 정의되지 않은 이름, 이름 중복, 범위 */
export function checkTemplate(t: Template): TemplateIssue[] {
  const out: TemplateIssue[] = []
  const known = new Set<string>()
  const text = new Set<string>()
  const define = (name: string, at: string) => {
    if (RESERVED.has(name)) out.push({ code: 'reserved', at })
    else if (known.has(name)) out.push({ code: 'dup', at })
    known.add(name)
  }
  for (const v of t.vars) {
    const at = `var:${v.name}`
    define(v.name, at)
    if (v.kind === 'pick') {
      if (!v.options.length) out.push({ code: 'options', at })
      if (v.options.some(o => numericOption(o) === null)) text.add(v.name)
      continue
    }
    if (v.min > v.max) out.push({ code: 'range', at })
    if (v.kind === 'int' && (!Number.isInteger(v.min) || !Number.isInteger(v.max))) out.push({ code: 'range', at })
    if (v.kind === 'frac' && (v.min < 2 || v.max > 99 || !Number.isInteger(v.min) || !Number.isInteger(v.max))) out.push({ code: 'range', at })
  }
  const use = (src: string, at: string) => {
    const ast = tryParse(src)
    if (!ast) return out.push({ code: 'parse', at })
    const names = [...exprNames(ast)]
    if (names.some(n => !known.has(n))) out.push({ code: 'name', at })
    else if (names.some(n => text.has(n))) out.push({ code: 'text', at })
  }
  for (const c of t.calc) {
    use(c.expr, `calc:${c.name}`)
    define(c.name, `calc:${c.name}`)
  }
  t.conds.forEach((c, i) => use(c, `cond:${i}`))
  use(t.answerExpr, 'answer')
  t.wrongExprs.forEach((w, i) => use(w, `wrong:${i}`))
  return out
}

const NUMERIC = /^-?\d+(?:\.\d+)?(?:\/\d+)?$/
function numericOption(o: string): Value | null {
  if (!NUMERIC.test(o)) return null
  try {
    return evalAst(parseExpr(o), {})
  }
  catch {
    return null
  }
}

/** 같은 seed → 같은 숫자 (mulberry32) */
export function seededRandom(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let x = a
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}
export const newSeed = () => Math.floor(Math.random() * 2 ** 32)

const randInt = (rand: () => number, min: number, max: number) => min + Math.floor(rand() * (max - min + 1))

function drawVar(v: TemplateVar, rand: () => number): Value | string | null {
  switch (v.kind) {
    case 'int': {
      const step = v.step ?? 1
      const n = Math.floor((v.max - v.min) / step + 1e-9)
      const x = v.min + step * randInt(rand, 0, n)
      const r = Number.isInteger(x) ? rat(BigInt(x)) : evalAst(parseExpr(String(+x.toFixed(6))), {})
      return v.exclude.includes(x) ? null : r
    }
    case 'dec': {
      const k = v.digits ?? 1
      const scale = 10 ** k
      const i = randInt(rand, Math.ceil(v.min * scale - 1e-9), Math.floor(v.max * scale + 1e-9))
      return v.exclude.some(e => Math.abs(e * scale - i) < 1e-6) ? null : rat(BigInt(i), BigInt(scale), true)
    }
    case 'frac': {
      const d = randInt(rand, v.min, v.max)
      return rat(BigInt(randInt(rand, 1, d - 1)), BigInt(d))
    }
    case 'pick': {
      const o = v.options[randInt(rand, 0, v.options.length - 1)]!
      return numericOption(o) ?? o
    }
  }
}

/** 지문 채우기: {a}, {s+1}처럼 변수를 쓰는 중괄호만 바꾸고 \frac{1}{2} 같은 수식 중괄호는 그대로 둔다 */
export function fillText(src: string, env: Env): string {
  const sub = (s: string, tex: boolean) => s.replace(/\{([^{}]+)\}/g, (all, body: string) => {
    const ast = tryParse(body)
    if (!ast) return all
    const names = [...exprNames(ast)]
    if (!names.length || names.some(n => !Object.hasOwn(env, n))) return all
    if (ast.k === 'name' && typeof env[ast.name] === 'string') return env[ast.name] as string
    try {
      return formatValue(evalAst(ast, env), tex)
    }
    catch {
      return all
    }
  })
  return splitTex(src).map(p => p.kind === 'text'
    ? sub(p.value, false).replace(/\$/g, '\\$')
    : p.display ? `$$${sub(p.value, true)}$$` : `$${sub(p.value, true)}$`).join('')
}

/** 보기 글자: 분수는 수식으로 */
const choiceText = (v: Value) => {
  const s = formatValue(v, true)
  return s.includes('\\frac') ? `$${s}$` : s
}

export interface Drawn {
  prompt: string
  explanation: string
  hints: string[]
  /** 단답형 정답 ("3/4", "2.5") */
  answer: string
  /** 객관식: 정답 + 오답을 섞은 보기와 정답 번호 */
  choices: string[]
  answerIndex: number
}
export type DrawResult = { ok: true, problem: Drawn, tries: number } | { ok: false, tries: number }

/** 조건을 모두 만족할 때까지 최대 200번 다시 뽑는다. choice면 오답 식으로 보기를 만든다 */
export function drawProblem(t: Template, seed: number, choice: boolean): DrawResult {
  const rand = seededRandom(seed)
  const calc = t.calc.map(c => ({ name: c.name, ast: parseExpr(c.expr) }))
  const conds = t.conds.map(c => parseExpr(c))
  const answerAst = parseExpr(t.answerExpr)
  const wrongAsts = t.wrongExprs.map(w => parseExpr(w))
  for (let tries = 1; tries <= MAX_TRIES; tries++) {
    const env: Env = {}
    let ok = true
    for (const v of t.vars) {
      const x = drawVar(v, rand)
      if (x === null) {
        ok = false
        break
      }
      env[v.name] = x
    }
    if (!ok) continue
    let answer: Value
    try {
      for (const c of calc) env[c.name] = evalAst(c.ast, env)
      if (!conds.every(c => isTrue(evalAst(c, env)))) continue
      answer = evalAst(answerAst, env)
    }
    catch (e) {
      if (e instanceof ExprError) continue
      throw e
    }
    const problem: Drawn = {
      prompt: fillText(t.prompt, env),
      explanation: fillText(t.explanation, env),
      hints: t.hints.map(h => fillText(h, env)),
      answer: formatValue(answer),
      choices: [],
      answerIndex: 0,
    }
    if (choice) {
      const values: Value[] = [answer]
      const add = (v: Value) => {
        if (values.some(x => sameValue(x, v))) return false
        values.push(v)
        return true
      }
      for (const w of wrongAsts) {
        let v: Value | null = null
        try {
          v = evalAst(w, env)
        }
        catch {}
        if (v === null || !add(v)) {
          for (let k = 1; k < 50 && !add(evalAst(parseExpr(`a + ${k % 2 ? '' : '-'}${Math.ceil(k / 2)}`), { a: answer })); k++);
        }
      }
      const order = values.map((_, i) => i)
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1))
        ;[order[i], order[j]] = [order[j]!, order[i]!]
      }
      problem.choices = order.map(i => choiceText(values[i]!))
      problem.answerIndex = order.indexOf(0)
    }
    return { ok: true, problem, tries }
  }
  return { ok: false, tries: MAX_TRIES }
}

/** 미리보기: 예시 n개와 숫자 뽑기 실패 수 (실패가 있으면 저장하지 않는다) */
export function previewTemplate(t: Template, choice: boolean, seed: number, n = 5, check = 20) {
  const samples: Drawn[] = []
  let failed = 0
  let tries = 0
  for (let i = 0; i < Math.max(n, check); i++) {
    const r = drawProblem(t, (seed + i * 7919) >>> 0, choice)
    tries += r.tries
    if (!r.ok) failed++
    else if (samples.length < n) samples.push(r.problem)
  }
  return { samples, failed, acceptRate: Math.max(n, check) / tries }
}
