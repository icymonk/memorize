import type { SpaceColor } from '#shared/schemas/space'

/** 공간 색상 → 배경 클래스 (Tailwind가 찾을 수 있게 문자열 그대로 둔다) */
export const SPACE_COLOR_CLASS: Record<SpaceColor, string> = {
  slate: 'bg-slate-200 dark:bg-slate-700',
  red: 'bg-red-200 dark:bg-red-800',
  orange: 'bg-orange-200 dark:bg-orange-800',
  amber: 'bg-amber-200 dark:bg-amber-800',
  green: 'bg-green-200 dark:bg-green-800',
  teal: 'bg-teal-200 dark:bg-teal-800',
  blue: 'bg-blue-200 dark:bg-blue-800',
  violet: 'bg-violet-200 dark:bg-violet-800',
  pink: 'bg-pink-200 dark:bg-pink-800',
}

export const SPACE_ICONS = ['📚', '✏️', '🧠', '🌍', '🔤', '📖', '🧮', '🎓', '👨‍👩‍👧', '🏫', '🚀', '⭐']
