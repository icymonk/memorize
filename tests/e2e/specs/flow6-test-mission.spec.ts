import { expect, test } from '@playwright/test'
import { workspaceWithMember } from './helpers'

/** 시험 미션(3-B4, TST-19·MIS-16): 진행자가 "미션으로도 배정"한 시험을 열고 → 멤버의 미션이 응시 전엔 미완, 제출하면 자동 완료 */
test('a test assigned as a mission completes when the member submits it', async ({ browser }) => {
  test.setTimeout(120_000)
  const { pa, pb, ws } = await workspaceWithMember(browser, 'hana', 'min', '시험 스터디')

  await pa.goto(`/s/${ws}/settings`)
  await pa.getByRole('switch', { name: '테스트' }).click()
  await pa.getByRole('button', { name: '저장' }).nth(1).click()
  await expect(pa.getByRole('link', { name: '테스트' }).first()).toBeVisible()

  await pa.goto(`/s/${ws}/questions`)
  await pa.getByRole('button', { name: '문제 만들기' }).click()
  await pa.getByRole('dialog').getByRole('button', { name: 'OX' }).click()
  await pa.locator('#q-prompt').fill('지구는 둥글다')
  await pa.getByRole('dialog').getByRole('button', { name: '확인' }).click()
  await expect(pa.getByRole('dialog')).toBeHidden()

  await pa.goto(`/s/${ws}/tests/new`)
  await pa.locator('#t-title').fill('1단원 확인')
  await pa.getByRole('checkbox', { name: '지구는 둥글다' }).check()
  await pa.locator('label', { hasText: '미션으로도 배정' }).getByRole('switch').click()
  await pa.getByRole('button', { name: '임시저장' }).click()
  await pa.waitForURL(/\/tests\/(?!new)[^/]+$/)
  await pa.getByRole('button', { name: '시험 열기' }).click()
  await pa.getByRole('dialog').getByRole('button', { name: '확인' }).click()
  await expect(pa.getByRole('link', { name: '연결된 미션 보기' })).toBeVisible()

  await pb.goto(`/s/${ws}/missions`)
  await pb.getByText('1단원 확인').click()
  await pb.waitForURL(/\/missions\/[^/]+$/)
  await expect(pb.getByText('시험에 응시하면 자동으로 완료돼요.')).toBeVisible()
  await expect(pb.getByText('미완')).toBeVisible()
  await pb.getByRole('link', { name: '시험 보기' }).first().click()
  await pb.waitForURL(/\/tests\/[^/]+$/)
  await pb.getByRole('link', { name: '응시 시작' }).click()
  await pb.getByRole('button', { name: '응시 시작' }).click()
  await pb.getByRole('button', { name: 'O', exact: true }).click()
  await pb.getByRole('button', { name: '제출' }).click()
  await pb.getByRole('dialog').getByRole('button', { name: '확인' }).click()
  await expect(pb.getByText('10 / 10점')).toBeVisible()

  await pb.goto(`/s/${ws}/missions`)
  await pb.getByText('1단원 확인').click()
  await expect(pb.getByText('완료', { exact: true }).first()).toBeVisible()
  await expect(pb.getByRole('link', { name: '시험 보기' })).toHaveCount(1)
})
