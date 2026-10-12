const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** 뜻이 크게 바뀜 = 이전 뜻과 겹치는 뜻이 하나도 없음 → contentRev +1 (docs/features/vocab.md 7절) */
export function meaningChanged(before: string[] = [], after: string[] = []): boolean {
  const prev = new Set(before.map(norm))
  return prev.size > 0 && after.length > 0 && !after.some(m => prev.has(norm(m)))
}
