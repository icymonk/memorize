import type { DocumentReference } from 'firebase-admin/firestore'
import type { GenerateOutput, GenItem, GenSource, SaveGeneratedOutput } from '../../../shared/math/generate'
import type { Template } from '../../../shared/math/template'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { findUnit } from '../../../shared/math/curriculum'
import { generateInput, pickTemplates, previewTemplateInput, saveGeneratedInput } from '../../../shared/math/generate'
import { libraryById, libraryFor } from '../../../shared/math/library'
import { drawProblem, newSeed, templateInput } from '../../../shared/math/template'
import { can } from '../../../shared/permissions'
import { PROBLEM_SET_MAX_QUESTIONS } from '../../../shared/schemas/problem-set'
import { authedCallable } from '../lib/callable'

/**
 * MATH-15 단원별 만들기. 내장 틀(shared/math/library)과 워크스페이스에서 단원을 붙여 공유한 변형 문제의 틀을 쓴다.
 * 다른 사람의 틀은 정답 식이 앱으로 가지 않는다: 미리보기에 정답을 빼고, 저장한 복사본의 정답 문서도 원래 출제자만 읽는다
 */
interface Entry {
  source: GenSource
  name: string
  unit: string
  difficulty: 'easy' | 'normal' | 'hard'
  canChoice: boolean
  template: Template
  /** 정답을 볼 수 있는 사람 (내장·내 틀·정답 공개면 나) */
  authorId: string | null
  showAnswer: boolean
  copiedFrom?: { questionId: string, rev: number }
}

async function loadSpace(uid: string, spaceId: string) {
  const db = getFirestore()
  const spaceRef = db.doc(`spaces/${spaceId}`)
  const [space, member] = await Promise.all([spaceRef.get(), spaceRef.collection('members').doc(uid).get()])
  if (!space.exists || member.get('status') !== 'active') throw new HttpsError('not-found', 'space not found')
  return { db, spaceRef, space, member: { access: member.get('access'), status: member.get('status') } }
}

function unitCodes(code: string): string[] {
  const f = findUnit(code)
  if (!f) throw new HttpsError('invalid-argument', 'unknown unit')
  return f.concept ? [code] : [f.unit.code, ...f.unit.children.map(c => c.code)]
}

const builtin = (id: string): Entry | null => {
  const t = libraryById(id)
  if (!t) return null
  const template = templateInput.parse(t.template)
  return { source: { kind: 'builtin', id }, name: t.name, unit: t.unit, difficulty: t.difficulty, canChoice: template.wrongExprs.length > 0, template, authorId: null, showAnswer: true }
}

async function fromQuestions(spaceRef: DocumentReference, uid: string, docs: FirebaseFirestore.DocumentSnapshot[]): Promise<Entry[]> {
  const visible = docs.filter(d => d.exists && d.get('variant') && !d.get('deletedAt') && (d.get('createdBy') === uid || d.get('sharing') === 'space'))
  if (!visible.length) return []
  const keys = await getFirestore().getAll(...visible.map(d => spaceRef.collection('questionKeys').doc(d.id)))
  return visible.flatMap((d, i) => {
    const k = keys[i]!
    const t = templateInput.safeParse(k.get('template'))
    if (!t.success) return []
    const mine = d.get('createdBy') === uid
    const sees = mine || ((k.get('authorIds') as string[] | undefined) ?? []).includes(uid) || k.get('answerVisibility') === 'space'
    return [{
      source: { kind: 'question' as const, id: d.id },
      name: '',
      unit: d.get('unit.code') as string,
      difficulty: (['easy', 'normal', 'hard'].includes(d.get('difficulty')) ? d.get('difficulty') : 'normal') as Entry['difficulty'],
      canChoice: t.data.wrongExprs.length > 0,
      template: t.data,
      authorId: sees ? null : (d.get('createdBy') as string),
      showAnswer: sees,
      copiedFrom: mine ? undefined : { questionId: d.id, rev: Number(d.get('rev') ?? 1) },
    }]
  })
}

function draw(e: Entry, choice: boolean, seed: number): GenItem | null {
  const c = choice && e.canChoice
  const r = drawProblem(e.template, seed, c)
  if (!r.ok) return null
  return {
    source: e.source, name: e.name, unit: e.unit, canChoice: e.canChoice, choice: c, seed,
    prompt: r.problem.prompt,
    choices: c ? r.problem.choices : [],
    answer: e.showAnswer ? (c ? r.problem.choices[r.problem.answerIndex]! : r.problem.answer) : null,
  }
}

async function entryOf(spaceRef: DocumentReference, uid: string, source: GenSource): Promise<Entry> {
  const e = source.kind === 'builtin' ? builtin(source.id) : (await fromQuestions(spaceRef, uid, [await spaceRef.collection('questions').doc(source.id).get()]))[0]
  if (!e) throw new HttpsError('not-found', 'template not found')
  return e
}

