import { describe, expect, it } from 'vitest'
import { createWorkspaceInput, DEFAULT_WORKSPACE_MODULES } from './space'

describe('createWorkspaceInput', () => {
  it('fills defaults and trims', () => {
    const parsed = createWorkspaceInput.parse({ name: '  영어 스터디 ', icon: '📚', color: 'blue' })
    expect(parsed).toEqual({ name: '영어 스터디', icon: '📚', color: 'blue', description: '', modules: DEFAULT_WORKSPACE_MODULES })
  })

  it('rejects empty name, unknown color and unknown module', () => {
    expect(createWorkspaceInput.safeParse({ name: ' ', icon: '📚', color: 'blue' }).success).toBe(false)
    expect(createWorkspaceInput.safeParse({ name: 'a', icon: '📚', color: 'black' }).success).toBe(false)
    expect(createWorkspaceInput.safeParse({ name: 'a', icon: '📚', color: 'blue', modules: { vocab: true } }).success).toBe(false)
  })
})
