// 텍스트·미디어 블록: 인용(한 줄 블록), 강조 상자, 유튜브 (NOTE-02·04)
import { mergeAttributes, Node, textblockTypeInputRule } from '@tiptap/core'

export const Quote = Node.create({
  name: 'blockquote',
  group: 'block',
  content: 'inline*',
  defining: true,
  parseHTML: () => [{ tag: 'blockquote' }],
  renderHTML: ({ HTMLAttributes }) => ['blockquote', HTMLAttributes, 0],
  addInputRules() {
    return [textblockTypeInputRule({ find: /^\s*>\s$/, type: this.type })]
  },
})

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'inline*',
  defining: true,
  addAttributes: () => ({
    emoji: { default: '💡', parseHTML: el => el.getAttribute('data-emoji') || '💡', renderHTML: a => ({ 'data-emoji': a.emoji }) },
  }),
  parseHTML: () => [{ tag: 'div[data-callout]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-callout': '' }), 0],
})

const YOUTUBE_EMBED = /^https:\/\/www\.youtube-nocookie\.com\/embed\/[\w-]{11}$/

/** 유튜브 주소 → 임베드 주소. 유튜브가 아니면 null */
export function youtubeEmbed(input: string): string | null {
  let url: URL
  try {
    url = new URL(input.trim())
  }
  catch {
    return null
  }
  const host = url.hostname.replace(/^(www\.|m\.)/, '')
  let id: string | null = null
  if (host === 'youtu.be') id = url.pathname.slice(1)
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.searchParams.get('v') ?? url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1] ?? null
  }
  return id && /^[\w-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null
}

export const Video = Node.create({
  name: 'video',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({ src: { default: null } }),
  parseHTML: () => [{ tag: 'div[data-video]', getAttrs: el => ({ src: el.querySelector('iframe')?.getAttribute('src') ?? null }) }],
  renderHTML: ({ node, HTMLAttributes }) => {
    const src = String(node.attrs.src ?? '')
    // 다른 사람이 쓴 블록도 그대로 그리므로 우리가 만든 임베드 주소만 iframe으로 연다
    if (!YOUTUBE_EMBED.test(src)) return ['div', mergeAttributes(HTMLAttributes, { 'data-video': '' })]
    return ['div', mergeAttributes(HTMLAttributes, { 'data-video': '' }), ['iframe', {
      src,
      allow: 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
      allowfullscreen: 'true',
      referrerpolicy: 'strict-origin-when-cross-origin',
      loading: 'lazy',
    }]]
  },
})
