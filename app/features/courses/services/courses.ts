import type { CourseInput, LessonLinks, Material } from '#shared/schemas/course'
import type { Firestore, Timestamp } from 'firebase/firestore'
import { lessonPageAccess } from '#shared/schemas/course'
import { addDoc, and, collection, deleteDoc, doc, getDoc, getDocs, or, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore'

/** CRS-01 코스 */
export interface Course extends CourseInput {
  id: string
  createdBy: string
  deletedAt: Timestamp | null
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

/** CRS-02·10 레슨: 본문은 노트 편집기로 쓰는 페이지(type 'lesson', 노트 목록에는 안 보임) */
export interface Lesson extends LessonLinks {
  id: string
  title: string
  order: number
  bodyPageId: string | null
  /** CRS-11~16 (3-F2 전에 만든 레슨에는 없다) */
  materials?: Material[]
  createdBy: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

const coursesOf = (db: Firestore, sid: string) => collection(db, 'spaces', sid, 'courses')
const lessonsOf = (db: Firestore, sid: string, cid: string) => collection(db, 'spaces', sid, 'courses', cid, 'lessons')

export async function listCourses(db: Firestore, sid: string, uid: string, groupIds: string[] = []): Promise<Course[]> {
  const byGroup = groupIds.length ? [and(where('visibility', '==', 'group'), where('groupIds', 'array-contains-any', groupIds.slice(0, 10)))] : []
  const snap = await getDocs(query(coursesOf(db, sid), or(where('visibility', '==', 'space'), where('createdBy', '==', uid), ...byGroup)))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Course).filter(c => !c.deletedAt)
    .sort((a, b) => (b.updatedAt?.toMillis() ?? Infinity) - (a.updatedAt?.toMillis() ?? Infinity))
}

export async function getCourse(db: Firestore, sid: string, id: string): Promise<Course | null> {
  const snap = await getDoc(doc(coursesOf(db, sid), id))
  const c = snap.exists() ? { id: snap.id, ...snap.data() } as Course : null
  return c?.deletedAt ? null : c
}

/** 만든 사람이 공개·편집 범위를 바꾸면 자기가 만든 레슨 본문 페이지에도 반영한다 */
export async function saveCourse(db: Firestore, sid: string, uid: string, v: CourseInput, existing?: Course | null) {
  const ref = existing ? doc(coursesOf(db, sid), existing.id) : doc(coursesOf(db, sid))
  const now = serverTimestamp()
  await setDoc(ref, { ...v, createdBy: existing?.createdBy ?? uid, deletedAt: null, createdAt: existing?.createdAt ?? now, updatedAt: now })
  if (existing && existing.createdBy === uid) {
    const access = lessonPageAccess({ ...v, createdBy: uid })
    const lessons = await listLessons(db, sid, existing.id)
    await Promise.allSettled(lessons.filter(l => l.bodyPageId && l.createdBy === uid)
      .map(l => updateDoc(doc(db, 'spaces', sid, 'pages', l.bodyPageId!), { ...access, updatedAt: serverTimestamp() })))
  }
  return ref.id
}

export const deleteCourse = (db: Firestore, sid: string, id: string) =>
  updateDoc(doc(coursesOf(db, sid), id), { deletedAt: serverTimestamp(), updatedAt: serverTimestamp() })

export async function listLessons(db: Firestore, sid: string, cid: string): Promise<Lesson[]> {
  const snap = await getDocs(query(lessonsOf(db, sid, cid), orderBy('order')))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Lesson)
}

export async function addLesson(db: Firestore, sid: string, uid: string, course: Course, title: string, order: number, personal: boolean) {
  const now = serverTimestamp()
  const access = lessonPageAccess(course)
  const page = await addDoc(collection(db, 'spaces', sid, 'pages'), {
    type: 'lesson',
    title,
    icon: '',
    cover: null,
    ownerId: uid,
    root: personal ? 'private' : 'shared',
    parentId: null,
    order: 'a0',
    ancestorIds: [],
    props: {},
    ...access,
    editorIds: [...new Set([...access.editorIds, uid])].slice(0, 50),
    sharedWith: [],
    reviewerIds: [],
    excerpt: '',
    blockCount: 0,
    textLength: 0,
    lock: null,
    ownerStatus: 'active',
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  })
  const ref = await addDoc(lessonsOf(db, sid, course.id), {
    title,
    order,
    bodyPageId: page.id,
    linkedDeckIds: [],
    linkedProblemSetIds: [],
    linkedTestIds: [],
    materials: [],
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
  })
  return ref.id
}

export const updateLesson = (db: Firestore, sid: string, cid: string, id: string, patch: Partial<LessonLinks & { title: string, materials: Material[] }>) =>
  updateDoc(doc(lessonsOf(db, sid, cid), id), { ...patch, updatedAt: serverTimestamp() })

export async function reorderLessons(db: Firestore, sid: string, cid: string, pairs: readonly { id: string, order: number }[]) {
  const b = writeBatch(db)
  for (const p of pairs) b.update(doc(lessonsOf(db, sid, cid), p.id), { order: p.order, updatedAt: serverTimestamp() })
  await b.commit()
}

export const removeLesson = (db: Firestore, sid: string, cid: string, id: string) => deleteDoc(doc(lessonsOf(db, sid, cid), id))
