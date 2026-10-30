import type { StudySettings } from '#shared/study-settings'
import { DEFAULT_STUDY, readStudySettings } from '#shared/study-settings'
import { doc, getDoc } from 'firebase/firestore'

/** ACC-24 내 학습 설정. 한 번 읽고 앱 안에서 같이 쓴다 (설정 화면에서 저장하면 set으로 바꾼다) */
export function useStudySettings() {
  const state = useState<StudySettings | null>('study-settings', () => null)
  const auth = useAuthStore()
  const { $firestore } = useNuxtApp()
  async function load(): Promise<StudySettings> {
    if (state.value) return state.value
    const uid = auth.user?.uid
    if (!uid) return DEFAULT_STUDY
    const snap = await getDoc(doc($firestore, 'users', uid)).catch(() => null)
    state.value = readStudySettings(snap?.get('study'))
    return state.value
  }
  const set = (s: StudySettings) => (state.value = s)
  return { load, set }
}
