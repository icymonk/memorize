import { expect, test } from '@playwright/test'
import { workspaceWithMember } from './helpers'

/** 수학 M1(MATH-01·02): 수학 메뉴 → 수식 키보드로 넣기 → 문제 지문의 `$…$`가 시험·문제 은행에서 수식으로 보인다 */
test('math module renders formulas typed with the formula input', async ({ browser }) => {
  test.setTimeout(120_000)
  const { pa, pb, ws } = await workspaceWithMember(browser, 'sora', 'jin', '수학 스터디')

  await pa.goto(`/s/${ws}/settings`)
  await pa.getByRole('switch', { name: '테스트' }).click()
  await pa.getByRole('switch', { name: '수학' }).click()
  await pa.getByRole('button', { name: '저장' }).nth(1).click()
  await pa.getByRole('link', { name: '수학' }).first().click()
  await pa.waitForURL(/\/math$/)

  await pa.getByRole('button', { name: '수식 키보드로 넣기' }).click()
  const dlg = pa.getByRole('dialog')
  await expect(dlg.locator('math-field')).toBeVisible()
  await dlg.locator('#math-latex').fill('\\frac{1}{2}+x^2')
  await expect(dlg.locator('.katex').first()).toBeVisible()
  await dlg.getByRole('button', { name: '넣기' }).click()
  await expect(pa.getByRole('textbox', { name: '수식 미리보기' })).toHaveValue('$\\frac{1}{2}+x^2$')
  await expect(pa.getByTestId('math-preview').locator('.katex')).toBeVisible()

  await pa.getByRole('link', { name: '문제 은행에서 문제 만들기' }).click()
  await pa.waitForURL(/\/questions$/)
  await pa.getByRole('button', { name: '문제 만들기' }).click()
  await pa.getByRole('dialog').getByRole('button', { name: 'OX' }).click()
  await pa.locator('#q-prompt').fill('$\\sqrt{4}=2$ 이다')
  await expect(pa.getByTestId('prompt-preview').locator('.katex')).toBeVisible()
  await pa.getByRole('dialog').getByRole('button', { name: '확인' }).click()
  await expect(pa.getByRole('dialog')).toBeHidden()
  await expect(pa.locator('main .katex').first()).toBeVisible()

  await pa.goto(`/s/${ws}/tests/new`)
  await pa.locator('#t-title').fill('루트 확인')
  await pa.getByRole('checkbox', { name: '$\\sqrt{4}=2$ 이다' }).check()
  await pa.getByRole('button', { name: '임시저장' }).click()
  await pa.waitForURL(/\/tests\/(?!new)[^/]+$/)
  await pa.getByRole('button', { name: '시험 열기' }).click()
  await pa.getByRole('dialog').getByRole('button', { name: '확인' }).click()
  await expect(pa.getByText('진행 중').first()).toBeVisible()

  await pb.goto(`/s/${ws}/tests`)
  await pb.getByText('루트 확인').click()
  await pb.waitForURL(/\/tests\/[^/]+$/)
  await pb.getByRole('link', { name: '응시 시작' }).click()
  await pb.getByRole('button', { name: '응시 시작' }).click()
  await expect(pb.locator('ol .katex').first()).toBeVisible()
  await expect(pb.getByText('이다')).toBeVisible()
})
