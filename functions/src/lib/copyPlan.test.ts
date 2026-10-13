import { describe, expect, it } from 'vitest'
import { planSubtree } from './copyPlan'

describe('planSubtree', () => {
  const ids = () => { let n = 0; return () => `n${++n}` }

  it('re-roots the subtree and remaps parent/ancestors', () => {
    const plan = planSubtree('r', [
      { id: 'a', parentId: 'r', ancestorIds: ['top', 'r'] },
      { id: 'b', parentId: 'a', ancestorIds: ['top', 'r', 'a'] },
    ], ids())
    expect(plan.get('r')).toEqual({ id: 'n1', parentId: null, ancestorIds: [] })
    expect(plan.get('a')).toEqual({ id: 'n2', parentId: 'n1', ancestorIds: ['n1'] })
    expect(plan.get('b')).toEqual({ id: 'n3', parentId: 'n2', ancestorIds: ['n1', 'n2'] })
  })

  it('drops pages under a missing (hidden or trashed) page', () => {
    const plan = planSubtree('r', [
      { id: 'b', parentId: 'a', ancestorIds: ['r', 'a'] },
      { id: 'c', parentId: 'r', ancestorIds: ['r'] },
    ], ids())
    expect([...plan.keys()].sort()).toEqual(['c', 'r'])
  })
})
