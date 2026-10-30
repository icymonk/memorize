import { describe, expect, it } from 'vitest'
import { canEditCourse, courseInput, lessonPageAccess, nextOrder, swapOrder } from './course'

describe('courses (CRS-01~03)', () => {
  it('drops groups and collaborators that the chosen scope does not use', () => {
    const v = courseInput.parse({ title: ' 영문법 ', groupIds: ['g1'], collaboratorIds: ['u2'] })
    expect(v).toMatchObject({ title: '영문법', visibility: 'space', groupIds: [], editPolicy: 'author', collaboratorIds: [] })
    expect(courseInput.safeParse({ title: 'a', visibility: 'group' }).success).toBe(false)
    expect(courseInput.parse({ title: 'a', visibility: 'group', groupIds: ['g1'] }).groupIds).toEqual(['g1'])
  })

  it('decides who edits and mirrors it on the lesson body page', () => {
    const c = { createdBy: 'a', editPolicy: 'collaborators' as const, collaboratorIds: ['b'], visibility: 'group' as const, groupIds: ['g1'] }
    expect(canEditCourse(c, 'a')).toBe(true)
    expect(canEditCourse(c, 'b')).toBe(true)
    expect(canEditCourse(c, 'c')).toBe(false)
    expect(canEditCourse({ ...c, editPolicy: 'everyone' }, 'c')).toBe(true)
    expect(lessonPageAccess(c)).toEqual({ visibility: 'group', groupIds: ['g1'], editorIds: ['a', 'b'], editPolicy: 'editors' })
    expect(lessonPageAccess({ ...c, editPolicy: 'everyone' })).toMatchObject({ editorIds: ['a'], editPolicy: 'everyone' })
  })

  it('swaps a lesson with its neighbour', () => {
    const l = [{ id: 'x', order: 1 }, { id: 'y', order: 2 }, { id: 'z', order: 5 }]
    expect(swapOrder(l, 'y', 1)).toEqual([{ id: 'y', order: 5 }, { id: 'z', order: 2 }])
    expect(swapOrder(l, 'x', -1)).toBeNull()
    expect(nextOrder(l)).toBe(6)
    expect(nextOrder([])).toBe(1)
  })
})
