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

  // 3-F2(CRS-11~13): 파일·유튜브 링크 자료, 오디오 속도 조절, 자료 순서 바꾸기
  await pa.getByTestId('material-file').setInputFiles({ name: 'grammar.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') })
  await expect(pa.getByTestId('materials')).toContainText('grammar.pdf')
  await pa.getByRole('textbox', { name: '링크 주소 (유튜브도 돼요)' }).fill('https://youtu.be/dQw4w9WgXcQ')
  await pa.getByRole('textbox', { name: '이름 (선택)' }).fill('설명 영상')
  await pa.getByRole('button', { name: '링크 추가' }).click()
  await expect(pa.locator('iframe[src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"]')).toBeVisible()
  await pa.getByTestId('material-file').setInputFiles({ name: 'listen.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('ID3') })
  await expect(pa.getByRole('combobox', { name: '재생 속도' })).toBeVisible()
  await pa.getByRole('button', { name: '설명 영상 위로' }).click()
  await expect(pa.getByTestId('materials').locator('li').first()).toContainText('설명 영상')

  await pb.goto(courseUrl)
  await expect(pb.getByTestId('lesson-list').locator('li').first()).toContainText('일반동사')
  await expect(pb.getByRole('button', { name: '레슨 추가' })).toHaveCount(0)
  await pb.getByRole('link', { name: 'be동사' }).click()
  await expect(pb.locator('.ProseMirror')).toContainText('am, are, is를 배워요')
  await expect(pb.getByTestId('materials').locator('li').first()).toContainText('설명 영상')
  await expect(pb.getByTestId('materials')).toContainText('grammar.pdf')
  await expect(pb.getByRole('button', { name: '파일 올리기' })).toHaveCount(0)

  // 3-F3(CRS-21~23): 완료 체크, 내 필기, 내 진도·멤버 진도
  await pb.getByRole('button', { name: '완료로 표시' }).click()
  await expect(pb.getByRole('button', { name: '완료 취소' })).toBeVisible()
  await pb.getByRole('button', { name: '내 필기' }).click()
  const note = pb.getByTestId('lesson-note')
  await note.locator('.ProseMirror').click()
  await pb.keyboard.type('3인칭 단수는 is')
  await expect(note.locator('.ProseMirror')).toContainText('3인칭 단수는 is')
  await pb.goto(courseUrl)
  await expect(pb.getByTestId('my-progress')).toContainText('2개 중 1개 완료')
  await pa.goto(courseUrl)
  await expect(pa.getByTestId('member-progress')).toContainText('50%')

  // CRS-07·WS-61 코스 복사: 레슨·본문·링크 자료는 가고, 올린 파일은 안 간다
  await pa.getByRole('button', { name: '다른 공간으로 복사' }).click()
  await pa.getByRole('radio', { name: /내 공간/ }).click()
  await pa.getByRole('button', { name: '복사하기' }).click()
  await pa.waitForURL(url => !url.pathname.startsWith(`/s/${ws}`) && /\/courses\/[^/]+$/.test(url.pathname))
  await expect(pa.getByText('영어 반에서 복사함')).toBeVisible()
  await expect(pa.getByTestId('lesson-list').locator('li').first()).toContainText('일반동사')
  await pa.getByRole('link', { name: 'be동사' }).click()
  await expect(pa.locator('.ProseMirror').first()).toContainText('am, are, is를 배워요')
  await expect(pa.getByTestId('materials')).toContainText('설명 영상')
  await expect(pa.getByTestId('materials')).not.toContainText('grammar.pdf')
})
