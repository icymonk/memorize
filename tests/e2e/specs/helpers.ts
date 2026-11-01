import type { Browser, Page } from '@playwright/test'
import { expect } from '@playwright/test'

const AUTH = 'http://127.0.0.1:9099/emulator/v1/projects/demo-memorize'

/** 이메일 링크로 로그인하고 첫 설정을 마친 뒤, 내 공간 id를 돌려준다 */
export async function signUp(page: Page, name: string): Promise<string> {
  const email = `${name}-${Date.now()}@example.com`
  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.getByRole('button', { name: '로그인 링크 받기' }).click()
  await expect(page.getByText(`${email}(으)로 로그인 링크를 보냈어요`)).toBeVisible()
  const codes = await (await fetch(`${AUTH}/oobCodes`)).json() as { oobCodes: { email: string, oobLink: string }[] }
  const link = codes.oobCodes.filter(c => c.email === email).at(-1)!.oobLink
  await page.goto(link)
  await page.waitForURL(/\/welcome/)
  await page.locator('#displayName').fill(name)
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL(/\/s\/p_/)
  return page.url().match(/\/s\/(p_[^/?#]+)/)![1]!
}

/** 워크스페이스를 만들고 초대 코드로 다른 사람을 들인다. 두 페이지와 워크스페이스 id를 돌려준다 */
export async function workspaceWithMember(browser: Browser, owner: string, member: string, name: string) {
  const pa = await (await browser.newContext()).newPage()
  const personal = await signUp(pa, owner)
  await pa.getByRole('button', { name: /내 공간/ }).first().click()
  await pa.getByRole('menuitem', { name: '워크스페이스 만들기' }).click()
  await pa.locator('#ws-name').fill(name)
  await pa.locator('button[form="create-workspace"]').click()
  await pa.waitForURL(url => !url.pathname.startsWith(`/s/${personal}`) && /\/s\/[^/]+/.test(url.pathname))
  const ws = pa.url().match(/\/s\/([^/?#]+)/)![1]!

  await pa.goto(`/s/${ws}/members`)
  await pa.getByRole('tab', { name: '초대' }).click()
  await pa.getByRole('button', { name: '초대 만들기' }).click()
  const code = (await pa.locator('span.font-mono').first().textContent())!.trim()

  const pb = await (await browser.newContext()).newPage()
  await signUp(pb, member)
  await pb.getByRole('button', { name: /내 공간/ }).first().click()
  await pb.getByRole('menuitem', { name: '코드로 참여' }).click()
  await pb.getByRole('dialog').locator('input').first().fill(code)
  await pb.locator('button[form="join-with-code"]').click()
  await pb.waitForURL(/\/invite\//)
  await pb.getByRole('button', { name: '참여하기' }).click()
  await pb.waitForURL(new RegExp(`/s/${ws}`))
  return { pa, pb, ws }
}
