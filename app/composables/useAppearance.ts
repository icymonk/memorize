/** ACC-23 화면 설정: 테마와 글자 크기. 이 기기(localStorage)에만 저장한다 */
export type Theme = 'system' | 'light' | 'dark'
export type FontSize = 'sm' | 'md' | 'lg'

const KEY = 'memorize:appearance'
const FONT_PX: Record<FontSize, string> = { sm: '14px', md: '16px', lg: '18px' }
const state = ref<{ theme: Theme, fontSize: FontSize }>({ theme: 'system', fontSize: 'md' })
let started = false

export function useAppearance() {
  if (import.meta.client && !started) {
    started = true
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
      if (['system', 'light', 'dark'].includes(saved.theme)) state.value.theme = saved.theme
      if (saved.fontSize in FONT_PX) state.value.fontSize = saved.fontSize
    }
    catch {}
    const dark = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const { theme, fontSize } = state.value
      document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && dark.matches))
      document.documentElement.style.fontSize = FONT_PX[fontSize]
      localStorage.setItem(KEY, JSON.stringify(state.value))
    }
    dark.addEventListener('change', apply)
    watch(state, apply, { deep: true, immediate: true })
  }
  return state
}
