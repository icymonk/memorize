import { expect, test } from '@playwright/test'
import { signUp } from './helpers'

/** 3-H3: 내 데이터 내려받기(ACC-40) → 회원 탈퇴(ACC-41) */
test('download my data, then delete the account', async ({ page }) => {
  await signUp(page, 'zoe')
  await page.goto('/settings')
  const data = page.getByTestId('my-data')
  const download = page.waitForEvent('download')
  await data.getByRole('button', { name: '내 데이터 내려받기' }).click()
  expect((await download).suggestedFilename()).toMatch(/^memorize-data-\d{4}-\d{2}-\d{2}\.json$/)

  const box = page.getByTestId('delete-account')
  const button = box.getByRole('button', { name: '탈퇴하기' })
  await expect(button).toBeDisabled()
  await box.locator('#delete-confirm').fill('탈퇴')
  await button.click()
  await expect(page).toHaveURL(/\/login/, { timeout: 30000 })
})
