/** VOC-31 이어하기: 기기에 진행 상황을 남겨 두었다가 다시 들어오면 이어서 */
export function useStudyResume<T>(key: string) {
  const storageKey = `memorize.study.${key}`
  function load(): T | null {
    try {
      const raw = localStorage.getItem(storageKey)
      return raw ? JSON.parse(raw) as T : null
    }
    catch {
      return null
    }
  }
  const save = (v: T) => localStorage.setItem(storageKey, JSON.stringify(v))
  const clear = () => localStorage.removeItem(storageKey)
  return { load, save, clear }
}
