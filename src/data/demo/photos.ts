// Paints the demo kitchen's photos and stores them like real ones: a full-size JPEG
// and a thumbnail in `blobs`, a row in `photos`, and a proof entry on the serving (or
// a cover on the recipe card). This runs after the kitchen itself is seeded, so the
// demo opens at once and the photos develop behind it, newest first.

import type { AppDB, BlobEntry } from '../db'
import type { Photo } from '../types'
import type { PhotoJob } from './history'
import { canPaint, paintPhoto, type PaintedPhoto } from './paint'
import type { PaintReply, PaintRequest } from './photoWorker'

/** Where the list of photos still to paint is kept. Removed when all are done. */
export const PHOTO_JOBS = 'demo.photoJobs'

/** Photos are saved in small groups, so screens refresh a few times instead of seventy. */
const GROUP = 6

type Painted = PaintedPhoto & { job: PhotoJob }

interface Helper {
  paint(job: PhotoJob): Promise<PaintedPhoto>
  stop(): void
}

/** A background worker that does the painting, where the browser has one to offer. */
function startHelper(): Helper | null {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null
  let worker: Worker
  try {
    worker = new Worker(new URL('./photoWorker.ts', import.meta.url), { type: 'module' })
  } catch {
    return null
  }
  const waiting = new Map<string, { resolve: (photo: PaintedPhoto) => void; reject: (error: Error) => void }>()
  const fail = (reason: string): void => {
    for (const { reject } of waiting.values()) reject(new Error(reason))
    waiting.clear()
  }
  worker.onmessage = (event: MessageEvent<PaintReply>) => {
    const reply = event.data
    const request = waiting.get(reply.id)
    if (!request) return
    waiting.delete(reply.id)
    if (reply.ok) request.resolve({ full: reply.full, thumb: reply.thumb, width: reply.width, height: reply.height })
    else request.reject(new Error(reply.reason))
  }
  worker.onerror = (event) => {
    event.preventDefault()
    fail('The photo worker stopped.')
  }
  worker.onmessageerror = () => fail('The photo worker sent something unreadable.')
  return {
    paint: (job) =>
      new Promise((resolve, reject) => {
        waiting.set(job.photoId, { resolve, reject })
        const { kind, art, seed, light, source, disaster } = job
        worker.postMessage({ id: job.photoId, spec: { kind, art, seed, light, source, disaster } } satisfies PaintRequest)
      }),
    stop: () => worker.terminate(),
  }
}

async function save(db: AppDB, group: Painted[]): Promise<void> {
  await db.transaction('rw', db.photos, db.blobs, db.servings, db.dishes, async () => {
    for (const { job, full, thumb, width, height } of group) {
      // Attach the photo only if what it belongs to is still there.
      if (job.servingId) {
        const serving = await db.servings.get(job.servingId)
        if (!serving || serving.deletedAt) continue
        if (!serving.proofPhotos.some((proof) => proof.photoId === job.photoId)) {
          await db.servings.update(job.servingId, { proofPhotos: [...serving.proofPhotos, { photoId: job.photoId, source: job.source, takenAt: job.takenAt }] })
        }
      } else if (job.dishId) {
        const dish = await db.dishes.get(job.dishId)
        if (!dish || dish.deletedAt) continue
        if (!dish.coverPhotoId) await db.dishes.update(job.dishId, { coverPhotoId: job.photoId })
      }
      const photo: Photo = {
        id: job.photoId,
        householdId: job.householdId,
        kind: job.kind,
        width,
        height,
        bytes: full.size,
        source: job.source,
        takenAt: job.takenAt,
        createdBy: job.createdBy,
        uploaded: true,
        createdAt: job.takenAt,
        updatedAt: job.takenAt,
        deletedAt: null,
      }
      const entry: BlobEntry = { id: job.photoId, full, thumb, pending: 0, attempts: 0 }
      await db.photos.put(photo)
      await db.blobs.put(entry)
    }
  })
}

/** Without a worker: let the screen draw and taps land before the next picture. */
function breathe(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: 120 })
    else setTimeout(resolve, 16)
  })
}

async function paintAll(db: AppDB): Promise<number> {
  const jobs = await db.getMeta<PhotoJob[]>(PHOTO_JOBS)
  if (!jobs?.length) return 0
  if (!canPaint()) return 0

  const done = new Set(await db.photos.toCollection().primaryKeys())
  let helper = startHelper()
  let painted = 0
  let group: Painted[] = []
  try {
    for (const job of jobs) {
      if (done.has(job.photoId)) continue
      let photo: PaintedPhoto | undefined
      if (helper) {
        try {
          photo = await helper.paint(job)
        } catch {
          // The worker is not available after all. Carry on without it.
          helper.stop()
          helper = null
        }
      }
      if (!photo) {
        await breathe()
        photo = await paintPhoto(job)
      }
      group.push({ job, ...photo })
      if (group.length >= GROUP) {
        await save(db, group)
        painted += group.length
        group = []
      }
    }
    if (group.length) {
      await save(db, group)
      painted += group.length
    }
  } finally {
    helper?.stop()
  }
  await db.meta.delete(PHOTO_JOBS)
  return painted
}

const running = new WeakMap<AppDB, Promise<number>>()

/**
 * Paint every demo photo that is still missing. Safe to call on every start: it
 * carries on where it stopped, does nothing once all photos exist, and never throws
 * (leaving the demo closes the database under its feet). Resolves with how many
 * photos were painted.
 */
export function seedDemoPhotos(db: AppDB): Promise<number> {
  const current = running.get(db)
  if (current) return current
  const work = async (): Promise<number> => {
    try {
      // Two tabs of the demo take turns instead of painting everything twice.
      const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
      if (locks) return (await locks.request(`foodwishus-demo-photos-${db.name}`, () => paintAll(db))) as number
      return await paintAll(db)
    } catch {
      return 0
    } finally {
      running.delete(db)
    }
  }
  const run = work()
  running.set(db, run)
  return run
}
