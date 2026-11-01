/** 학습 모드 공용 로직 (VOC-20~23) */
export const STUDY_MODES = ['flashcards', 'learn', 'write', 'dictation', 'match', 'review'] as const
export type StudyMode = (typeof STUDY_MODES)[number]

export function normalizeAnswer(s: string): string {
  return s.normalize('NFC').trim().toLowerCase().replace(/[.,!?'"’“”]/g, '').replace(/\s+/g, ' ')
}

export function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j]!
      prev[j] = Math.min(up + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = up
    }
  }
  return prev[b.length]!
}

/** VOC-22 작은 오타 허용: 3자 이하는 0, 8자 이하는 1, 그보다 길면 2글자까지 */
export function typoAllowance(length: number): number {
  return length <= 3 ? 0 : length <= 8 ? 1 : 2
}

export type Grade = 'exact' | 'typo' | 'wrong'

export function gradeAnswer(input: string, answers: string[]): Grade {
  const given = normalizeAnswer(input)
  if (!given) return 'wrong'
  let best: Grade = 'wrong'
  for (const answer of answers.map(normalizeAnswer)) {
    if (answer === given) return 'exact'
    if (editDistance(answer, given) <= typoAllowance(answer.length)) best = 'typo'
  }
  return best
}

export function shuffle<T>(items: readonly T[], rand: () => number = Math.random): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

/** VOC-21 객관식 보기: 정답 + 겹치지 않는 오답, 섞어서 최대 n개 */
export function makeChoices(correct: string, pool: readonly string[], n = 4, rand: () => number = Math.random): string[] {
  const others = shuffle([...new Set(pool.filter(p => normalizeAnswer(p) !== normalizeAnswer(correct)))], rand).slice(0, n - 1)
  return shuffle([correct, ...others], rand)
}

/** VOC-21 학습하기: 객관식을 맞히면 주관식으로, 주관식을 맞히면 끝. 틀리면 그 단계를 다음 라운드에 다시 */
export type LearnStage = 'choice' | 'written' | 'done'
export function nextLearnStage(stage: LearnStage, correct: boolean): LearnStage {
  if (!correct) return stage
  return stage === 'choice' ? 'written' : 'done'
}

export interface LearnItem { id: string, stage: LearnStage }
export const LEARN_ROUND_SIZE = 7
export function nextRound(items: readonly LearnItem[], size = LEARN_ROUND_SIZE): string[] {
  return items.filter(i => i.stage !== 'done').slice(0, size).map(i => i.id)
}

/** VOC-23 매칭: 6~12쌍 */
export const MATCH_PAIRS = { min: 6, max: 12, default: 6 } as const

/** VOC-23 순위: 한 사람당 최고 기록 하나, 빠른 순 상위 10명 */
export interface MatchEntry { uid: string, ms: number, at: number }
export const MATCH_TOP_SIZE = 10
export function mergeMatchTop(entries: readonly MatchEntry[], entry: MatchEntry): MatchEntry[] {
  const best = new Map<string, MatchEntry>()
  for (const e of [...entries, entry]) {
    const prev = best.get(e.uid)
    if (!prev || e.ms < prev.ms) best.set(e.uid, e)
  }
  return [...best.values()].sort((a, b) => a.ms - b.ms || a.at - b.at).slice(0, MATCH_TOP_SIZE)
}
