import { expect, test } from '@playwright/test'
import { workspaceWithMember } from './helpers'

/** 미션 흐름(2-G2): 진행자가 체크형 미션을 열고 → 멤버가 참여 중 탭에서 완료 체크 → 새로고침 후에도 유지 */
test('a member checks off a mission the host opened', async ({ browser }) => {
  const { pa, pb, ws } = await workspaceWithMember(browser, 'mina', 'jun', '미션 스터디')

  await pa.goto(`/s/${ws}/missions`)
  await pa.getByRole('button', { name: '미션 만들기' }).click()
  await pa.locator('#mis-title').fill('매일 단어 20개')
  await pa.locator('button[form="mission-form"]').click()
  await expect(pa.getByRole('dialog')).toBeHidden()

  await pb.goto(`/s/${ws}/missions`)
  await pb.getByText('매일 단어 20개').click()
  await pb.waitForURL(/\/missions\/[^/]+$/)
  const box = pb.locator('input[type="checkbox"]').first()
  await box.check()
  await expect(box).toBeChecked()
  // 저장이 끝나기 전에 새로고침하면 체크가 빠지므로, 저장될 때까지 새로고침해 본다
  await expect(async () => {
    await pb.reload()
    await expect(pb.locator('input[type="checkbox"]').first()).toBeChecked({ timeout: 3000 })
  }).toPass({ timeout: 15000 })
})
