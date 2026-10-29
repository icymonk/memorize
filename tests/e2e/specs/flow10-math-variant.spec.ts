import { expect, test } from '@playwright/test'
import { workspaceWithMember } from './helpers'

/** 수학 M3(MATH-14): 자주 쓰는 형식으로 변형 문제를 만들고, 미리보기 숫자를 바꿔 본 뒤 문제집에 넣는다 */
test('a variant question made from a preset previews new numbers and joins the set', async ({ browser }) => {
  test.setTimeout(120_000)
  const { pa, ws } = await workspaceWithMember(browser, 'mina', 'joon', '변형 반')

  await pa.goto(`/s/${ws}/settings`)
  await pa.getByRole('switch', { name: '테스트' }).click()
  await pa.getByRole('switch', { name: '수학' }).click()
  await pa.getByRole('button', { name: '저장' }).nth(1).click()
  await pa.getByRole('link', { name: '수학' }).first().click()
  await pa.waitForURL(/\/math$/)
  await pa.getByRole('button', { name: '문제집 만들기' }).click()
  await pa.getByRole('dialog').locator('#set-title').fill('방정식 연습')
  await pa.getByRole('dialog').getByRole('button', { name: '확인' }).click()
  await pa.waitForURL(/\/math\/[^/]+$/)

  await pa.getByRole('button', { name: '변형 문제' }).click()
  const dlg = pa.getByRole('dialog')
  await dlg.locator('#v-preset').click()
  await pa.getByRole('option', { name: '일차방정식 ax + b = c' }).click()
  const samples = dlg.getByTestId('variant-sample')
  await expect(samples).toHaveCount(5)
  await expect(samples.first().locator('.katex').first()).toBeVisible()
  const before = await samples.allInnerTexts()
  await dlg.getByRole('button', { name: '다른 숫자로' }).click()
  await expect.poll(() => samples.allInnerTexts()).not.toEqual(before)

  await dlg.locator('#v-answer').fill('r +')
  await expect(dlg.getByText('정답 식: 식을 읽을 수 없어요')).toBeVisible()
  await expect(dlg.getByRole('button', { name: '확인' })).toBeDisabled()
  await dlg.locator('#v-answer').fill('r')

  await dlg.getByRole('button', { name: '객관식' }).click()
  await expect(samples.first().locator('li')).toHaveCount(4)
  await dlg.getByRole('button', { name: '확인' }).click()
  await expect(pa.locator('ol > li')).toHaveCount(1)
  await expect(pa.locator('ol > li').getByText('변형')).toBeVisible()
  await expect(pa.locator('ol > li').getByText('객관식')).toBeVisible()
})
