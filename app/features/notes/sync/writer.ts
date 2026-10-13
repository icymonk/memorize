// 자동 저장: 0.8초 쉬면 바뀐 블록만 묶음 쓰기, 떠날 때 즉시 저장 (docs/dev/editor.md 4절)
import type { Firestore } from 'firebase/firestore'
import type { BlockOp, SavedMap } from './diff'
import type { FlatBlock } from './serialize'
import { LIMITS } from '#shared/limits'
import { doc, increment, serverTimestamp, writeBatch } from 'firebase/firestore'
import { diffBlocks } from './diff'
import { blockText, idProblems, pageStats } from './serialize'

export type SaveStatus = 'saved' | 'saving' | 'offline' | 'error' | 'tooLarge'
export type PageMeta = ReturnType<typeof pageStats>
/** 묶음 하나를 쓴다. 마지막 묶음에만 페이지 메타가 붙는다 */
export type CommitChunk = (ops: BlockOp[], meta: PageMeta | null) => Promise<void>

export const SAVE_DELAY_MS = 800
export const BATCH_LIMIT = 400

/** 페이지 메타 1건을 마지막 묶음에 넣을 자리를 남기고 나눈다 */
export function chunkOps(ops: BlockOp[], limit = BATCH_LIMIT): BlockOp[][] {
  const chunks: BlockOp[][] = []
  for (let i = 0; i < ops.length; i += limit) chunks.push(ops.slice(i, i + limit))
  if (!chunks.length || chunks.at(-1)!.length === limit) chunks.push([])
  return chunks
}

export interface SaveQueueOptions {
  saved: SavedMap
  getBlocks: () => FlatBlock[]
  commit: CommitChunk
  onStatus: (s: SaveStatus) => void
  delay?: number
  online?: () => boolean
}

/**
 * Firestore는 쓰기를 로컬 캐시에 먼저 반영하고 서버 응답을 나중에 준다.
 * 그래서 응답을 기다리지 않고 비교 기준을 바로 옮기며, 응답이 남아 있는 동안은 "저장 중"(연결이 없으면 "오프라인")이다.
 */
export function createSaveQueue(opts: SaveQueueOptions) {
  let saved = opts.saved
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending = 0
  let failed = false
  let tooLarge = false
  const online = opts.online ?? (() => true)

  const emit = () => opts.onStatus(
    tooLarge ? 'tooLarge' : failed ? 'error' : pending || timer ? (online() ? 'saving' : 'offline') : 'saved',
  )

  function flush() {
    clearTimeout(timer)
    timer = undefined
    const blocks = opts.getBlocks()
    tooLarge = blocks.some(b => blockText(b).length > LIMITS.blockMaxChars)
    if (tooLarge || idProblems(blocks).length) return emit()
    const { ops, next } = diffBlocks(saved, blocks)
    if (!ops.length) return emit()
    saved = next
    failed = false
    const chunks = chunkOps(ops)
    const meta = pageStats(blocks)
    for (const [i, chunk] of chunks.entries()) {
      pending++
      opts.commit(chunk, i === chunks.length - 1 ? meta : null)
        .catch(() => {
          failed = true
          // 실패한 블록은 다음 저장 때 다시 쓰도록 비교 기준에서 되돌린다
          for (const op of chunk) {
            if (op.kind === 'delete') saved.set(op.id, { hash: '', parentBlockId: null, order: '' })
            else saved.delete(op.id)
          }
        })
        .finally(() => { pending--; emit() })
    }
    emit()
  }

  return {
    /** 편집할 때마다 부른다 */
    schedule() {
      clearTimeout(timer)
      timer = setTimeout(flush, opts.delay ?? SAVE_DELAY_MS)
      emit()
    },
    flush,
    /** 아직 보내지 않았거나 응답을 기다리는 쓰기가 있는지 */
    get busy() { return !!timer || pending > 0 },
    refresh: emit,
    /** 다른 곳에서 바뀐 내용을 받아 편집기에 넣은 뒤, 그 내용을 비교 기준으로 삼는다 */
    rebase(next: SavedMap) { saved = next },
    dispose() { clearTimeout(timer); timer = undefined },
  }
}

/** 페이지 하나의 블록을 묶음으로 쓴다. 한 묶음에 여러 페이지를 섞지 않는다 (S1) */
export function firestoreCommitter(db: Firestore, sid: string, pageId: string, uid: string): CommitChunk {
  const page = doc(db, 'spaces', sid, 'pages', pageId)
  return async (ops, meta) => {
    const batch = writeBatch(db)
    const now = serverTimestamp()
    for (const op of ops) {
      const ref = doc(page, 'blocks', op.id)
      if (op.kind === 'create') batch.set(ref, { ...op.data, rev: 1, updatedBy: uid, updatedAt: now })
      else if (op.kind === 'update') batch.update(ref, { ...op.data, rev: increment(1), updatedBy: uid, updatedAt: now })
      else if (op.kind === 'move') batch.update(ref, { parentBlockId: op.parentBlockId, order: op.order, rev: increment(1), updatedBy: uid, updatedAt: now })
      else batch.delete(ref)
    }
    if (meta) batch.update(page, { ...meta, updatedAt: now })
    await batch.commit()
  }
}
