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

  // 2-E1: 미션 만들기 → 상세 → 조기 종료
  const ws = new URL(page.url()).pathname.split('/')[2]
  await page.goto(`/s/${ws}/missions`)
  await page.getByRole('button', { name: '미션 만들기' }).click()
  await page.locator('#mis-title').fill('매일 영어 일기')
  await page.getByLabel('나도 참여').check()
  await page.locator('button[form="mission-form"]').click()
  await page.waitForURL(/\/missions\/[^/]+$/)
  await expect(page.getByRole('heading', { name: '매일 영어 일기' })).toBeVisible()
  await page.getByRole('button', { name: '조기 종료' }).click()
  await page.getByRole('button', { name: '확인', exact: true }).click()
  await expect(page.getByRole('button', { name: '다시 열기' })).toBeVisible()
  await page.goto(`/s/${ws}/missions`)
  await page.getByRole('tab', { name: /완료/ }).click()
  await expect(page.getByText('매일 영어 일기')).toBeVisible()
})
