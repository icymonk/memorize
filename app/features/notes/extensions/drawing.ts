// NOTE-11 그리기 블록: 획은 attrs.strokes에 { c: 색, w: 굵기, p: "x,y x,y …" }로 저장한다 (좌표는 800×450 기준 정수)
export interface Stroke { c: string, w: number, p: string }
export type Point = [number, number]

export const DRAW_W = 800
export const DRAW_H = 450
export const DRAW_COLORS = ['#111827', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'] as const
export const DRAW_WIDTHS = [2, 5, 10] as const
/** 블록 문서 크기(1MB)를 넘지 않게 점 수를 제한한다 */
export const MAX_DRAW_POINTS = 6000

export function parsePoints(p: string): Point[] {
  const s = p.trim()
  return s ? s.split(' ').map(xy => xy.split(',').map(Number) as Point) : []
}
export const formatPoints = (pts: Point[]) => pts.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(' ')
export const pointCount = (strokes: Stroke[]) => strokes.reduce((n, s) => n + parsePoints(s.p).length, 0)

/** 직전 점과 2 이상 떨어졌을 때만 점을 더한다 */
export function addPoint(pts: Point[], x: number, y: number) {
  const last = pts.at(-1)
  if (last && Math.hypot(last[0] - x, last[1] - y) < 2) return false
  pts.push([x, y])
  return true
}

/** 점 하나만 찍었으면 같은 점을 두 번 넣어 둥근 점으로 그린다 */
export function finishStroke(pts: Point[], c: string, w: number): Stroke {
  return { c, w, p: formatPoints(pts.length === 1 ? [pts[0]!, pts[0]!] : pts) }
}

/** 지우개: (x, y) 근처를 지나는 획을 통째로 지운다 */
export function hitStroke(s: Stroke, x: number, y: number, r = 8) {
  return parsePoints(s.p).some(([px, py]) => Math.hypot(px - x, py - y) <= r + s.w / 2)
}
