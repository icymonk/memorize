import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { HttpsError } from 'firebase-functions/v2/https'
import type { RegisterUploadOutput } from '../../../shared/schemas/upload'
import { LIMITS } from '../../../shared/limits'
import { deleteUploadInput, registerUploadInput, safeFileName, UPLOAD_TYPE, uploadPath } from '../../../shared/schemas/upload'
import { authedCallable } from '../lib/callable'

/**
 * CMN-61·62: 올린 파일을 내 업로드 목록과 용량에 더한다. 계정당 총량을 넘으면 파일을 지우고 거절한다.
 * Storage 트리거 대신 callable로 집계해 버킷 위치와 상관없이 동작한다.
 */
export const registerUpload = authedCallable(registerUploadInput, async ({ uid, data }): Promise<RegisterUploadOutput> => {
  const db = getFirestore()
  if ((await db.doc(`spaces/${data.sid}/members/${uid}`).get()).get('status') !== 'active') throw new HttpsError('permission-denied', 'not a member')
  const name = safeFileName(data.name)
  const path = uploadPath(data.sid, uid, data.fileId, name)
  const file = getStorage().bucket().file(path)
  const [exists] = await file.exists()
  if (!exists) throw new HttpsError('not-found', 'file missing')
  const [meta] = await file.getMetadata()
  const size = Number(meta.size ?? 0)
  const contentType = String(meta.contentType ?? 'application/octet-stream')
  if (!UPLOAD_TYPE.test(contentType) || size > LIMITS.maxFileBytes) {
    await file.delete().catch(() => {})
    throw new HttpsError('invalid-argument', 'file not allowed')
  }

  const userRef = db.doc(`users/${uid}`)
  const upRef = userRef.collection('uploads').doc(data.fileId)
  const r = await db.runTransaction(async (tx) => {
    const [u, up] = await Promise.all([tx.get(userRef), tx.get(upRef)])
    const used = Number(u.get('storage.usedBytes') ?? 0)
    const limit = Number(u.get('storage.limitBytes') ?? LIMITS.storageBytesPerUser)
    if (up.exists) return { used, limit, over: false }
    if (used + size > limit) return { used, limit, over: true }
    tx.create(upRef, { spaceId: data.sid, path, name, size, contentType, refType: data.refType, refId: data.refId, createdAt: FieldValue.serverTimestamp() })
    tx.set(userRef, { storage: { usedBytes: FieldValue.increment(size), limitBytes: limit } }, { merge: true })
    return { used: used + size, limit, over: false }
  })
  if (r.over) {
    await file.delete().catch(() => {})
    throw new HttpsError('resource-exhausted', 'storage full')
  }
  return { file: { id: data.fileId, name, path, contentType, size }, usedBytes: r.used, limitBytes: r.limit }
})

/** CMN-62: 내 파일 지우기 (첨부한 곳에서도 더 이상 열리지 않는다) */
export const deleteUpload = authedCallable(deleteUploadInput, async ({ uid, data }) => {
  const db = getFirestore()
  const upRef = db.doc(`users/${uid}/uploads/${data.fileId}`)
  const up = await upRef.get()
  if (!up.exists) throw new HttpsError('not-found', 'upload not found')
  await getStorage().bucket().file(String(up.get('path'))).delete({ ignoreNotFound: true })
  await db.runTransaction(async (tx) => {
    const cur = await tx.get(upRef)
    if (!cur.exists) return
    tx.delete(upRef)
    tx.set(db.doc(`users/${uid}`), { storage: { usedBytes: FieldValue.increment(-Number(cur.get('size') ?? 0)) } }, { merge: true })
  })
  return { ok: true as const }
})
