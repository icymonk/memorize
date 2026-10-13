import { expect, test } from '@playwright/test'
import { signUp } from './helpers'

/** E2E 흐름 3: 내 공간 단어장 → 워크스페이스로 복사 */
test('copy a personal deck into a workspace', async ({ page }) => {
  const sid = await signUp(page, 'jun')

  await page.getByRole('button', { name: /내 공간/ }).first().click()
  await page.getByRole('menuitem', { name: '워크스페이스 만들기' }).click()
  await page.locator('#ws-name').fill('주말 스터디')
  await page.locator('button[form="create-workspace"]').click()
  await page.waitForURL(url => !url.pathname.startsWith(`/s/${sid}`) && /\/s\/[^/]+/.test(url.pathname))

  await page.goto(`/s/${sid}/decks`)
  await page.getByRole('button', { name: '단어장 만들기' }).first().click()
  await page.locator('#deck-title').fill('동사 모음')
  await page.locator('button[form="deck-form"]').click()
  await page.waitForURL(/\/decks\/[^/]+$/)
  await page.getByRole('button', { name: '카드 추가' }).click()
  await page.locator('#card-front').fill('run')
  await page.locator('#card-back').fill('달리다')
  await page.locator('button[form="card-form"]').click()
  await expect(page.locator('#card-front')).toHaveValue('')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: '복사', exact: true }).click()
  await page.getByRole('radio', { name: /주말 스터디/ }).click()
  await page.getByRole('button', { name: '복사하기' }).click()
  await page.waitForURL(url => !url.pathname.startsWith(`/s/${sid}`) && /\/decks\/[^/]+$/.test(url.pathname))
  await expect(page.getByText('내 공간에서 복사함')).toBeVisible()
  await expect(page.getByText('run')).toBeVisible()
})
