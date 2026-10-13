import { describe, expect, it } from 'vitest'
import { fitWithin, formatBytes, registerUploadInput, safeFileName, storageLevel, UPLOAD_TYPE, uploadPath } from './upload'

describe('uploads (CMN-60~62)', () => {
  it('builds owner-scoped paths with safe names', () => {
    expect(uploadPath('ws1', 'bob', 'abcdefgh12', safeFileName('a/b#c?.png'))).toBe('spaces/ws1/files/bob/abcdefgh12/a_b_c_.png')
    expect(safeFileName('  ')).toBe('file')
    expect(safeFileName(`${'x'.repeat(200)}.pdf`)).toHaveLength(120)
    expect(safeFileName(`${'x'.repeat(200)}.pdf`).endsWith('.pdf')).toBe(true)
  })
  it('validates register input', () => {
    expect(registerUploadInput.safeParse({ sid: 'ws1', fileId: 'abcdefgh12', name: 'a.png' }).success).toBe(true)
    expect(registerUploadInput.safeParse({ sid: 'ws1', fileId: '../x', name: 'a.png' }).success).toBe(false)
  })
  it('levels, sizes and image fit', () => {
    expect(storageLevel(70, 100)).toBe('ok')
    expect(storageLevel(80, 100)).toBe('warn')
    expect(storageLevel(100, 100)).toBe('full')
    expect(formatBytes(512)).toBe('512B')
    expect(formatBytes(1536)).toBe('1.5KB')
    expect(formatBytes(2 * 1024 ** 3)).toBe('2GB')
    expect(fitWithin(4000, 3000)).toEqual({ width: 2048, height: 1536 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })
  it('allows common file types only', () => {
    for (const t of ['image/png', 'audio/mpeg', 'video/mp4', 'application/pdf', 'text/plain']) expect(UPLOAD_TYPE.test(t)).toBe(true)
    expect(UPLOAD_TYPE.test('font/woff2')).toBe(false)
  })
})
