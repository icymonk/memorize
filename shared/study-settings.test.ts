import { describe, expect, it } from 'vitest'
import { DEFAULT_STUDY, readStudySettings } from './study-settings'

describe('study settings (ACC-24)', () => {
  it('falls back to defaults per field', () => {
    expect(readStudySettings(undefined)).toEqual(DEFAULT_STUDY)
    expect(readStudySettings({ dailyNewCards: 5, dailyReviewCards: 3, flashcardFront: 'back' })).toEqual({ ...DEFAULT_STUDY, dailyNewCards: 5, flashcardFront: 'back' })
    expect(readStudySettings({ dailyNewCards: 1.5, flashcardFront: 'side' })).toEqual(DEFAULT_STUDY)
  })
})
