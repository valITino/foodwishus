// Photos: shrink on the phone, keep the bytes locally, queue the upload.

import type { BlobEntry } from './db'
import type { Store } from './store'
import { newId, nowIso, type ID, type Photo, type PhotoKind, type PhotoSource } from './types'

const FULL_EDGE = 1600
const THUMB_EDGE = 400
const TARGET_BYTES = 400 * 1024

export interface PreparedImage {
  full: Blob
  thumb: Blob
  width: number
  height: number
}

async function render(bitmap: ImageBitmap, maxEdge: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot resize images.')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, width, height)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the photo.'))), 'image/jpeg', quality),
  )
  return { blob, width, height }
}

/** Max 1600 px on the long edge at about 80% quality, aiming under 400 KB, plus a 400 px thumbnail. */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    let full = await render(bitmap, FULL_EDGE, 0.8)
    for (const quality of [0.7, 0.6, 0.5]) {
      if (full.blob.size <= TARGET_BYTES) break
      full = await render(bitmap, FULL_EDGE, quality)
    }
    const thumb = await render(bitmap, THUMB_EDGE, 0.72)
    return { full: full.blob, thumb: thumb.blob, width: full.width, height: full.height }
  } finally {
    bitmap.close()
  }
}

export interface AddPhotoInput {
  kind: PhotoKind
  source: PhotoSource
  takenAt?: string
}

/** Save prepared image bytes and the photo row together, and queue both for the cloud. */
export async function savePhoto(store: Store, image: PreparedImage, input: AddPhotoInput): Promise<Photo> {
  const householdId = await store.householdId()
  if (!householdId) throw new Error('This phone is not paired with a kitchen yet.')
  const at = nowIso()
  const photo: Photo = {
    id: newId(),
    householdId,
    kind: input.kind,
    width: image.width,
    height: image.height,
    bytes: image.full.size,
    source: input.source,
    takenAt: input.takenAt ?? at,
    createdBy: (await store.memberId()) ?? null,
    uploaded: false,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  }
  const entry: BlobEntry = { id: photo.id, full: image.full, thumb: image.thumb, pending: 1, attempts: 0 }
  const { db } = store
  await db.transaction('rw', db.photos, db.blobs, db.outbox, async () => {
    await db.blobs.put(entry)
    await store.put('photos', photo)
  })
  return photo
}

export async function addPhotoFromFile(store: Store, file: Blob, input: AddPhotoInput): Promise<Photo> {
  return savePhoto(store, await prepareImage(file), input)
}

export async function photoBlob(store: Store, photoId: ID, variant: 'thumb' | 'full'): Promise<Blob | null> {
  const entry = await store.db.blobs.get(photoId)
  if (!entry) return null
  return variant === 'thumb' ? (entry.thumb ?? entry.full) : (entry.full ?? entry.thumb)
}
