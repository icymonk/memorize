import { beforeEach, describe, expect, it, vi } from 'vitest'

const deleted: string[] = []
const wheres: unknown[][] = []
let pages: { id: string, space: string }[] = []
let spaces: { id: string, kind: string }[] = []
const related: Record<string, string[]> = {}

const docs = (list: { id: string, path: string, extra?: Record<string, unknown>, parentPath?: string }[]) => ({
  size: list.length,
  docs: list.map(d => ({
    id: d.id,
    ref: { path: d.path, parent: { parent: { collection: (c: string) => coll(`${d.parentPath}/${c}`) } } },
    get: (k: string) => d.extra?.[k],
  })),
})
function coll(path: string) {
  return {
    where: (...args: unknown[]) => {
      wheres.push([path, ...args])
      return { get: async () => docs((related[`${path}:${args[2]}`] ?? []).map(id => ({ id, path: `${path}/${id}` }))) }
    },
  }
}
const fakeDb = {
  collectionGroup: () => ({
    where: (...args: unknown[]) => {
      wheres.push(['pages*', ...args])
      return { limit: () => ({ get: async () => docs(pages.splice(0).map(p => ({ id: p.id, path: `spaces/${p.space}/pages/${p.id}`, parentPath: `spaces/${p.space}` }))) }) }
    },
  }),
  collection: (path: string) => ({
    where: (...args: unknown[]) => {
      wheres.push([path, ...args])
      return { get: async () => docs(spaces.map(s => ({ id: s.id, path: `spaces/${s.id}`, extra: { kind: s.kind } }))) }
    },
  }),
  bulkWriter: () => ({ delete: (ref: { path: string }) => deleted.push(ref.path), close: async () => {} }),
  recursiveDelete: async (ref: { path: string }) => { deleted.push(`${ref.path}/**`) },
}

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => fakeDb,
  Timestamp: { fromMillis: (ms: number) => ({ ms }) },
}))

const { purgeSpaces, purgeTrash } = await import('./purge')
const NOW = Date.UTC(2026, 9, 31)

beforeEach(() => {
  deleted.length = 0
  wheres.length = 0
  for (const k of Object.keys(related)) delete related[k]
})

describe('cronPurgeTrash (NOTE-23)', () => {
  it('deletes pages trashed over 30 days ago with their comments, reactions, feedback requests', async () => {
    pages = [{ id: 'p1', space: 's1' }]
    related['spaces/s1/comments:p1'] = ['c1']
    related['spaces/s1/reactions:p1'] = ['page_p1_bob']
    expect(await purgeTrash(NOW)).toBe(1)
    expect(wheres[0]).toEqual(['pages*', 'deletedAt', '<', { ms: NOW - 30 * 86_400_000 }])
    expect(deleted).toEqual(['spaces/s1/comments/c1', 'spaces/s1/reactions/page_p1_bob', 'spaces/s1/pages/p1/**'])
  })
})

describe('cronSpaceDeletion (WS-07)', () => {
  it('deletes workspaces whose grace period has ended, never personal spaces', async () => {
    spaces = [{ id: 'w1', kind: 'workspace' }, { id: 'p_bob', kind: 'personal' }]
    await purgeSpaces(NOW)
    expect(wheres[0]).toEqual(['spaces', 'deleteScheduledAt', '<=', { ms: NOW }])
    expect(deleted).toEqual(['spaces/w1/**'])
  })
})
