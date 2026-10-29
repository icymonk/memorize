import type { GenKind } from './question-gen'
import { describe, expect, it } from 'vitest'
import { generateQuestions } from './question-gen'
import { gradeAnswer, keyFits, questionInput, questionKeyInput } from './schemas/question'

const prompts: Record<GenKind, (s: string, m: string) => string> = {
  meaningToWord: s => `"${s}" 뜻의 단어는?`,
  wordToMeaning: s => `${s}의 뜻은?`,
  meaningShort: s => `"${s}" 뜻의 단어를 쓰세요`,
  wordShort: s => `${s}의 뜻을 쓰세요`,
  wordOx: (w, m) => `${w} = ${m}`,
}
const cards = [
  { front: 'apple', back: ['사과'] },
  { front: 'big', back: ['큰', '커다란'] },
  { front: 'large', back: ['커다란', '넓은'] },
  { front: 'dog', back: ['개'] },
  { front: 'cat', back: ['고양이'] },
]

describe('generateQuestions (TST-03)', () => {
  it('makes valid questions for each card and kind', () => {
    const out = generateQuestions(cards, cards, { kinds: ['meaningToWord', 'wordToMeaning', 'meaningShort', 'wordShort', 'wordOx'], prompts })
    expect(out).toHaveLength(25)
    for (const { q, k } of out) {
      expect(questionInput.safeParse(q).success).toBe(true)
      expect(questionKeyInput.safeParse(k).success).toBe(true)
      expect(keyFits(q, k)).toBe(true)
    }
  })

  it('meaning → word choices include the word once and grade correctly', () => {
    const { q, k } = generateQuestions([cards[0]!], cards, { kinds: ['meaningToWord'], prompts })[0]!
    expect(q.prompt).toBe('"사과" 뜻의 단어는?')
    expect(q.choices).toHaveLength(4)
    expect(q.choices.filter(c => c === 'apple')).toHaveLength(1)
    expect(gradeAnswer(q.type, k, [q.choices.indexOf('apple')], 10)).toBe(10)
  })

  it('word → meaning never offers another meaning of the same card as a wrong choice', () => {
    for (let i = 0; i < 20; i++) {
      const { q, k } = generateQuestions([cards[1]!], cards, { kinds: ['wordToMeaning'], prompts })[0]!
      expect(q.choices).not.toContain('커다란')
      expect(q.choices[k.answer[0] as number]).toBe('큰')
    }
  })

  it('short answers accept every meaning', () => {
    const { q, k } = generateQuestions([cards[1]!], cards, { kinds: ['wordShort'], prompts })[0]!
    expect(q.type).toBe('short')
    expect(k.answer).toEqual(['큰', '커다란'])
  })

  it('skips choice questions when there are no wrong choices, and applies base fields', () => {
    const one = [{ front: 'apple', back: ['사과'] }]
    const out = generateQuestions(one, one, { kinds: ['meaningToWord', 'meaningShort'], prompts, base: { tags: ['영단어'], defaultPoints: 5, sharing: 'space' } })
    expect(out.map(o => o.q.type)).toEqual(['short'])
    expect(out[0]!.q).toMatchObject({ tags: ['영단어'], defaultPoints: 5, sharing: 'space' })
  })

  it('VOC-25 OX shows the real meaning (O) or another card\'s meaning (X), never a meaning of the same card', () => {
    const seen = new Set<boolean>()
    for (let i = 0; i < 40; i++) {
      const { q, k } = generateQuestions([cards[1]!], cards, { kinds: ['wordOx'], prompts })[0]!
      expect(q.type).toBe('ox')
      expect(keyFits(q, k)).toBe(true)
      const shown = q.prompt.slice('big = '.length)
      seen.add(k.answer[0] as boolean)
      if (k.answer[0]) expect(shown).toBe('큰')
      else expect(['큰', '커다란']).not.toContain(shown)
    }
    expect(seen).toEqual(new Set([true, false]))
  })

  it('VOC-25 OX with a single card is always O', () => {
    const one = [{ front: 'apple', back: ['사과'] }]
    for (let i = 0; i < 10; i++)
      expect(generateQuestions(one, one, { kinds: ['wordOx'], prompts })[0]!.k.answer).toEqual([true])
  })
})
