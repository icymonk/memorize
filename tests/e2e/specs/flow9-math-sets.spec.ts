import { expect, test } from '@playwright/test'
import { workspaceWithMember } from './helpers'

/** 수학 M2(MATH-10~13): 교육과정 단원으로 공개 문제집 만들기 → 숫자 정답 문제 넣기 → 멤버가 문제집을 본다 */
test('a public problem set with a curriculum unit and a numeric question is visible to members', async ({ browser }) => {
  test.setTimeout(120_000)
  const { pa, pb, ws } = await workspaceWithMember(browser, 'dami', 'woo', '수학 반')

  await pa.goto(`/s/${ws}/settings`)
  await pa.getByRole('switch', { name: '테스트' }).click()
  await pa.getByRole('switch', { name: '수학' }).click()
  await pa.getByRole('button', { name: '저장' }).nth(1).click()
  await pa.getByRole('link', { name: '수학' }).first().click()
  await pa.waitForURL(/\/math$/)

  await pa.getByRole('button', { name: '문제집 만들기' }).click()
  const dlg = pa.getByRole('dialog')
  await dlg.locator('#set-title').fill('분수 연습')
  await dlg.locator('#set-grade').click()
  await pa.getByRole('option', { name: '초5' }).click()
  await dlg.getByRole('combobox', { name: '단원', exact: true }).click()
  await pa.getByRole('option', { name: '분수의 덧셈과 뺄셈' }).click()
  await dlg.locator('label', { hasText: '워크스페이스에 공개' }).getByRole('switch').click()
  await dlg.getByRole('button', { name: '확인' }).click()
  await pa.waitForURL(/\/math\/[^/]+$/)
  await expect(pa.getByText('초5 · 분수의 덧셈과 뺄셈')).toBeVisible()

  await pa.getByRole('button', { name: '새 문제' }).click()
  const q = pa.getByRole('dialog')
  await q.getByRole('button', { name: '단답형' }).click()
  await q.locator('#q-prompt').fill('$\\frac{1}{2}+\\frac{1}{4}$ 의 값은?')
  await q.locator('#q-accepted').fill('3/4')
  await q.locator('label', { hasText: '숫자로 채점' }).getByRole('switch').click()
  await expect(q.locator('label', { hasText: '워크스페이스에 공유' }).getByRole('switch')).toBeChecked()
  await q.getByRole('button', { name: '확인' }).click()
  await expect(pa.locator('ol li')).toHaveCount(1)
  await expect(pa.getByText('문제 · 1')).toBeVisible()
  await expect(pa.locator('ol .katex').first()).toBeVisible()

  await pb.goto(`/s/${ws}/math`)
  await pb.getByText('분수 연습').click()
  await pb.waitForURL(/\/math\/[^/]+$/)
  await expect(pb.locator('ol li')).toHaveCount(1)
  await expect(pb.getByRole('button', { name: '새 문제' })).toHaveCount(0)
})
