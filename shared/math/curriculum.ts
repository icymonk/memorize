import kr2022 from './curricula/kr-2022.json'

/** MATH-13 교육과정 기준 목록: 학년 → 영역 → 단원 → 세부 개념. 단원 이름은 교과서마다 조금씩 달라 자유 입력도 함께 쓴다 */
export interface Concept { code: string, name: string }
export interface CurriculumUnit extends Concept { children: Concept[] }
export interface CurriculumGrade { grade: string, name: string, areas: { name: string, units: CurriculumUnit[] }[] }
export interface Curriculum { id: string, name: string, grades: CurriculumGrade[] }

export const CURRICULUM: Curriculum = kr2022
export const GRADES = CURRICULUM.grades.map(g => ({ value: g.grade, label: g.name }))

const byCode = new Map<string, { grade: CurriculumGrade, unit: CurriculumUnit, concept?: Concept }>()
for (const grade of CURRICULUM.grades) {
  for (const a of grade.areas) {
    for (const unit of a.units) {
      byCode.set(unit.code, { grade, unit })
      for (const c of unit.children) byCode.set(c.code, { grade, unit, concept: c })
    }
  }
}

export const findUnit = (code: string | null | undefined) => (code ? byCode.get(code) : undefined)
export const gradeName = (grade: string | null | undefined) => CURRICULUM.grades.find(g => g.grade === grade)?.name ?? grade ?? ''

/** 화면용 "중1 · 일차방정식 · 등식의 성질" (자유 입력이면 그 글자) */
export function unitLabel(unit: { code: string | null, custom: string | null } | null | undefined): string {
  if (!unit) return ''
  const f = findUnit(unit.code)
  if (f) return [f.grade.name, f.unit.name, f.concept?.name].filter(Boolean).join(' · ')
  return unit.custom ?? ''
}
