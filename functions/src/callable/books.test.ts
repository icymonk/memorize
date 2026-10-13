import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchGoogle, searchKakao } from './books'

const reply = (body: unknown, ok = true) => vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => body }))
afterEach(() => vi.unstubAllGlobals())

describe('book search (READ-01)', () => {
  it('kakao: skipped without a key; maps documents with https covers and ISBN-13', async () => {
    const f = reply({ documents: [{ title: '소년이 온다', authors: ['한강'], publisher: '창비', thumbnail: 'http://t/1.jpg', isbn: '8936434128 9788936434120' }] })
    vi.stubGlobal('fetch', f)
    expect(await searchKakao('한강', '')).toEqual([])
    expect(f).not.toHaveBeenCalled()
    expect(await searchKakao('한강', 'k')).toEqual([{ title: '소년이 온다', authors: ['한강'], publisher: '창비', cover: 'https://t/1.jpg', isbn13: '9788936434120', pages: null, source: 'kakao' }])
    expect((f.mock.calls as unknown[][])[0]![1]).toEqual({ headers: { Authorization: 'KakaoAK k' } })
  })

  it('google: ISBN queries use isbn:, page counts come along; errors give no results', async () => {
    const f = reply({ items: [{ volumeInfo: { title: 'Dune', subtitle: 'Deluxe', authors: ['Frank Herbert'], pageCount: 412, industryIdentifiers: [{ identifier: '9780441013593' }] } }] })
    vi.stubGlobal('fetch', f)
    const [hit] = await searchGoogle('978-0441013593', '')
    expect(hit).toMatchObject({ title: 'Dune: Deluxe', pages: 412, isbn13: '9780441013593', cover: '', source: 'google' })
    expect(String((f.mock.calls as unknown[][])[0]![0])).toContain('q=isbn%3A9780441013593')
    vi.stubGlobal('fetch', reply({}, false))
    expect(await searchGoogle('x', '')).toEqual([])
  })
})
