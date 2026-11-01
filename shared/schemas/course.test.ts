import { describe, expect, it } from 'vitest'
import { canEditCourse, courseInput, courseProgress, lessonPageAccess, linkType, loopTarget, materialSchema, materialType, moveItem, nextOrder, officePreviewable, progressId, swapOrder, youtubeId } from './course'

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

describe('lesson materials (CRS-11~16)', () => {
  it('sorts uploads into material types', () => {
    expect(materialType('application/pdf', 'a.pdf')).toBe('pdf')
    expect(materialType('audio/mpeg', 'a.mp3')).toBe('audio')
    expect(materialType('video/mp4', 'a.mp4')).toBe('video')
    expect(materialType('image/png', 'a.png')).toBe('image')
    expect(materialType('application/octet-stream', '보고서.hwp')).toBe('office')
    expect(materialType('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'a.docx')).toBe('office')
    expect(materialType('application/zip', 'a.zip')).toBe('file')
    expect(officePreviewable('a.pptx')).toBe(true)
    expect(officePreviewable('a.hwp')).toBe(false)
  })

  it('recognizes youtube and video links', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://youtube.com/shorts/abcdef123')).toBe('abcdef123')
    expect(youtubeId('https://youtu.be/"><script>')).toBeNull()
    expect(youtubeId('nope')).toBeNull()
    expect(linkType('https://youtu.be/dQw4w9WgXcQ')).toBe('video')
    expect(linkType('https://cdn.example.com/a.mp4?x=1')).toBe('video')
    expect(linkType('https://example.com')).toBe('link')
  })

  it('validates materials, moves them and loops A-B', () => {
    expect(materialSchema.safeParse({ id: 'm1', type: 'link', title: '사전', url: 'https://dict.example.com' }).success).toBe(true)
    expect(materialSchema.safeParse({ id: 'm1', type: 'link', title: '사전', url: 'javascript:alert(1)' }).success).toBe(false)
    expect(materialSchema.safeParse({ id: 'm1', type: 'pdf', title: 'a', path: null, url: null }).success).toBe(false)
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b'])
    expect(moveItem(['a'], 0, 1)).toBeNull()
    expect(loopTarget(12, 5, 10)).toBe(5)
    expect(loopTarget(8, 5, 10)).toBeNull()
    expect(loopTarget(12, 5, null)).toBeNull()
  })
})

describe('course progress (CRS-22)', () => {
  it('counts only lessons that still exist', () => {
    expect(progressId('u1', 'l1')).toBe('u1_l1')
    expect(courseProgress(['a', 'b', 'c', 'd'], ['a', 'c', 'gone'])).toEqual({ done: 2, total: 4, pct: 50 })
    expect(courseProgress([], ['a'])).toEqual({ done: 0, total: 0, pct: 0 })
  })
})
