/** READ-22 독서 타이머: 시작/정지로 시간을 모은다. 책마다 이 기기에 남아 창을 닫아도 이어진다 */
interface TimerState { startedAt: number | null, acc: number }
const empty = (): TimerState => ({ startedAt: null, acc: 0 })

export function useReadingTimer(key: () => string) {
  const now = ref(Date.now())
  const state = ref<TimerState>(empty())
  let tick: ReturnType<typeof setInterval> | undefined
  const storageKey = () => `reading-timer:${key()}`
  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(storageKey()) ?? '') as TimerState
      state.value = typeof v?.acc === 'number' ? { startedAt: typeof v.startedAt === 'number' ? v.startedAt : null, acc: v.acc } : empty()
    }
    catch {
      state.value = empty()
    }
  }
  function persist() {
    if (state.value.startedAt == null && !state.value.acc) localStorage.removeItem(storageKey())
    else localStorage.setItem(storageKey(), JSON.stringify(state.value))
  }
  const running = computed(() => state.value.startedAt != null)
  const elapsed = computed(() => state.value.acc + (state.value.startedAt != null ? Math.max(0, now.value - state.value.startedAt) : 0))
  const minutes = computed(() => Math.min(1440, Math.round(elapsed.value / 60000)))
  function start() {
    now.value = Date.now()
    state.value = { ...state.value, startedAt: now.value }
    persist()
  }
  function stop() {
    if (state.value.startedAt == null) return
    state.value = { startedAt: null, acc: state.value.acc + Date.now() - state.value.startedAt }
    persist()
  }
  function reset() {
    state.value = empty()
    persist()
  }
  onMounted(() => { tick = setInterval(() => (now.value = Date.now()), 1000) })
  onBeforeUnmount(() => clearInterval(tick))
  return { load, running, elapsed, minutes, start, stop, reset }
}

export function clock(ms: number) {
  const s = Math.floor(ms / 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const h = Math.floor(s / 3600)
  return `${h ? `${h}:` : ''}${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}
