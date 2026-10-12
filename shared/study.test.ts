import { describe, expect, it } from 'vitest'
import { editDistance, gradeAnswer, makeChoices, nextLearnStage, nextRound, shuffle } from './study'

describe('gradeAnswer (VOC-22)', () => {
  it('exact ignores case, punctuation and spaces', () => {
    expect(gradeAnswer('  Apple! ', ['apple'])).toBe('exact')
    expect(gradeAnswer('make  a decision', ['Make a decision.'])).toBe('exact')
  })
  it('allows small typos by length', () => {
    expect(gradeAnswer('aple', ['apple'])).toBe('typo')
    expect(gradeAnswer('cat', ['car'])).toBe('wrong')
    expect(gradeAnswer('acommodation', ['accommodation'])).toBe('typo')
    expect(gradeAnswer('banana', ['apple'])).toBe('wrong')
    expect(gradeAnswer('', ['a'])).toBe('wrong')
  })
  it('any of several answers', () => {
    expect(gradeAnswer('운영하다', ['달리다', '운영하다'])).toBe('exact')
  })
  it('editDistance', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3)
  })
})

describe('choices and rounds (VOC-21)', () => {
  it('choices contain the answer once, no duplicates', () => {
    const c = makeChoices('사과', ['사과', '배', '배', '포도', '귤', '감'])
    expect(c).toHaveLength(4)
    expect(c.filter(x => x === '사과')).toHaveLength(1)
    expect(new Set(c).size).toBe(4)
    expect(makeChoices('사과', ['배'])).toHaveLength(2)
  })
  it('stages advance only when correct', () => {
    expect(nextLearnStage('choice', true)).toBe('written')
    expect(nextLearnStage('written', true)).toBe('done')
    expect(nextLearnStage('written', false)).toBe('written')
  })
  it('next round skips done items', () => {
    expect(nextRound([{ id: 'a', stage: 'done' }, { id: 'b', stage: 'choice' }, { id: 'c', stage: 'written' }], 1)).toEqual(['b'])
  })
  it('shuffle keeps items', () => {
    expect(shuffle([1, 2, 3]).sort()).toEqual([1, 2, 3])
  })
})

describe('mergeMatchTop (VOC-23)', () => {
  it('keeps each user best, sorted, top 10', async () => {
    const { mergeMatchTop } = await import('./study')
    const base = Array.from({ length: 10 }, (_, i) => ({ uid: `u${i}`, ms: 1000 + i * 100, at: i }))
    expect(mergeMatchTop(base, { uid: 'u0', ms: 5000, at: 99 })[0]).toEqual({ uid: 'u0', ms: 1000, at: 0 })
    const r = mergeMatchTop(base, { uid: 'new', ms: 900, at: 99 })
    expect(r).toHaveLength(10)
    expect(r[0]!.uid).toBe('new')
    expect(r.some(e => e.uid === 'u9')).toBe(false)
  })
})
