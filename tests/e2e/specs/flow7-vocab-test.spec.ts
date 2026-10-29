import { expect, test } from '@playwright/test'
import { workspaceWithMember } from './helpers'

/** 단어장 테스트(3-B5, VOC-25): 단어장 화면에서 시험 초안 만들기 → 열기 → 멤버가 응시·제출 */
test('a deck test is generated from the deck page and taken by a member', async ({ browser }) => {
  test.setTimeout(120_000)
  const { pa, pb, ws } = await workspaceWithMember(browser, 'yuna', 'joon', '영단어 모임')

  await pa.goto(`/s/${ws}/settings`)
  await pa.getByRole('switch', { name: '테스트' }).click()
  await pa.getByRole('button', { name: '저장' }).nth(1).click()
  await expect(pa.getByRole('link', { name: '테스트' }).first()).toBeVisible()

  await pa.goto(`/s/${ws}/decks`)
  await pa.getByRole('button', { name: '단어장 만들기' }).first().click()
  await pa.locator('#deck-title').fill('동물')
  await pa.locator('button[form="deck-form"]').click()
  await pa.waitForURL(/\/decks\/[^/]+$/)
  await pa.getByRole('button', { name: '카드 추가' }).click()
  for (const [front, back] of [['dog', '개'], ['cat', '고양이'], ['bird', '새']]) {
    await pa.locator('#card-front').fill(front!)
    await pa.locator('#card-back').fill(back!)
    await pa.locator('button[form="card-form"]').click()
    await expect(pa.locator('#card-front')).toHaveValue('')
  }
  await pa.keyboard.press('Escape')
  await expect(pa.getByText('카드 3장')).toBeVisible()

  await pa.getByRole('button', { name: '테스트', exact: true }).click()
  const dlg = pa.getByRole('dialog')
  await expect(dlg.getByText('단어장으로 시험 만들기')).toBeVisible()
  for (const k of ['뜻 → 단어 (객관식)', '단어 → 뜻 (객관식)', '단어 → 뜻 쓰기 (단답형)'])
    await dlg.locator('label', { hasText: k }).getByRole('switch').click()
  await expect(dlg.getByText('3문제를 만들어요')).toBeVisible()
  await dlg.getByRole('button', { name: '시험 만들기' }).click()
  await pa.waitForURL(/\/tests\/[^/]+$/)
  await expect(pa.locator('#t-title')).toHaveValue('동물 테스트')
  await pa.getByRole('button', { name: '시험 열기' }).click()
  await pa.getByRole('dialog').getByRole('button', { name: '확인' }).click()
  await expect(pa.getByText('진행 중').first()).toBeVisible()

  await pb.goto(`/s/${ws}/tests`)
  await pb.getByText('동물 테스트').click()
  await pb.waitForURL(/\/tests\/[^/]+$/)
  await pb.getByRole('link', { name: '응시 시작' }).click()
  await pb.getByRole('button', { name: '응시 시작' }).click()
  await expect(pb.getByText(/의 뜻은 ".+"이다\./)).toHaveCount(3)
  for (let i = 0; i < 3; i++) await pb.getByRole('button', { name: 'O', exact: true }).nth(i).click()
  await pb.getByRole('button', { name: '제출' }).click()
  await pb.getByRole('dialog').getByRole('button', { name: '확인' }).click()
  await expect(pb.getByText(/\d+ \/ 30점/)).toBeVisible()
})
