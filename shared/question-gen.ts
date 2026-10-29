import type { QuestionInput, QuestionKeyInput } from './schemas/question'
import { normalizeAnswer, shuffle } from './study'

/** TST-03 단어장에서 만들 문제 종류 */
export const GEN_KINDS = ['meaningToWord', 'wordToMeaning', 'meaningShort', 'wordShort', 'wordOx'] as const
export type GenKind = (typeof GEN_KINDS)[number]

export interface GenCard { front: string, back: string[] }
export interface GenOptions {
  kinds: readonly GenKind[]
  /** 지문 문구. 종류마다 단어나 뜻을 받아 문제를 만든다. OX는 (단어, 제시한 뜻) */
  prompts: Record<GenKind, (s: string, meaning: string) => string>
  base?: Partial<QuestionInput>
  choiceCount?: number
  rand?: () => number
}
export interface GenQuestion { q: QuestionInput, k: QuestionKeyInput }

const clip = (s: string, n: number) => s.length > n ? s.slice(0, n) : s
const meanings = (c: GenCard) => c.back.join(', ')

/** 정답과 겹치지 않는 오답을 섞어 보기를 만든다. 보기가 둘 미만이면 null */
function choicesFor(correct: string, exclude: string[], pool: readonly string[], n: number, rand: () => number) {
  const ban = new Set([correct, ...exclude].map(normalizeAnswer))
  const seen = new Set<string>()
  const others: string[] = []
  for (const p of shuffle(pool, rand)) {
    const key = normalizeAnswer(p)
    if (!key || ban.has(key) || seen.has(key)) continue
    seen.add(key)
    others.push(p)
    if (others.length >= n - 1) break
  }
  if (!others.length) return null
  const choices = shuffle([correct, ...others], rand).map(c => clip(c, 300))
  return { choices, answer: choices.indexOf(clip(correct, 300)) }
}

/** 카드마다 고른 종류의 문제를 만든다. 보기를 만들 수 없는 객관식은 건너뛴다 */
export function generateQuestions(cards: readonly GenCard[], pool: readonly GenCard[], opts: GenOptions): GenQuestion[] {
  const rand = opts.rand ?? Math.random
  const n = opts.choiceCount ?? 4
  const fronts = pool.map(c => c.front)
  const firstMeanings = pool.map(c => c.back[0] ?? '')
  const base: Omit<QuestionInput, 'type' | 'prompt' | 'choices'> = { tags: [], subjectId: null, media: [], difficulty: 'normal', defaultPoints: 10, sharing: 'private', answerVisibility: 'authors', ...opts.base }
  const key = { ignoreCase: true, ignoreSpaces: false, explanation: '', rubric: '' }
  const out: GenQuestion[] = []
  for (const c of cards) {
    if (!c.front || !c.back.length) continue
    for (const kind of opts.kinds) {
      if (kind === 'wordOx') {
        const wrong = rand() < 0.5 ? choicesFor(c.back[0]!, c.back, firstMeanings, 2, rand) : null
        const shown = wrong ? wrong.choices[1 - wrong.answer]! : c.back[0]!
        out.push({ q: { ...base, type: 'ox', prompt: clip(opts.prompts.wordOx(c.front, shown), 2000), choices: [] }, k: { ...key, answer: [!wrong] } })
        continue
      }
      const prompt = clip(opts.prompts[kind](kind === 'meaningToWord' || kind === 'meaningShort' ? meanings(c) : c.front, ''), 2000)
      if (kind === 'meaningToWord' || kind === 'wordToMeaning') {
        const r = kind === 'meaningToWord'
          ? choicesFor(c.front, [], fronts, n, rand)
          : choicesFor(c.back[0]!, c.back, firstMeanings, n, rand)
        if (!r) continue
        out.push({ q: { ...base, type: 'single', prompt, choices: r.choices }, k: { ...key, answer: [r.answer] } })
      }
      else {
        const answer = kind === 'meaningShort' ? [c.front] : c.back.filter(b => b.length <= 200).slice(0, 20)
        if (!answer.length) continue
        out.push({ q: { ...base, type: 'short', prompt, choices: [] }, k: { ...key, answer } })
      }
    }
  }
  return out
}
