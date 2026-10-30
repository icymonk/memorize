import { expect, test } from '@playwright/test'
import { workspaceWithMember } from './helpers'

/** 3-E1·E2: 함께 읽기 개설·균등 분배 일정·참여하기(내 책장에 담김)·진행 현황·챕터별 이야기 스포일러 가리기 (READ-40~43·45) */
test('host opens a reading group with an even schedule and a member joins', async ({ browser }) => {
  const { pa, pb, ws } = await workspaceWithMember(browser, 'jun', 'mia', '책 모임')
  await pa.goto(`/s/${ws}/reading`)
  await pa.getByRole('button', { name: '책 담기' }).click()
  await pa.locator('#book-title').fill('함께 책')
  await pa.locator('button[form="book-form"]').click()
  await expect(pa.getByRole('button', { name: /함께 책/ }).first()).toBeVisible()

  await pa.getByRole('link', { name: '함께 읽기' }).click()
  await pa.getByRole('button', { name: '함께 읽기 만들기' }).click()
  const dialog = pa.getByRole('dialog')
  await dialog.getByLabel('끝').fill('90')
  await dialog.getByRole('button', { name: '기간에 맞춰 균등 분배' }).click()
  await expect(dialog.getByTestId('schedule-row')).toHaveCount(4)
  await dialog.getByRole('button', { name: '만들기' }).click()
  await pa.waitForURL(/\/reading\/groups\/[^/]+$/)
  const schedule = pa.getByTestId('group-schedule')
  await expect(schedule).toContainText('1주차')
  await expect(schedule).toContainText('1~22쪽')
  await expect(schedule).toContainText('68~90쪽')

  await pb.goto(`/s/${ws}/reading/groups`)
  await pb.getByRole('link', { name: /함께 책/ }).click()
  await pb.getByRole('button', { name: '참여하기' }).click()
  await expect(pb.getByText('참여 2명')).toBeVisible()
  await expect(pb.getByRole('button', { name: '나가기' })).toBeVisible()
  await expect(pb.getByTestId('group-progress')).toContainText('일정대로')

  // READ-43 챕터별 이야기: 아직 그 범위를 안 읽은 사람에게는 가려진다
  await pb.getByRole('button', { name: /1주차/ }).click()
  await pb.getByTestId('talk-w1').getByRole('textbox').fill('첫 장면이 좋았어요')
  await pb.getByTestId('talk-w1').getByRole('button', { name: '남기기' }).click()
  await expect(pb.getByTestId('talk-w1')).toContainText('첫 장면이 좋았어요')

  await pa.reload()
  await pa.getByRole('button', { name: /1주차/ }).click()
  const talk = pa.getByTestId('talk-w1')
  await expect(talk).toContainText('아직 이 범위를 다 읽지 않아서 가렸어요.')
  await expect(talk).not.toContainText('첫 장면이 좋았어요')
  await talk.getByRole('button', { name: '그래도 보기' }).click()
  await expect(talk).toContainText('첫 장면이 좋았어요')

  await pb.goto(`/s/${ws}/reading`)
  await expect(pb.getByRole('button', { name: /함께 책/ }).first()).toBeVisible()
})
