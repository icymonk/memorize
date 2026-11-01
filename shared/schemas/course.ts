import { z } from 'zod'

/** CRS-01·02 코스·레슨 — docs/dev/data-model.md 6절 */
export const LESSON_LINKS_MAX = 20

export const courseInput = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(''),
  level: z.string().trim().max(30).default(''),
  visibility: z.enum(['private', 'group', 'space']).default('space'),
  groupIds: z.array(z.string().min(1)).max(20).default([]),
  /** 편집 범위: 만든 사람만 / 지정한 사람 / 모든 멤버 */
  editPolicy: z.enum(['author', 'collaborators', 'everyone']).default('author'),
  /** 레슨 본문 페이지의 editorIds(최대 50)에 만든 사람까지 들어가므로 49명까지 */
  collaboratorIds: z.array(z.string().min(1)).max(49).default([]),
})
  .transform(v => ({ ...v, groupIds: v.visibility === 'group' ? v.groupIds : [], collaboratorIds: v.editPolicy === 'collaborators' ? v.collaboratorIds : [] }))
  .refine(v => v.visibility !== 'group' || v.groupIds.length > 0)
export type CourseInput = z.infer<typeof courseInput>

export const lessonTitle = z.string().trim().min(1).max(80)

const ids = z.array(z.string().min(1)).max(LESSON_LINKS_MAX)
export const lessonLinks = z.object({ linkedDeckIds: ids, linkedProblemSetIds: ids, linkedTestIds: ids })
export type LessonLinks = z.infer<typeof lessonLinks>

type Editable = Pick<CourseInput, 'editPolicy' | 'collaboratorIds'> & { createdBy: string }
export const canEditCourse = (c: Editable, uid: string) =>
  c.createdBy === uid || c.editPolicy === 'everyone' || (c.editPolicy === 'collaborators' && c.collaboratorIds.includes(uid))

/** 레슨 본문 페이지(type 'lesson')의 공개·편집 범위는 코스를 따른다 */
export function lessonPageAccess(c: Pick<CourseInput, 'visibility' | 'groupIds'> & Editable) {
  return {
    visibility: c.visibility,
    groupIds: c.groupIds,
    editorIds: [...new Set([c.createdBy, ...(c.editPolicy === 'collaborators' ? c.collaboratorIds : [])])],
    editPolicy: c.editPolicy === 'everyone' ? 'everyone' as const : 'editors' as const,
  }
}

/** CRS-03 순서 바꾸기: 이웃 레슨과 order를 맞바꾼다 */
export function swapOrder<T extends { id: string, order: number }>(list: T[], id: string, dir: -1 | 1) {
  const s = [...list].sort((a, b) => a.order - b.order)
  const i = s.findIndex(x => x.id === id)
  const a = s[i]
  const b = s[i + dir]
  if (!a || !b) return null
  return [{ id: a.id, order: b.order }, { id: b.id, order: a.order }] as const
}

export const nextOrder = (list: { order: number }[]) => list.reduce((m, x) => Math.max(m, x.order), 0) + 1

/** CRS-11~16 레슨 자료: 올린 파일(path) 또는 링크(url) */
export const MATERIALS_MAX = 30
export const MATERIAL_TYPES = ['pdf', 'audio', 'video', 'image', 'link', 'office', 'file'] as const
export type MaterialType = typeof MATERIAL_TYPES[number]

export const materialSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(MATERIAL_TYPES),
  title: z.string().trim().min(1).max(200),
  path: z.string().max(400).nullable().default(null),
  url: z.string().url().max(2000).refine(u => /^https?:\/\//i.test(u)).nullable().default(null),
  contentType: z.string().max(120).nullable().default(null),
  size: z.number().int().nonnegative().nullable().default(null),
}).refine(m => (m.path == null) !== (m.url == null))
export type Material = z.infer<typeof materialSchema>

export function materialType(contentType: string, name: string): MaterialType {
  if (contentType === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf'
  if (contentType.startsWith('audio/')) return 'audio'
  if (contentType.startsWith('video/')) return 'video'
  if (contentType.startsWith('image/')) return 'image'
  if (/\.(?:docx?|pptx?|xlsx?|hwpx?)$/i.test(name) || /officedocument|msword|ms-excel|ms-powerpoint|hwp/.test(contentType)) return 'office'
  return 'file'
}

/** CRS-15: 화면 안 미리보기는 워드·파워포인트·엑셀만 (한글 파일은 내려받기) */
export const officePreviewable = (name: string) => /\.(?:docx?|pptx?|xlsx?)$/i.test(name)

/** CRS-13: 유튜브 링크 → 영상 ID (주소에 그대로 넣으므로 글자를 제한한다) */
export function youtubeId(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  }
  catch {
    return null
  }
  const host = u.hostname.replace(/^(?:www|m)\./, '')
  const id = host === 'youtu.be'
    ? u.pathname.slice(1).split('/')[0]
    : host === 'youtube.com' ? u.searchParams.get('v') ?? u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1] : null
  return id && /^[\w-]{6,20}$/.test(id) ? id : null
}

/** 링크 자료: 유튜브·영상 파일 주소면 영상, 아니면 링크 */
export function linkType(url: string): MaterialType {
  return youtubeId(url) || /\.(?:mp4|webm|ogv|mov)(?:[?#]|$)/i.test(url) ? 'video' : 'link'
}

export function moveItem<T>(list: T[], i: number, dir: -1 | 1): T[] | null {
  const j = i + dir
  if (i < 0 || j < 0 || i >= list.length || j >= list.length) return null
  const out = [...list]
  ;[out[i], out[j]] = [out[j]!, out[i]!]
  return out
}

/** CRS-12 A-B 구간 반복: 재생 위치가 B를 지나면 A로 돌아간다 */
export const loopTarget = (t: number, a: number | null, b: number | null) => a != null && b != null && b > a && t >= b ? a : null
export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const

/** CRS-21·22 진도: lessonProgress/{uid}_{lessonId} */
export const progressId = (uid: string, lessonId: string) => `${uid}_${lessonId}`

export function courseProgress(lessonIds: string[], doneIds: Iterable<string>) {
  const done = new Set(doneIds)
  const n = lessonIds.filter(id => done.has(id)).length
  return { done: n, total: lessonIds.length, pct: lessonIds.length ? Math.round(n / lessonIds.length * 100) : 0 }
}
