import { expect, test } from '@playwright/test'
import { signUp } from './helpers'

/** E2E 흐름 1: 가입 → 내 공간 → 개인 단어장 만들기 → 낱말카드 학습 → 오늘의 복습 */
test('sign up, create a personal deck, study flashcards, review', async ({ page }) => {
  const sid = await signUp(page, 'mina')

  await page.goto(`/s/${sid}/decks`)
  await page.getByRole('button', { name: '단어장 만들기' }).first().click()
  await page.locator('#deck-title').fill('여행 영어')
  await page.locator('button[form="deck-form"]').click()
  await page.waitForURL(/\/decks\/[^/]+$/)

  await page.getByRole('button', { name: '카드 추가' }).click()
  const words = [['apple', '사과'], ['book', '책'], ['cat', '고양이'], ['door', '문']]
  for (const [front, back] of words) {
    await page.locator('#card-front').fill(front!)
    await page.locator('#card-back').fill(back!)
    await page.locator('button[form="card-form"]').click()
    await expect(page.locator('#card-front')).toHaveValue('')
  }
  await page.keyboard.press('Escape')
  await expect(page.getByText('카드 4장')).toBeVisible()

  await page.getByRole('link', { name: '낱말카드' }).first().click()
  await page.waitForURL(/mode=flashcards/)
  for (let i = 0; i < words.length; i++) await page.getByRole('button', { name: '알아요' }).click()
  await expect(page.getByText('학습 완료')).toBeVisible()

  await page.goto(page.url().replace(/\/study\/([^?]+)\?.*$/, '/decks/$1'))
  await page.getByRole('link', { name: '복습', exact: true }).click()
  await page.waitForURL(/mode=review/)
  for (let i = 0; i < words.length; i++) {
    await page.getByRole('button', { name: '정답 보기' }).click()
    await page.getByRole('button', { name: /^알맞음/ }).click()
  }
  await expect(page.getByText('학습 완료')).toBeVisible()

  await page.goto(`/s/${sid}/review`)
  await expect(page.getByText('오늘 복습할 카드가 없어요.')).toBeVisible()
})
