import { expect, test } from '@playwright/test'
import { workspaceWithMember } from './helpers'

/** 3-E1: 함께 읽기 개설·균등 분배 일정·참여하기(내 책장에 담김) (READ-40·41·45) */
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
  await pb.goto(`/s/${ws}/reading`)
  await expect(pb.getByRole('button', { name: /함께 책/ }).first()).toBeVisible()
})
