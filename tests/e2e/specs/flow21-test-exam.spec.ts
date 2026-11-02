import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { workspaceWithMember } from './helpers'

/** 3-I2: 시험 출제 → 응시 → 자동 채점 → 결과, 틀린 문제는 오답 노트에서 다시 풀기. 점수만 공개면 문제별 결과·오답 노트에 남지 않는다 */
test('a test is set, taken, auto-graded and its wrong answer retried from wrong notes', async ({ browser }) => {
  test.setTimeout(240_000)
  const { pa, pb, ws } = await workspaceWithMember(browser, 'sora', 'jun', '시험 반')

  await pa.goto(`/s/${ws}/settings`)
  await pa.getByRole('switch', { name: '테스트' }).click()
  await pa.getByRole('switch', { name: '오답 노트' }).click()
  await pa.getByRole('button', { name: '저장' }).nth(1).click()
  await expect(pa.getByRole('link', { name: '테스트' }).first()).toBeVisible()

  await pa.goto(`/s/${ws}/questions`)
  await pa.getByRole('button', { name: '문제 만들기' }).click()
  const q = pa.getByRole('dialog')
  await q.getByRole('button', { name: '단답형' }).click()
  await q.locator('#q-prompt').fill('2 + 3 = ?')
  await q.locator('#q-accepted').fill('5')
  await q.locator('label', { hasText: '워크스페이스에 공유' }).getByRole('switch').click()
  await q.getByRole('button', { name: '확인' }).click()
  await expect(q).toBeHidden()

  async function openTest(title: string, release?: string) {
    await pa.goto(`/s/${ws}/tests/new`)
    await pa.locator('#t-title').fill(title)
    await pa.getByRole('checkbox', { name: '2 + 3 = ?' }).check()
    if (release) await pa.getByRole('button', { name: release, exact: true }).click()
    await pa.getByRole('button', { name: '임시저장' }).click()
    await pa.waitForURL(/\/tests\/(?!new)[^/]+$/)
    await pa.getByRole('button', { name: '시험 열기' }).click()
    await pa.getByRole('dialog').getByRole('button', { name: '확인' }).click()
    await expect(pa.getByRole('button', { name: '마감하기' })).toBeVisible({ timeout: 30_000 })
  }
  async function take(p: Page, title: string, answer: string) {
    await p.goto(`/s/${ws}/tests`)
    await p.getByText(title, { exact: true }).click()
    await p.waitForURL(/\/tests\/[^/]+$/)
    await p.getByRole('link', { name: '응시 시작' }).click()
    await p.getByRole('button', { name: '응시 시작' }).click()
    await p.getByRole('textbox', { name: '2 + 3 = ?' }).fill(answer)
    await p.getByRole('button', { name: '제출' }).click()
    await p.getByRole('dialog').getByRole('button', { name: '확인' }).click()
  }

  await openTest('덧셈 시험')
  await take(pb, '덧셈 시험', '4')
  await expect(pb.getByText('0 / 10점')).toBeVisible()
  await expect(pb.getByText('0/10점')).toBeVisible()

  await pb.goto(`/s/${ws}/wrong-notes`)
  const note = pb.getByTestId('wrong-note')
  await expect(note).toHaveCount(1)
  await expect(note).toContainText('2 + 3 = ?')
  await expect(note).toContainText('덧셈 시험')
  await pb.getByRole('button', { name: '전부 다시 풀기' }).click()
  await pb.waitForURL(/\/wrong-notes\/retry/)
  await expect(pb.getByTestId('retry-prompt')).toHaveText('2 + 3 = ?')
  await pb.getByRole('textbox', { name: '답을 입력하세요' }).fill('5')
  await pb.getByRole('button', { name: '채점' }).click()
  await expect(pb.getByText('맞았어요!')).toBeVisible()

  await openTest('점수만 시험', '점수만')
  await take(pb, '점수만 시험', '4')
  await expect(pb.getByText('0 / 10점')).toBeVisible()
  await expect(pb.getByText('0/10점')).toHaveCount(0)
  await pb.getByRole('button', { name: '시험으로' }).click()
  await expect(pb.getByText('0/10점')).toBeVisible()
  await pb.goto(`/s/${ws}/wrong-notes`)
  await expect(note).toHaveCount(1)
  await expect(note).not.toContainText('점수만 시험')
})
