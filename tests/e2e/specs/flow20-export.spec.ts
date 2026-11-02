import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { signUp } from './helpers'

/** E2E 흐름 20: 일지 페이지를 마크다운·인쇄 화면으로 내보내고(NOTE-70), 내 일지 모아 보기에서 기간을 골라 묶어 받는다(NOTE-71) */
test('a page and a range of journals export to markdown and a print view', async ({ page: pa }) => {
  test.setTimeout(180_000)
  const sid = await signUp(pa, 'nara')
  await pa.goto(`/s/${sid}/journal`)
  await pa.waitForURL(/\/collections\/journal/)
  await pa.getByRole('button', { name: '새 페이지' }).click()
  await pa.waitForURL(/\/notes\/[^/]+$/)
  await pa.getByPlaceholder('제목 없음').fill('내보내기 일지')
  await pa.locator('.ProseMirror').click()
  await pa.keyboard.type('오늘 배운 것')
  await expect(pa.getByText('저장됨')).toBeVisible()

  await pa.getByRole('button', { name: '내보내기', exact: true }).click()
  const dl = pa.waitForEvent('download')
  await pa.getByRole('menuitem', { name: '마크다운으로 내려받기' }).click()
  const md = await readFile((await (await dl).path())!, 'utf8')
  expect(md).toContain('내보내기 일지')
  expect(md).toContain('오늘 배운 것')

  await pa.getByRole('button', { name: '내보내기', exact: true }).click()
  const popupEvent = pa.waitForEvent('popup')
  await pa.getByRole('menuitem', { name: 'PDF로 저장(인쇄)' }).click()
  const popup = await popupEvent
  await expect(popup.getByTestId('print-page')).toContainText('오늘 배운 것')
  await expect(popup.getByRole('heading', { name: /내보내기 일지/ })).toBeVisible()
  await popup.close()

  await pa.goto('/journal')
  const bundle = pa.getByTestId('journal-bundle')
  await expect(bundle).toContainText('일지 1개')
  const dl2 = pa.waitForEvent('download')
  await bundle.getByRole('button', { name: '마크다운으로 내려받기' }).click()
  const file = await dl2
  expect(file.suggestedFilename()).toMatch(/^학습일지-\d{4}-\d{2}-\d{2}~\d{4}-\d{2}-\d{2}\.md$/)
  expect(await readFile((await file.path())!, 'utf8')).toContain('오늘 배운 것')

  await bundle.getByLabel('시작일').fill('2000-01-01')
  await bundle.getByLabel('종료일').fill('2000-01-31')
  await expect(bundle).toContainText('일지 0개')
  await expect(bundle.getByRole('button', { name: 'PDF로 저장(인쇄)' })).toBeDisabled()
})
