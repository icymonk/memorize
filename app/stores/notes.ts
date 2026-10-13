import type { PropValue } from '#shared/schemas/collection'
import type { Collection } from '~/features/notes/services/collections'
import type { Page, PageBook, UserPrefs } from '~/features/notes/services/pages'
import type { FlatBlock } from '~/features/notes/sync/serialize'
import { defineStore } from 'pinia'
import { watchCollections } from '~/features/notes/services/collections'
import { copyBlocks, createPage, getPrefs, movePage, restorePage, savePrefs, trashPage, watchPages, writeBlocks } from '~/features/notes/services/pages'
import { compareOrder, keyBetween } from '~/features/notes/sync/order'
import { journalTemplate } from '~/features/notes/sync/template'
import { ko } from '~/locales/ko'

type Root = Page['root']

/** NOTE-20~22: 현재 공간의 페이지 트리, 즐겨찾기·최근, 옮기기·휴지통 */
export const useNotesStore = defineStore('notes', () => {
  const { $firestore, $functions } = useNuxtApp()
  const auth = useAuthStore()
  const space = useSpaceStore()

  const pages = ref<Page[]>([])
  const loaded = ref(false)
  const prefs = ref<UserPrefs>({ favoritePageIds: [], recentPageIds: [] })
  const expanded = ref(new Set<string>())
  const collections = ref<Collection[]>([])
  let unsub: (() => void) | null = null
  let unsubCols: (() => void) | null = null
  let sid: string | null = null

  const uid = () => auth.user!.uid
  const byId = computed(() => new Map(pages.value.map(p => [p.id, p])))
  const sortPages = (list: Page[]) => list.sort((a, b) => compareOrder(a.order, b.order) || (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0))

  function watchSpace(next: string | null) {
    if (next === sid) return
    unsub?.()
    unsubCols?.()
    unsub = null
    unsubCols = null
    sid = next
    pages.value = []
    collections.value = []
    loaded.value = false
    prefs.value = { favoritePageIds: [], recentPageIds: [] }
    if (!next || !auth.user) return
    unsub = watchPages($firestore, next, uid(), (list) => { pages.value = list; loaded.value = true }, () => { loaded.value = true })
    unsubCols = watchCollections($firestore, next, uid(), (list) => { collections.value = list.toSorted((a, b) => a.name.localeCompare(b.name, 'ko')) }, () => {})
    getPrefs($firestore, next, uid()).then((p) => { if (sid === next) prefs.value = p }).catch(() => {})
  }
  watch(() => (space.current?.modules?.notes === false ? null : space.current?.id ?? null), watchSpace, { immediate: true })
  watch(() => auth.user?.uid, () => { const s = sid; sid = null; watchSpace(s) })

  /** 부모가 안 보이는 페이지는 맨 위에 둔다 */
  function childrenOf(parentId: string | null, root?: Root): Page[] {
    return sortPages(pages.value.filter((p) => {
      const parent = p.parentId && byId.value.has(p.parentId) ? p.parentId : null
      return p.type === 'page' && parent === parentId && (!root || p.root === root)
    }))
  }
  const ancestors = (p: Page) => (p.ancestorIds ?? []).map(id => byId.value.get(id)).filter((x): x is Page => !!x)
  const favorites = computed(() => prefs.value.favoritePageIds.map(id => byId.value.get(id)).filter((x): x is Page => !!x))
  const recent = computed(() => prefs.value.recentPageIds.map(id => byId.value.get(id)).filter((x): x is Page => !!x))

  async function create(root: Root, parent: Page | null = null) {
    const siblings = childrenOf(parent?.id ?? null, parent?.root ?? root)
    const id = await createPage($firestore, sid!, uid(), { root, parent, after: siblings.at(-1)?.order ?? null })
    if (parent) expanded.value = new Set([...expanded.value, parent.id])
    return id
  }

  /** 끌어 놓은 자리: target 안으로(inside) 또는 target 앞·뒤로 */
  async function move(pageId: string, target: Page | null, where: 'inside' | 'before' | 'after', root: Root) {
    const parentId = where === 'inside' ? target?.id ?? null : target?.parentId ?? null
    const siblings = childrenOf(parentId, root).filter(p => p.id !== pageId)
    let i = siblings.length
    if (target && where !== 'inside') i = siblings.findIndex(p => p.id === target.id) + (where === 'after' ? 1 : 0)
    const prev = siblings[i - 1]?.order ?? null
    const next = siblings[i]?.order ?? null
    let order: string
    try { order = keyBetween(prev, next) }
    catch { order = keyBetween(prev, null) }
    await movePage($functions, sid!, pageId, parentId, order)
    if (parentId) expanded.value = new Set([...expanded.value, parentId])
  }

  const trash = (pageId: string) => trashPage($functions, sid!, pageId)
  const restore = (pageId: string) => restorePage($functions, sid!, pageId)

  async function setPrefs(p: UserPrefs) {
    prefs.value = p
    await savePrefs($firestore, sid!, uid(), p)
  }
  const isFavorite = (id: string) => prefs.value.favoritePageIds.includes(id)
  function toggleFavorite(id: string) {
    const f = prefs.value.favoritePageIds
    return setPrefs({ ...prefs.value, favoritePageIds: isFavorite(id) ? f.filter(x => x !== id) : [id, ...f] })
  }
  function visit(page: Page) {
    expanded.value = new Set([...expanded.value, ...(page.ancestorIds ?? [])])
    const r = [page.id, ...prefs.value.recentPageIds.filter(x => x !== page.id)].slice(0, 20)
    if (r.join() !== prefs.value.recentPageIds.join()) setPrefs({ ...prefs.value, recentPageIds: r }).catch(() => {})
  }
  function toggleExpanded(id: string) {
    const s = new Set(expanded.value)
    if (!s.delete(id)) s.add(id)
    expanded.value = s
  }

  /** NOTE-47: 모음 안의 페이지 (최신순) */
  const itemsOf = (collectionId: string) => pages.value.filter(p => p.type !== 'page' && p.collectionId === collectionId)
    .sort((a, b) => (b.createdAt?.toMillis() ?? Date.now()) - (a.createdAt?.toMillis() ?? Date.now()))
  /** review: 독후감은 책과 고른 템플릿(모음 템플릿 페이지 id 또는 기본 블록)으로 만들고, 발행 전까지 나만 본다 (REV-07) */
  async function createItem(col: Collection, props?: Record<string, PropValue>, review?: { book: PageBook, templateId?: string, blocks?: FlatBlock[] }) {
    const journal = col.kind === 'system' && col.systemType === 'journal'
    const visibility = journal ? space.current?.settings?.journalVisibility : review ? 'private' : undefined
    const id = await createPage($firestore, sid!, uid(), { root: col.scope, collection: { id: col.id, scope: col.scope }, after: null, props, journal, book: review?.book, visibility })
    const templateId = review ? review.templateId : col.templateIds?.[0]
    const template = templateId ? byId.value.get(templateId) : null
    if (template && !template.deletedAt) await copyBlocks($firestore, sid!, uid(), template, id)
    else if (review?.blocks?.length) await writeBlocks($firestore, sid!, uid(), id, review.blocks)
    else if (journal) await writeBlocks($firestore, sid!, uid(), id, journalTemplate(ko.notes.journal.template))
    return id
  }

  return { pages, loaded, collections, itemsOf, createItem, prefs, expanded, byId, childrenOf, ancestors, favorites, recent, create, move, trash, restore, isFavorite, toggleFavorite, visit, toggleExpanded }
})