/** 학년·단원(·세부 개념), 난이도, 개수, 정답 형식으로 미리보기 목록을 만든다 */
export const generateProblems = authedCallable(generateInput, async ({ uid, data }): Promise<GenerateOutput> => {
  const { spaceRef } = await loadSpace(uid, data.spaceId)
  const codes = unitCodes(data.unitCode)
  const builtins = libraryFor(data.unitCode).map(t => builtin(t.id)!)
  const qs = await spaceRef.collection('questions').where('unit.code', 'in', codes).limit(200).get()
  const shared = (await fromQuestions(spaceRef, uid, qs.docs)).slice(0, 60)
  const { picks, relaxed } = pickTemplates([...builtins, ...shared], data)
  return {
    items: picks.map(p => draw(p.entry, p.choice, p.seed)).filter((x): x is GenItem => !!x),
    pool: { builtin: builtins.length, workspace: shared.length },
    relaxed,
  }
})

/** 미리보기의 한 문제: 숫자 다시 뽑기·정답 형식 바꾸기 */
export const previewTemplate = authedCallable(previewTemplateInput, async ({ uid, data }): Promise<GenItem> => {
  const { spaceRef } = await loadSpace(uid, data.spaceId)
  const item = draw(await entryOf(spaceRef, uid, data.source), data.choice, data.seed)
  if (!item) throw new HttpsError('failed-precondition', 'draw failed')
  return item
})

/** 고른 틀을 내 변형 문제로 복사해 새 문제집 또는 기존 문제집에 넣는다 */
export const saveGenerated = authedCallable(saveGeneratedInput, async ({ uid, data }): Promise<SaveGeneratedOutput> => {
  const { db, spaceRef, space, member } = await loadSpace(uid, data.spaceId)
  if (!can({ kind: space.get('kind'), settings: space.get('settings'), member }, 'create')) throw new HttpsError('permission-denied', 'cannot create')
  const share = data.share && space.get('kind') === 'workspace'

  const cache = new Map<string, Entry>()
  const entries: Entry[] = []
  for (const it of data.items) {
    const k = `${it.source.kind}:${it.source.id}`
    if (!cache.has(k)) cache.set(k, await entryOf(spaceRef, uid, it.source))
    entries.push(cache.get(k)!)
  }

  const now = FieldValue.serverTimestamp()
  let setRef = spaceRef.collection('problemSets').doc()
  if (data.setId) {
    setRef = spaceRef.collection('problemSets').doc(data.setId)
    const s = await setRef.get()
    const editable = s.exists && !s.get('deletedAt') && (s.get('createdBy') === uid || (s.get('visibility') === 'space' && s.get('editPolicy') === 'members'))
    if (!editable) throw new HttpsError('permission-denied', 'cannot edit set')
    if (((s.get('questionIds') as string[] | undefined) ?? []).length + data.items.length > PROBLEM_SET_MAX_QUESTIONS) throw new HttpsError('failed-precondition', 'set full')
  }

  const batch = db.batch()
  const ids: string[] = []
  data.items.forEach((it, i) => {
    const e = entries[i]!
    const choice = it.choice && e.canChoice
    let r = drawProblem(e.template, newSeed(), choice)
    for (let n = 0; !r.ok && n < 5; n++) r = drawProblem(e.template, newSeed(), choice)
    if (!r.ok) return
    const q = spaceRef.collection('questions').doc()
    ids.push(q.id)
    batch.set(q, {
      type: choice ? 'single' : 'short',
      prompt: r.problem.prompt,
      choices: choice ? r.problem.choices : [],
      tags: [], subjectId: null, media: [],
      difficulty: e.difficulty, defaultPoints: 10,
      unit: { code: e.unit, custom: null }, variant: true,
      ...(e.copiedFrom ? { copiedFrom: { spaceId: data.spaceId, ...e.copiedFrom, spaceName: space.get('name') ?? '' } } : {}),
      createdBy: uid, sharing: share ? 'space' : 'private', answerVisibility: 'authors',
      rev: 1, deletedAt: null, createdAt: now, updatedAt: now,
    })
    batch.set(spaceRef.collection('questionKeys').doc(q.id), {
      answer: choice ? [r.problem.answerIndex] : [r.problem.answer],
      ignoreCase: true, ignoreSpaces: false,
      explanation: r.problem.explanation, rubric: '',
      tolerance: choice ? null : 0,
      template: e.template, hints: [],
      authorIds: [e.authorId ?? uid], answerVisibility: 'authors',
    })
  })
  if (!ids.length) throw new HttpsError('failed-precondition', 'draw failed')

  if (data.setId) {
    batch.update(setRef, { questionIds: FieldValue.arrayUnion(...ids), updatedAt: now })
  }
  else {
    const f = findUnit(data.unitCode)
    batch.set(setRef, {
      title: data.title, description: '', grade: f?.grade.grade ?? null,
      unit: data.unitCode && f ? { code: data.unitCode, custom: null } : null,
      questionIds: ids, visibility: share ? 'space' : 'private', editPolicy: 'owner', hintPenalty: 0,
      createdBy: uid, deletedAt: null, createdAt: now, updatedAt: now,
    })
  }
  await batch.commit()
  return { setId: setRef.id, added: ids.length }
})
