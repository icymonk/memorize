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
