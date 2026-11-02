import { describe, expect, it } from 'vitest'
import { journalsInRange, parsePrintItems, printUrl, safeName } from './exportRefs'

const j = (id: string, date: string | null, title = '') => ({ sid: 's', id, title, icon: '', date, mood: null })

describe('page export', () => {
  it('keeps journals inside the range in date order', () => {
    const list = [j('c', '2026-10-31'), j('a', '2026-10-01'), j('x', '2026-11-01'), j('n', null), j('b', '2026-10-15')]
    expect(journalsInRange(list, '2026-10-01', '2026-10-31').map(x => x.id)).toEqual(['a', 'b', 'c'])
  })
  it('round-trips print items and drops broken ones', () => {
    expect(parsePrintItems(printUrl([{ sid: 's1', id: 'p1' }, { sid: 's2', id: 'p2' }]).split('items=')[1])).toEqual([{ sid: 's1', id: 'p1' }, { sid: 's2', id: 'p2' }])
    expect(parsePrintItems('a/b,bad,/x,c/d/e')).toEqual([{ sid: 'a', id: 'b' }])
  })
  it('makes file-safe names', () => {
    expect(safeName('a/b:c?')).toBe('a_b_c_')
    expect(safeName('  ')).toBe('memorize')
  })
})
