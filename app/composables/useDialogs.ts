/** 브라우저 기본 confirm/prompt 대신 앱 안의 확인·입력 창 (AppDialogs.vue가 하나만 그린다) */
interface DialogState {
  open: boolean
  kind: 'confirm' | 'prompt'
  title: string
  value: string
  destructive: boolean
  resolve?: (v: boolean | string | null) => void
}

const state = reactive<DialogState>({ open: false, kind: 'confirm', title: '', value: '', destructive: false })

export const useDialogState = () => state

function show(kind: DialogState['kind'], title: string, value: string, destructive: boolean) {
  const prev = state.resolve
  state.resolve = undefined
  prev?.(kind === 'confirm' ? false : null)
  return new Promise<boolean | string | null>((resolve) => {
    Object.assign(state, { open: true, kind, title, value, destructive, resolve })
  })
}

export function confirmDialog(title: string, opts: { destructive?: boolean } = {}) {
  return show('confirm', title, '', opts.destructive ?? true) as Promise<boolean>
}

export function promptDialog(title: string, value = '') {
  return show('prompt', title, value, false) as Promise<string | null>
}
