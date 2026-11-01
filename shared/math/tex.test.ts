import { describe, expect, it } from 'vitest'
import { hasTex, splitTex } from './tex'

describe('splitTex', () => {
  it('plain text', () => {
    expect(splitTex('사과 3개')).toEqual([{ kind: 'text', value: '사과 3개' }])
  })
  it('inline and display math', () => {
    expect(splitTex('값은 $\\frac{1}{2}$ 이고\n$$x^2+1$$')).toEqual([
      { kind: 'text', value: '값은 ' },
      { kind: 'math', value: '\\frac{1}{2}', display: false },
      { kind: 'text', value: ' 이고\n' },
      { kind: 'math', value: 'x^2+1', display: true },
    ])
  })
  it('escaped and unclosed dollars stay text', () => {
    expect(splitTex('\\$5 와 $3')).toEqual([{ kind: 'text', value: '$5 와 $3' }])
    expect(splitTex('$$ $$')).toEqual([{ kind: 'text', value: '$$ $$' }])
  })
  it('escaped dollar inside math', () => {
    expect(splitTex('$a\\$b$')).toEqual([{ kind: 'math', value: 'a\\$b', display: false }])
  })
  it('hasTex', () => {
    expect(hasTex('$x$')).toBe(true)
    expect(hasTex('1,000원')).toBe(false)
  })
})
