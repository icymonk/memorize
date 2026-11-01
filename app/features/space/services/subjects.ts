import type { Firestore } from 'firebase/firestore'
import type { PropDef } from '#shared/schemas/collection'
import type { Subject } from './spaces'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'

/** WS-09: 워크스페이스 공통 과목 목록 (소유자·매니저) */
export function saveSubjects(db: Firestore, sid: string, subjects: Subject[]) {
  return updateDoc(doc(db, 'spaces', sid), { subjects, updatedAt: serverTimestamp() })
}

/** 학습일지 등의 "과목" 항목은 공통 과목 목록을 고를 수 있다 */
export function withSubjects(def: PropDef, subjects: Subject[]): PropDef {
  return def.key === 'subjects' && def.type === 'multiSelect' && subjects.length
    ? { ...def, options: [...new Set([...def.options, ...subjects.map(s => s.name)])] }
    : def
}
