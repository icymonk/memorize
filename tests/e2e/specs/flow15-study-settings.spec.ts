import { expect, test } from '@playwright/test'
import { signUp } from './helpers'

/** 3-D2: 학습 설정(하루 새 카드·복습 상한, 낱말카드 처음 면)을 저장하면 다시 열어도 남는다 (ACC-24) */
test('study settings are saved to the account', async ({ page }) => {
  await signUp(page, 'jun')
  await page.goto('/settings')
  const box = page.getByTestId('study-settings')
  await expect(box.locator('#study-new')).toBeEnabled()
  await box.locator('#study-new').fill('3')
  await box.locator('#study-review').fill('40')
  await box.locator('#study-front').selectOption('back')
  await box.getByRole('button', { name: '학습 설정 저장' }).click()
  await expect(box.getByText('저장됨')).toBeVisible({ timeout: 20000 })
  await page.reload()
  await expect(box.locator('#study-new')).toHaveValue('3')
  await expect(box.locator('#study-review')).toHaveValue('40')
  await expect(box.locator('#study-front')).toHaveValue('back')
})
