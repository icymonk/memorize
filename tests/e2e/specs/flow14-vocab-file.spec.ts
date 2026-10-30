import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { signUp } from './helpers'

/** 3-D1: CSV 파일로 카드 가져오기 → CSV 내보내기 → 받아쓰기 (VOC-12·24) */
test('import cards from CSV, export them, and take dictation', async ({ page }) => {
  const sid = await signUp(page, 'jun')
  await page.goto(`/s/${sid}/decks`)
  await page.getByRole('button', { name: '단어장 만들기' }).first().click()
  await page.locator('#deck-title').fill('파일 단어장')
  await page.locator('button[form="deck-form"]').click()
  await page.waitForURL(/\/decks\/[^/]+$/)

  await page.getByRole('button', { name: '붙여넣기로 추가' }).click()
  await page.getByTestId('cards-file').setInputFiles({ name: 'words.csv', mimeType: 'text/csv', buffer: Buffer.from('front,back\napple,"사과; 능금"\nbook,책\n') })
  await page.getByRole('button', { name: '2장 추가' }).click()
  await expect(page.getByText('카드 2장')).toBeVisible()

  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV 내보내기' }).click()])
  expect(dl.suggestedFilename()).toBe('파일 단어장.csv')
  const csv = readFileSync((await dl.path())!, 'utf8')
  expect(csv).toContain('apple,사과; 능금')
  expect(csv).toContain('book,책')

  await page.getByRole('link', { name: '받아쓰기' }).first().click()
  await page.waitForURL(/mode=dictation/)
  await expect(page.getByText('발음을 듣고 단어를 쓰세요')).toBeVisible()
  await expect(page.getByRole('button', { name: '다시 듣기' })).toBeVisible()
  await page.getByPlaceholder('단어 입력 후 Enter').fill('apple')
  await page.getByRole('button', { name: '확인' }).click()
  await expect(page.getByText(/사과, 능금|책/).first()).toBeVisible()
})
