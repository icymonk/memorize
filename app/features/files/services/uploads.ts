import type { Attachment, RegisterUploadInput, StorageUsage } from '#shared/schemas/upload'
import type { Firestore, Timestamp } from 'firebase/firestore'
import type { Functions } from 'firebase/functions'
import type { FirebaseStorage } from 'firebase/storage'
import { LIMITS } from '#shared/limits'
import { fitWithin, safeFileName, storageLevel, UPLOAD_TYPE, uploadPath } from '#shared/schemas/upload'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref as sref, uploadBytes } from 'firebase/storage'
import { toast } from 'vue-sonner'
import { callFn } from '~/lib/functions'
import { ko } from '~/locales/ko'

export interface Upload extends Attachment {
  spaceId: string
  refType: 'mission' | 'page' | 'card' | null
  createdAt: Timestamp | null
}

export async function getStorageUsage(db: Firestore, uid: string): Promise<StorageUsage> {
  const st = (await getDoc(doc(db, 'users', uid))).get('storage') ?? {}
  return { usedBytes: Number(st.usedBytes ?? 0), limitBytes: Number(st.limitBytes ?? LIMITS.storageBytesPerUser) }
}

/** CMN-60: 큰 사진은 긴 변 2048px로 줄인다. 움직이는 그림·벡터는 그대로 */
async function shrinkImage(file: File): Promise<Blob> {
  if (!/^image\/(?:jpeg|png|webp)$/.test(file.type)) return file
  const bmp = await createImageBitmap(file).catch(() => null)
  if (!bmp) return file
  const { width, height } = fitWithin(bmp.width, bmp.height)
  if (width === bmp.width && height === bmp.height) return file
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')?.drawImage(bmp, 0, 0, width, height)
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, type, 0.85))
  return blob && blob.size < file.size ? blob : file
}

export class UploadError extends Error {}

/** CMN-60·61: 본인 폴더에 올리고 서버에 등록한다. 등록이 거절되면 올린 파일을 지운다 */
export async function uploadFile(
  fb: { db: Firestore, storage: FirebaseStorage, functions: Functions },
  sid: string,
  uid: string,
  file: File,
  target: Pick<RegisterUploadInput, 'refType' | 'refId'> = {},
): Promise<Attachment> {
  const type = file.type || 'application/octet-stream'
  if (!UPLOAD_TYPE.test(type)) throw new UploadError(ko.files.badType)
  const blob = type.startsWith('image/') ? await shrinkImage(file) : file
  if (blob.size > LIMITS.maxFileBytes) throw new UploadError(ko.files.tooBig)
  const usage = await getStorageUsage(fb.db, uid)
  if (usage.usedBytes + blob.size > usage.limitBytes) throw new UploadError(ko.files.full)
  const fileId = doc(collection(fb.db, 'users', uid, 'uploads')).id
  const name = safeFileName(file.name)
  const objectRef = sref(fb.storage, uploadPath(sid, uid, fileId, name))
  await uploadBytes(objectRef, blob, { contentType: blob.type || type })
  try {
    const r = await callFn(fb.functions, 'registerUpload', { sid, fileId, name, refType: target.refType ?? null, refId: target.refId ?? null })
    if (storageLevel(r.usedBytes, r.limitBytes) !== 'ok') toast.warning(ko.files.warn)
    return r.file
  }
  catch (e) {
    await deleteObject(objectRef).catch(() => {})
    throw e
  }
}

export const fileUrl = (storage: FirebaseStorage, path: string) => getDownloadURL(sref(storage, path))

/** CMN-62: 내 업로드, 큰 파일부터 */
export async function listMyUploads(db: Firestore, uid: string): Promise<Upload[]> {
  const snap = await getDocs(collection(db, 'users', uid, 'uploads'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Upload).sort((a, b) => b.size - a.size)
}

export const removeUpload = (functions: Functions, fileId: string) => callFn(functions, 'deleteUpload', { fileId })
