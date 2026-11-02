import { describe, expect, it } from 'vitest'
import { addPoint, finishStroke, hitStroke, parsePoints, pointCount } from './drawing'

describe('drawing strokes', () => {
  it('skips points closer than 2 and rounds when saving', () => {
    const pts: [number, number][] = [[10, 10]]
    expect(addPoint(pts, 11, 10)).toBe(false)
    expect(addPoint(pts, 20.4, 10.6)).toBe(true)
    expect(finishStroke(pts, '#000', 5)).toEqual({ c: '#000', w: 5, p: '10,10 20,11' })
  })
  it('turns a single tap into a dot', () => {
    expect(parsePoints(finishStroke([[5, 6]], '#000', 2).p)).toEqual([[5, 6], [5, 6]])
  })
  it('counts points and hits strokes near the eraser', () => {
    const s = finishStroke([[0, 0], [100, 0]], '#000', 4)
    expect(pointCount([s, s])).toBe(4)
    expect(hitStroke(s, 100, 9)).toBe(true)
    expect(hitStroke(s, 50, 30)).toBe(false)
  })
})
