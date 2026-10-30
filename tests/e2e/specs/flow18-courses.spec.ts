import { expect, test } from '@playwright/test'
import { workspaceWithMember } from './helpers'

/** 3-F1(CRS-01~03·10): 코스 만들기 → 레슨 두 개 추가 → 순서 바꾸기 → 본문 쓰기 → 멤버가 본문을 본다 */
test('an author builds a course with ordered lessons and a member reads the lesson body', async ({ browser }) => {
  test.setTimeout(120_000)
  const { pa, pb, ws } = await workspaceWithMember(browser, 'sora', 'jin', '영어 반')

  await pa.goto(`/s/${ws}/settings`)
  await pa.getByRole('switch', { name: '강의자료' }).click()
  await pa.getByRole('button', { name: '저장' }).nth(1).click()
  await pa.getByRole('link', { name: '강의자료' }).first().click()
  await pa.waitForURL(/\/courses$/)

  await pa.getByRole('button', { name: '코스 만들기' }).click()
  const dlg = pa.getByRole('dialog')
  await dlg.locator('#course-title').fill('영문법 기초')
  await dlg.locator('#course-level').fill('입문')
  await dlg.getByRole('button', { name: '확인' }).click()
  await pa.waitForURL(/\/courses\/[^/]+$/)
  await expect(pa.getByRole('heading', { name: '영문법 기초' })).toBeVisible()

  const input = pa.getByRole('textbox', { name: '새 레슨 제목' })
  await input.fill('be동사')
  await pa.getByRole('button', { name: '레슨 추가' }).click()
  await expect(pa.getByTestId('lesson-list')).toContainText('be동사')
  await input.fill('일반동사')
  await pa.getByRole('button', { name: '레슨 추가' }).click()
  await expect(pa.getByTestId('lesson-list').locator('li').nth(1)).toContainText('일반동사')

  await pa.getByRole('button', { name: '일반동사 위로' }).click()
  await expect(pa.getByTestId('lesson-list').locator('li').first()).toContainText('일반동사')
  const courseUrl = pa.url()

  await pa.getByRole('link', { name: 'be동사' }).click()
  await pa.waitForURL(/\/courses\/[^/]+\/[^/]+$/)
  await pa.locator('.ProseMirror').click()
  await pa.keyboard.type('am, are, is를 배워요')
  await expect(pa.getByText('저장됨')).toBeVisible()
  await expect(pa.getByRole('link', { name: '이전 레슨' })).toBeVisible()

  await pb.goto(courseUrl)
  await expect(pb.getByTestId('lesson-list').locator('li').first()).toContainText('일반동사')
  await expect(pb.getByRole('button', { name: '레슨 추가' })).toHaveCount(0)
  await pb.getByRole('link', { name: 'be동사' }).click()
  await expect(pb.locator('.ProseMirror')).toContainText('am, are, is를 배워요')
})
