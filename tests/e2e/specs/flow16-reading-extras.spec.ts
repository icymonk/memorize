import { expect, test } from '@playwright/test'
import { signUp } from './helpers'

/** 3-D3: 독서 타이머로 시간 넣기, 연간 목표 저장 (READ-22·51) */
test('reading timer fills minutes and the yearly goal is saved', async ({ page }) => {
  const sid = await signUp(page, 'jun')
  await page.goto(`/s/${sid}/reading`)
  await page.getByRole('button', { name: '책 담기' }).click()
  await page.locator('#book-title').fill('테스트 책')
  await page.locator('#book-authors').fill('한강')
  await page.locator('button[form="book-form"]').click()
  await page.getByRole('button', { name: /테스트 책/ }).first().click()

  const timer = page.getByTestId('reading-timer')
  await timer.getByRole('button', { name: '타이머 시작' }).click()
  await expect(timer).toContainText('00:01')
  await timer.getByRole('button', { name: '정지' }).click()
  await expect(page.getByLabel('읽은 시간(분)')).toHaveValue('1')
  await expect(timer.getByRole('button', { name: '초기화' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('tab', { name: '통계' }).click()
  const goal = page.getByTestId('reading-goal')
  await goal.getByRole('button', { name: '목표 정하기' }).click()
  await goal.getByLabel('목표 권수').fill('10')
  await goal.getByRole('button', { name: '저장' }).click()
  await expect(goal).toContainText(/년 목표 10권/)
  await expect(goal).toContainText('0권 읽음 · 0%')
  await page.reload()
  await page.getByRole('tab', { name: '통계' }).click()
  await expect(page.getByTestId('reading-goal')).toContainText(/년 목표 10권/)
})
