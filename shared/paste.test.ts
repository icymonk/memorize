import { describe, expect, it } from 'vitest'
import { detectTermSeparator, parsePaste } from './paste'

describe('parsePaste (VOC-11)', () => {
  it('detects tab, dash, comma', () => {
    expect(detectTermSeparator('apple\t사과\nbanana\t바나나')).toBe('tab')
    expect(detectTermSeparator('apple - 사과\nbanana - 바나나')).toBe('dash')
    expect(detectTermSeparator('apple, 사과\nbanana, 바나나')).toBe('comma')
  })
  it('splits terms and multiple meanings, skips blank lines', () => {
    const r = parsePaste('apple\t사과; 애플\n\nrun\t달리다 / 운영하다', 'tab')
    expect(r).toEqual([
      { line: 1, raw: 'apple\t사과; 애플', front: 'apple', back: ['사과', '애플'], error: undefined },
      { line: 3, raw: 'run\t달리다 / 운영하다', front: 'run', back: ['달리다', '운영하다'], error: undefined },
    ])
  })
  it('only the first separator splits term and meaning', () => {
    expect(parsePaste('well-known - 잘 알려진', 'dash')[0]).toMatchObject({ front: 'well-known', back: ['잘 알려진'] })
    expect(parsePaste('a, b, c', 'comma')[0]).toMatchObject({ front: 'a', back: ['b, c'] })
  })
  it('semicolon card separator and custom term separator', () => {
    const r = parsePaste('cat=고양이;dog=개', { custom: '=' }, 'semicolon')
    expect(r.map(x => [x.front, x.back])).toEqual([['cat', ['고양이']], ['dog', ['개']]])
  })
  it('marks invalid lines', () => {
    const r = parsePaste('apple\nbanana\t\n\t바나나', 'tab')
    expect(r.map(x => x.error)).toEqual(['noSeparator', 'emptyBack', 'emptyFront'])
  })
})
