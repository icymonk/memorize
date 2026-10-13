import type { PropDef } from '#shared/schemas/collection'
import { coerceProp } from '#shared/schemas/collection'
import { describe, expect, it } from 'vitest'
import { isTagProp, tagAwareDef, tagKey, withTags } from './tags'

const tagsDef: PropDef = { key: 'tags', name: '태그', type: 'multiSelect', options: ['기존'] }
const other: PropDef = { key: 'p1', name: '과목', type: 'multiSelect', options: ['수학'] }

describe('tags (CMN-51)', () => {
  it('tagKey folds case, trims, escapes slash and rejects reserved ids', () => {
    expect(tagKey('  JLPT N3 ')).toBe('jlpt n3')
    expect(tagKey('a/b')).toBe('a∕b')
    expect(tagKey('..')).toBe('')
    expect(tagKey('__x__')).toBe('')
    expect(tagKey('x'.repeat(40))).toHaveLength(30)
  })

  it('only tag props get shared tags and accept new values', () => {
    expect(isTagProp(tagsDef)).toBe(true)
    expect(isTagProp(other)).toBe(false)
    expect(withTags(tagsDef, [{ id: 'n3', name: 'N3', color: 'blue' }]).options).toEqual(['기존', 'N3'])
    expect(withTags(other, [{ id: 'n3', name: 'N3', color: 'blue' }])).toBe(other)
    expect(coerceProp(tagAwareDef(tagsDef, ['새것', '새것', 1]), ['새것', '새것', 1])).toEqual(['새것'])
    expect(coerceProp(tagAwareDef(other, ['영어']), ['영어'])).toEqual([])
  })
})
