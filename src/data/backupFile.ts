// The backup as a file: one zip with backup.json (every row, see backup.ts) and the
// photos next to it as plain JPEGs.
//
//   foodwishus-backup-2026-11-10.zip
//     backup.json
//     photos/<photo id>.jpg       full size
//     photos/<photo id>_t.jpg     thumbnail
//
// Exporting reads this device's copy of the kitchen. Old photos are kept here only as
// thumbnails, so their full size is fetched from the cloud for the file; when that is
// not possible the thumbnail goes in alone and the result says so.
//
// Importing writes every row through the store, like any other change, so it reaches
// the cloud and the other person. What is written is decided by planImport().

import { version } from '../../package.json'
import { photoPath, type Backend } from './backend'
import { BACKUP_TABLES, BackupError, backupFileName, buildBackup, parseBackup, photoEntry, photoOfEntry, planImport, summarize, type Backup, type BackupRows, type BackupSummary, type BackupTable, type ImportPlan, type KitchenNow, type PlanOptions } from './backup'
import { META, type AppDB } from './db'
import { restorePhoto } from './photos'
import type { Store } from './store'
import type { Dish, ID, Serving, TableRows } from './types'
import { listZip, readZipEntry, ZipError, ZipWriter, type ZipEntry } from './zip'

const JSON_NAME = 'backup.json'

async function readRows(db: AppDB): Promise<BackupRows> {
  const [criteria, photos, dishes, menus, servings, reviews] = await Promise.all([db.criteria.toArray(), db.photos.toArray(), db.dishes.toArray(), db.menus.toArray(), db.servings.toArray(), db.reviews.toArray()])
  return { criteria, photos, dishes, menus, servings, reviews }
}

// ------------------------------------------------------------------- export --

export interface ExportOptions {
  /** False for the small file: everything except the pictures. */
  withPhotos: boolean
  /** Called as photos are packed: how many are done, out of how many. */
  onProgress?: (done: number, total: number) => void
  /** The moment the backup is made. Defaults to now. */
  now?: Date
}

export interface ExportResult {
  file: Blob
  /** foodwishus-backup-2026-11-10.zip */
  name: string
  summary: BackupSummary
  /** Photos that are in the file only as thumbnails, because their full size could not be fetched. */
  photosSmall: number
  /** Photos that are not in the file at all: their pictures are neither on this device nor reachable. */
  photosMissing: number
}

/**
 * Pack the kitchen into one file. `backend` fetches full-size photos this device only
 * keeps as thumbnails; pass null (the demo kitchen) to take what is here.
 */
export async function exportKitchen(source: { db: AppDB; backend: Backend | null }, options: ExportOptions): Promise<ExportResult> {
  const { db, backend } = source
  const householdId = await db.getMeta<ID>(META.householdId)
  const household = householdId ? await db.households.get(householdId) : undefined
  if (!householdId || !household) throw new Error('This device is not in a kitchen yet.')
  const when = options.now ?? new Date()
  const madeAt = when.toISOString()
  const [rows, members] = await Promise.all([readRows(db), db.members.toArray()])

  const zip = new ZipWriter(when)
  let photoIds: Set<ID> | null = null
  let photosSmall = 0
  let photosMissing = 0

  if (options.withPhotos) {
    photoIds = new Set()
    const wanted = rows.photos.filter((photo) => photo.householdId === householdId && !photo.deletedAt)
    let cloud = backend
    const fetch = async (photoId: ID, variant: 'full' | 'thumb'): Promise<Blob | null> => {
      if (!cloud) return null
      try {
        return await cloud.downloadBlob(photoPath(householdId, photoId, variant))
      } catch {
        // No connection: stop asking, or every remaining photo would wait for its own timeout.
        cloud = null
        return null
      }
    }
    let done = 0
    options.onProgress?.(0, wanted.length)
    for (const photo of wanted) {
      const entry = await db.blobs.get(photo.id)
      // A photo that was never uploaded exists only here: there is nothing to fetch.
      const full = entry?.full ?? (photo.uploaded ? await fetch(photo.id, 'full') : null)
      const thumb = entry?.thumb ?? (photo.uploaded && !full ? await fetch(photo.id, 'thumb') : null)
      if (full) await zip.add(photoEntry(photo.id, 'full'), full)
      if (thumb) await zip.add(photoEntry(photo.id, 'thumb'), thumb)
      if (full || thumb) photoIds.add(photo.id)
      else photosMissing += 1
      if (!full && thumb) photosSmall += 1
      options.onProgress?.(++done, wanted.length)
    }
  }

  const backup = buildBackup({ household, members, rows }, { app: version, madeAt, photoIds })
  await zip.add(JSON_NAME, new TextEncoder().encode(JSON.stringify(backup)))
  const file = zip.finish()
  await db.setMeta(META.lastBackupAt, madeAt)
  return { file, name: backupFileName(madeAt), summary: summarize(backup), photosSmall, photosMissing }
}

// ------------------------------------------------------------------- import --

export interface OpenedBackup {
  file: Blob
  backup: Backup
  summary: BackupSummary
  /** What importing would do right now. Worked out again when the import really runs. */
  plan: ImportPlan
  /** The zip entries that hold photos, by photo id. */
  pictures: Map<ID, { full?: ZipEntry; thumb?: ZipEntry }>
}

