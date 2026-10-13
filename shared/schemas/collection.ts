import { z } from 'zod'

/** NOTE-46~49 내 모음 — docs/dev/data-model.md 4절 */
export const PROP_TYPES = ['text', 'number', 'select', 'multiSelect', 'date', 'checkbox'] as const
export type PropType = (typeof PROP_TYPES)[number]
export const COLLECTION_SCOPES = ['private', 'shared'] as const
export type CollectionScope = (typeof COLLECTION_SCOPES)[number]
export const VIEW_TYPES = ['list', 'table', 'calendar'] as const
export type ViewType = (typeof VIEW_TYPES)[number]

export const MAX_PROPS = 20
export const MAX_OPTIONS = 30

const key = z.string().regex(/^[a-z0-9]{1,16}$/)

export const propDef = z.object({
  key,
  name: z.string().trim().min(1).max(40),
  type: z.enum(PROP_TYPES),
  options: z.array(z.string().trim().min(1).max(30)).max(MAX_OPTIONS).default([]),
})
export type PropDef = z.infer<typeof propDef>

export const collectionInput = z.object({
  name: z.string().trim().min(1).max(60),
  icon: z.string().max(16).default(''),
  scope: z.enum(COLLECTION_SCOPES).default('shared'),
  schema: z.array(propDef).max(MAX_PROPS).default([])
    .refine(s => new Set(s.map(p => p.key)).size === s.length, 'duplicate key'),
})
export type CollectionInput = z.infer<typeof collectionInput>

export type PropValue = string | number | boolean | string[] | null

/** 항목 종류에 맞지 않는 값은 버린다 (표에서 고칠 때·종류를 바꾼 뒤) */
export function coerceProp(def: Pick<PropDef, 'type' | 'options'>, v: unknown): PropValue {
  switch (def.type) {
    case 'text': return typeof v === 'string' && v.trim() ? v.slice(0, 500) : null
    case 'number': {
      const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN
      return Number.isFinite(n) ? n : null
    }
    case 'select': return typeof v === 'string' && def.options.includes(v) ? v : null
    case 'multiSelect': return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && def.options.includes(x)))] : null
    case 'date': return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
    case 'checkbox': return v === true
  }
}

/** 정렬용 비교: 빈 값은 항상 뒤로 */
export function compareProp(a: PropValue | undefined, b: PropValue | undefined): number {
  const empty = (x: unknown) => x === null || x === undefined || x === '' || (Array.isArray(x) && !x.length)
  if (empty(a) || empty(b)) return empty(a) === empty(b) ? 0 : empty(a) ? 1 : -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(b) - Number(a)
  return String(a).localeCompare(String(b), 'ko')
}

export function newPropKey(existing: string[]): string {
  for (let i = 1; ; i++) {
    const k = `p${i}`
    if (!existing.includes(k)) return k
  }
}

/** NOTE-44: 저장한 보기 — 보기 종류, 필터 하나, 정렬, 묶기, 캘린더 날짜 항목 */
export const viewDef = z.object({
  id: z.string().regex(/^[a-z0-9]{1,16}$/),
  name: z.string().trim().min(1).max(30),
  type: z.enum(VIEW_TYPES),
  filter: z.object({ key, value: z.union([z.string().max(100), z.boolean()]) }).nullable().default(null),
  sort: z.object({ key: z.string().max(16), dir: z.union([z.literal(1), z.literal(-1)]) }).nullable().default(null),
  groupBy: key.nullable().default(null),
  dateKey: key.nullable().default(null),
})
export type ViewDef = z.infer<typeof viewDef>
export const MAX_VIEWS = 20

/** 필터 하나: 선택·태그는 그 값 포함, 체크는 참/거짓, 나머지는 글자 포함 */
export function matchesFilter(def: Pick<PropDef, 'type'> | undefined, v: PropValue | undefined, want: string | boolean): boolean {
  if (!def) return true
  if (def.type === 'checkbox') return (v === true) === (want === true)
  if (def.type === 'multiSelect') return Array.isArray(v) && v.includes(String(want))
  if (def.type === 'select') return v === want
  return v !== null && v !== undefined && String(v).toLowerCase().includes(String(want).toLowerCase())
}

/** 콜러블 입력: 모음 삭제 (안의 페이지는 휴지통으로) */
export const collectionRefInput = z.object({ spaceId: z.string().min(1).max(128), collectionId: z.string().min(1).max(128) })
export type CollectionRefInput = z.infer<typeof collectionRefInput>
