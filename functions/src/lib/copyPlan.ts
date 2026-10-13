export interface PageNode { id: string, parentId: string | null, ancestorIds: string[] }
export interface PlannedPage { id: string, parentId: string | null, ancestorIds: string[] }

/** NOTE-27: 복사할 하위 트리의 새 ID·부모·조상 목록. 중간 페이지가 빠지면 그 아래도 뺀다 */
export function planSubtree(rootId: string, descendants: PageNode[], newId: () => string): Map<string, PlannedPage> {
  const ids = new Map<string, string>([[rootId, newId()]])
  const chain = (d: PageNode) => d.ancestorIds.slice(d.ancestorIds.indexOf(rootId))
  const kept = descendants.filter(d => d.ancestorIds.includes(rootId))
  const known = new Set([rootId, ...kept.map(d => d.id)])
  const ok = kept.filter(d => chain(d).every(a => known.has(a)) && d.parentId !== null && known.has(d.parentId))
  for (const d of ok) ids.set(d.id, newId())
  const plan = new Map<string, PlannedPage>([[rootId, { id: ids.get(rootId)!, parentId: null, ancestorIds: [] }]])
  for (const d of ok) {
    if (!chain(d).every(a => ids.has(a))) continue
    plan.set(d.id, { id: ids.get(d.id)!, parentId: ids.get(d.parentId!)!, ancestorIds: chain(d).map(a => ids.get(a)!) })
  }
  return plan
}
