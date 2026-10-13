import { expect, test } from '@playwright/test'
import { signUp } from './helpers'

/** E2E 흐름 4: 노트 작성 → 새로고침 후 유지 → 편집 잠금 중 다른 멤버는 읽기만 (블록 끌어 옮기기는 수동 확인) */
test('a note survives reload and is read-only for another member while locked', async ({ browser }) => {
  const pa = await (await browser.newContext()).newPage()
  const personal = await signUp(pa, 'hana')
  await pa.getByRole('button', { name: /내 공간/ }).first().click()
  await pa.getByRole('menuitem', { name: '워크스페이스 만들기' }).click()
  await pa.locator('#ws-name').fill('노트 스터디')
  await pa.locator('button[form="create-workspace"]').click()
  await pa.waitForURL(url => !url.pathname.startsWith(`/s/${personal}`) && /\/s\/[^/]+/.test(url.pathname))
  const ws = pa.url().match(/\/s\/([^/?#]+)/)![1]!

  await pa.goto(`/s/${ws}/members`)
  await pa.getByRole('tab', { name: '초대' }).click()
  await pa.getByRole('button', { name: '초대 만들기' }).click()
  const code = (await pa.locator('span.font-mono').first().textContent())!.trim()

  const pb = await (await browser.newContext()).newPage()
  await signUp(pb, 'dori')
  await pb.getByRole('button', { name: /내 공간/ }).first().click()
  await pb.getByRole('menuitem', { name: '코드로 참여' }).click()
  await pb.getByRole('dialog').locator('input').first().fill(code)
  await pb.locator('button[form="join-with-code"]').click()
  await pb.waitForURL(/\/invite\//)
  await pb.getByRole('button', { name: '참여하기' }).click()
  await pb.waitForURL(new RegExp(`/s/${ws}`))

  await pa.goto(`/s/${ws}/notes`)
  await pa.getByRole('button', { name: '새 페이지' }).click()
  await pa.waitForURL(/\/notes\/[^/]+$/)
  await pa.getByPlaceholder('제목 없음').fill('E2E 노트')
  await pa.locator('.ProseMirror').click()
  await pa.keyboard.type('첫 문단')
  await pa.keyboard.press('Enter')
  await pa.keyboard.type('둘째 문단')
  await expect(pa.getByText('저장됨')).toBeVisible()
  await pa.reload()
  await expect(pa.locator('.ProseMirror')).toContainText('둘째 문단')
  await expect(pa.getByPlaceholder('제목 없음')).toHaveValue('E2E 노트')

  await pb.goto(pa.url())
  await expect(pb.getByText('hana님이 편집 중이에요')).toBeVisible()
  await expect(pb.locator('.ProseMirror')).toContainText('둘째 문단')
  await expect(pb.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false')
})