function asBackupError(error: unknown): never {
  if (error instanceof BackupError) throw error
  if (error instanceof ZipError) throw new BackupError(error.code === 'damaged' ? 'damaged' : 'not_a_backup', error.code === 'damaged' ? 'zip' : null)
  throw error
}

async function kitchenNow(db: AppDB): Promise<KitchenNow> {
  const householdId = await db.getMeta<ID>(META.householdId)
  const household = householdId ? await db.households.get(householdId) : undefined
  if (!householdId || !household) throw new Error('This device is not in a kitchen yet.')
  const [rows, members] = await Promise.all([readRows(db), db.members.toArray()])
  return {
    householdId,
    settings: household.settings ?? {},
    members: members.filter((member) => member.householdId === householdId && !member.deletedAt),
    rows,
  }
}

/**
 * Read a backup file far enough to say what is in it and what importing it into this
 * kitchen would do. Reads backup.json only, never the pictures. Throws a BackupError
 * for a file that is not a backup, comes from a newer app, or is damaged.
 */
export async function openBackup(db: AppDB, file: Blob, reviewId: PlanOptions['reviewId']): Promise<OpenedBackup> {
  try {
    const entries = await listZip(file)
    // Somebody may have unpacked the backup and zipped the folder again: look inside one folder too.
    const main = entries.filter((entry) => entry.name === JSON_NAME || entry.name.endsWith(`/${JSON_NAME}`)).sort((a, b) => a.name.length - b.name.length)[0]
    if (!main) throw new BackupError('not_a_backup')
    const prefix = main.name.slice(0, main.name.length - JSON_NAME.length)

    let json: unknown
    try {
      json = JSON.parse(new TextDecoder().decode(await readZipEntry(file, main)))
    } catch (error) {
      if (error instanceof ZipError) throw error
      throw new BackupError('damaged', JSON_NAME)
    }
    const backup = parseBackup(json)

    const pictures: OpenedBackup['pictures'] = new Map()
    for (const entry of entries) {
      if (!entry.name.startsWith(prefix)) continue
      const photo = photoOfEntry(entry.name.slice(prefix.length))
      if (!photo) continue
      pictures.set(photo.photoId, { ...pictures.get(photo.photoId), [photo.variant]: entry })
    }
    const plan = await planImport(backup, await kitchenNow(db), { photosInFile: new Set(pictures.keys()), reviewId })
    return { file, backup, summary: summarize(backup), plan, pictures }
  } catch (error) {
    return asBackupError(error)
  }
}

export interface ImportResult {
  /** Rows written, per table. */
  written: Record<BackupTable, number>
  /** Photos whose pictures turned out to be unreadable. They were left out, and nothing points to them. */
  photosDamaged: number
}

/** Take photos that could not be restored out of a row, so nothing shows an empty frame for ever. */
function withoutPhotos<T extends BackupTable>(table: T, row: TableRows[T], gone: ReadonlySet<ID>): TableRows[T] {
  if (gone.size === 0) return row
  if (table === 'dishes') {
    const dish = row as Dish
    const steps = dish.recipe.steps?.map((step) => {
      if (!step.photoId || !gone.has(step.photoId)) return step
      const { photoId: _photoId, ...rest } = step
      return rest
    })
    return { ...dish, coverPhotoId: dish.coverPhotoId && gone.has(dish.coverPhotoId) ? null : dish.coverPhotoId, recipe: steps ? { ...dish.recipe, steps } : dish.recipe } as TableRows[T]
  }
  if (table === 'servings') {
    const serving = row as Serving
    return { ...serving, proofPhotos: serving.proofPhotos.filter((proof) => !gone.has(proof.photoId)) } as TableRows[T]
  }
  return row
}

/**
 * Import an opened backup into the kitchen this device is logged in to. Merges by id,
 * never deletes, never touches people. Safe to run twice: the second run finds
 * everything in place. If it is interrupted, running it again finishes the job.
 */
export async function importBackup(
  store: Store,
  opened: OpenedBackup,
  reviewId: PlanOptions['reviewId'],
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const { db } = store
  const now = await kitchenNow(db)
  // The kitchen may have moved on since the preview was shown (the other person, a sync).
  const plan = await planImport(opened.backup, now, { photosInFile: new Set(opened.pictures.keys()), reviewId })
  const written = Object.fromEntries(BACKUP_TABLES.map((table) => [table, 0])) as Record<BackupTable, number>
  const gone = new Set<ID>()

  const picture = async (entry: ZipEntry | undefined): Promise<Blob | null> => {
    if (!entry) return null
    try {
      return new Blob([(await readZipEntry(opened.file, entry)) as BlobPart], { type: 'image/jpeg' })
    } catch (error) {
      if (error instanceof ZipError) return null
      throw error
    }
  }

  let done = 0
  onProgress?.(0, plan.writes.length)
  for (const write of plan.writes) {
    if (write.table === 'photos') {
      const entries = opened.pictures.get(write.row.id)
      const full = await picture(entries?.full)
      const thumb = await picture(entries?.thumb)
      if (full || thumb) {
        await restorePhoto(store, write.row, { full, thumb })
        written.photos += 1
      } else gone.add(write.row.id)
    } else {
      await store.put(write.table, withoutPhotos(write.table, write.row, gone) as never)
      written[write.table] += 1
    }
    onProgress?.(++done, plan.writes.length)
  }
  if (plan.settings) await store.patch('households', now.householdId, { settings: plan.settings })
  return { written, photosDamaged: gone.size }
}
