import type { Page } from '@playwright/test'
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
