// The sync engine. One pass does four things, in this order:
//   1. send queued changes (the outbox), oldest first
//   2. upload photos that are still only on this phone
//   3. pull whatever changed in the kitchen since the last pass
//   4. fetch photos the partner added
// It never blocks the app: if the cloud is unreachable the pass ends quietly and the
// next trigger (reconnect, app focus, a change from the partner, a timer) tries again.

import { isBackendError, photoPath, type Backend } from './backend'
import { META, type AppDB } from './db'
import type { Store } from './store'
import { nowIso, SYNC_TABLES, type ID, type ISO, type Photo } from './types'

/**
 * locked-out: this device is no longer logged in. paused: the admin has paused the profile;
 * the engine keeps asking and carries on by itself once it is switched on again.
 */
export type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'locked-out' | 'paused'

export interface SyncStatus {
  state: SyncState
  /** Changes waiting to be sent. */
  pending: number
  /** Photos waiting to be uploaded. */
  uploads: number
  /** Changes the cloud refused. Shown in Settings so nothing disappears silently. */
  stuck: number
  lastSyncAt: ISO | null
  lastError: string | null
}

export interface SyncOptions {
  /** Safety-net interval between passes while the app is open. */
  intervalMs?: number
  /** Full-size photos newer than this are kept on the phone for offline viewing. */
  fullPhotoDays?: number
}

/** Each pull re-reads this much history, so a row committed "late" is never missed. */
const OVERLAP_MS = 30_000
const MAX_ATTEMPTS = 3
const MISSING_RETRY_MS = 5 * 60_000

export class SyncEngine {
  status: SyncStatus = { state: 'idle', pending: 0, uploads: 0, stuck: 0, lastSyncAt: null, lastError: null }

  /** True in the demo kitchen: nothing is ever sent or fetched. */
  disabled = false

  private listeners = new Set<(s: SyncStatus) => void>()
  private current: Promise<void> | null = null
  private again = false
  private kickTimer: ReturnType<typeof setTimeout> | null = null
  private interval: ReturnType<typeof setInterval> | null = null
  private unsubscribe: (() => void) | null = null
  private detach: (() => void) | null = null
  private missingBlobs = new Map<ID, number>()
  /** Whether the cloud has confirmed, since the app opened, that this phone still has its seat. */
  private seatConfirmed = false
  private readonly opts: Required<SyncOptions>

  constructor(
    readonly db: AppDB,
    readonly backend: Backend,
    readonly store: Store,
    opts: SyncOptions = {},
  ) {
    this.opts = { intervalMs: 60_000, fullPhotoDays: 60, ...opts }
    // A local change shows up as "waiting" at once, then a pass is scheduled.
    // The timer matters: a write can happen inside a larger database transaction, and
    // counting must wait until that has finished.
    this.store.onWrite = () => {
      setTimeout(() => void this.refreshCounts(), 0)
      this.kick()
    }
  }

  onStatus(fn: (s: SyncStatus) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** Begin syncing in the background. Call once the phone is paired. */
  async start(): Promise<void> {
    this.stop()
    if (this.disabled) return
    this.seatConfirmed = false
    const householdId = await this.db.getMeta<ID>(META.householdId)
    if (!householdId) return
    // Starting fresh also clears a lock-out: the phone has just been paired (again).
    this.status = { ...this.status, state: 'idle', lastError: null, lastSyncAt: (await this.db.getMeta<ISO>(META.lastSyncAt)) ?? null }
    this.unsubscribe = this.backend.subscribe(householdId, () => this.kick(150))
    this.interval = setInterval(() => this.kick(), this.opts.intervalMs)

    if (typeof window !== 'undefined') {
      const wake = () => {
        if (document.visibilityState !== 'hidden') this.kick()
      }
      window.addEventListener('online', wake)
      window.addEventListener('focus', wake)
      document.addEventListener('visibilitychange', wake)
      this.detach = () => {
        window.removeEventListener('online', wake)
        window.removeEventListener('focus', wake)
        document.removeEventListener('visibilitychange', wake)
      }
    }
    this.kick(0)
  }

  stop(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.detach?.()
    this.detach = null
    if (this.interval) clearInterval(this.interval)
    if (this.kickTimer) clearTimeout(this.kickTimer)
    this.interval = null
    this.kickTimer = null
  }

  /** Ask for a pass soon. Many kicks in a row become one pass. */
  kick(delayMs = 30): void {
    if (this.disabled) return
    if (this.kickTimer) clearTimeout(this.kickTimer)
    this.kickTimer = setTimeout(() => {
      this.kickTimer = null
      void this.sync()
    }, delayMs)
  }

  /** Run a pass now. Resolves once it, and any pass requested meanwhile, has finished. */
  sync(): Promise<void> {
    if (this.disabled) return Promise.resolve()
    if (this.current) {
      this.again = true
      return this.current
    }
    this.current = this.loop().finally(() => {
      this.current = null
    })
    return this.current
  }

  private async loop(): Promise<void> {
    do {
      this.again = false
      await this.pass()
    } while (this.again)
  }

  private async pass(): Promise<void> {
    const householdId = await this.db.getMeta<ID>(META.householdId)
    if (!householdId || this.status.state === 'locked-out') return
    // A paused seat stays "paused" while it asks again, so its screen does not flicker.
    if (this.status.state !== 'paused') this.setStatus({ state: 'syncing' })
    try {
      // Ask the cloud whether this device still has its seat: once after opening the app,
      // and before every pass that has something to send. A device that was logged out or
      // paused must keep its changes instead of sending them into the void.
      if (!this.seatConfirmed || this.status.state === 'paused' || (await this.db.outbox.count()) > 0) await this.confirmSeat()
      await this.pushOutbox()
      if (await this.uploadBlobs(householdId)) await this.pushOutbox()
      await this.pull()
      await this.downloadBlobs(householdId)
      const at = nowIso()
      await this.db.setMeta(META.lastSyncAt, at)
      this.setStatus({ state: 'idle', lastSyncAt: at, lastError: null })
    } catch (e) {
      if (isLockedOut(e)) {
        this.setStatus({ state: 'locked-out', lastError: null })
      } else if (e instanceof Paused) {
        this.setStatus({ state: 'paused', lastError: null })
      } else if (isBackendError(e) && e.kind === 'network') {
        this.setStatus({ state: 'offline', lastError: null })
      } else {
        const message = e instanceof Error ? e.message : String(e)
        await this.db.setMeta(META.lastError, { message, at: nowIso() })
        this.setStatus({ state: 'error', lastError: message })
      }
    } finally {
      await this.refreshCounts()
    }
  }

  private async confirmSeat(): Promise<void> {
    this.seatConfirmed = false
    const seat = await this.backend.membership()
    if (seat === null) throw new LockedOut()
    if (seat.paused) throw new Paused()
    this.seatConfirmed = true
  }

  // ---------------------------------------------------------------- 1. push --

  private async pushOutbox(): Promise<void> {
    let membershipChecked = false
    for (;;) {
      const op = await this.db.outbox.orderBy('seq').first()
      if (!op) return
      const seq = op.seq as number
      this.store.inFlightSeq = seq
      try {
        await this.backend.push({ table: op.table, kind: op.kind, id: op.rowId, data: op.data })
        await this.db.outbox.delete(seq)
      } catch (e) {
        if (!isBackendError(e) || e.kind !== 'rejected') throw e

        // A refusal can mean this phone was unpaired. Never throw data away in that case.
        if (!membershipChecked) {
          membershipChecked = true
          await this.confirmSeat()
        }

        const attempts = op.attempts + 1
        if (attempts < MAX_ATTEMPTS) {
          await this.db.outbox.update(seq, { attempts, lastError: e.message })
          continue
        }
        await this.db.transaction('rw', this.db.outbox, this.db.deadLetters, this.db.meta, async () => {
          const { seq: _seq, ...rest } = op
          await this.db.deadLetters.add({ ...rest, attempts, lastError: e.message, failedAt: nowIso() })
          await this.db.outbox.delete(seq)
          // Start the next pull from scratch so the phone falls back in line with the cloud.
          await this.db.meta.delete(META.cursor)
        })
      } finally {
        this.store.inFlightSeq = null
      }
    }
  }

  // ------------------------------------------------------- 2. upload photos --

  private async uploadBlobs(householdId: ID): Promise<boolean> {
    const waiting = await this.db.blobs.where('pending').equals(1).toArray()
    let uploadedAny = false
    for (const entry of waiting) {
      if (entry.attempts >= 5) continue
      try {
        if (entry.full) await this.backend.uploadBlob(photoPath(householdId, entry.id, 'full'), entry.full)
        if (entry.thumb) await this.backend.uploadBlob(photoPath(householdId, entry.id, 'thumb'), entry.thumb)
      } catch (e) {
        if (isBackendError(e) && e.kind === 'rejected') {
          await this.db.blobs.update(entry.id, { attempts: entry.attempts + 1 })
          continue
        }
        throw e
      }
      await this.db.blobs.update(entry.id, { pending: 0, attempts: 0 })
      if (await this.db.photos.get(entry.id)) {
        await this.store.patch('photos', entry.id, { uploaded: true })
      }
      uploadedAny = true
    }
    return uploadedAny
  }

  // ---------------------------------------------------------------- 3. pull --

  private async pull(): Promise<void> {
    const since = (await this.db.getMeta<ISO>(META.cursor)) ?? null
    const result = await this.backend.pull(since)
    // An idle device learns here that it was logged out or paused from somewhere else.
    if (result.seat === 'gone') throw new LockedOut()
    if (result.seat === 'paused') throw new Paused()

    const tables = SYNC_TABLES.map((t) => this.db.table(t))
    await this.db.transaction('rw', [...tables, this.db.outbox, this.db.meta], async () => {
      for (const table of SYNC_TABLES) {
        for (const row of result.tables[table] ?? []) {
          const id = row.id as ID
          // Changes made on this phone that the cloud has not seen yet win over what
          // just arrived; they are re-applied on top of the fresh row.
          const unsent = await this.db.outbox.where('[table+rowId]').equals([table, id]).sortBy('seq')
          if (unsent.some((op) => op.kind === 'put')) continue
          let merged = row
          for (const op of unsent) merged = { ...merged, ...op.data }
          await this.db.rows(table).put(merged as never)
        }
      }
      const cursor = new Date(Date.parse(result.serverTime) - OVERLAP_MS).toISOString()
      await this.db.setMeta(META.cursor, cursor)
    })
  }

  // ----------------------------------------------------- 4. download photos --

  private async downloadBlobs(householdId: ID): Promise<void> {
    const photos = await this.db.photos.filter((p) => p.uploaded && !p.deletedAt).toArray()
    if (!photos.length) return
    const have = await this.db.blobs.bulkGet(photos.map((p) => p.id))
    const now = Date.now()

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i]
      const entry = have[i]
      const wantFull = this.isRecent(photo, now)
      if (entry?.thumb && (entry.full || !wantFull)) continue
      const lastMiss = this.missingBlobs.get(photo.id)
      if (lastMiss && now - lastMiss < MISSING_RETRY_MS) continue

      const thumb = entry?.thumb ?? (await this.backend.downloadBlob(photoPath(householdId, photo.id, 'thumb')))
      const full =
        entry?.full ?? (wantFull ? await this.backend.downloadBlob(photoPath(householdId, photo.id, 'full')) : null)
      if (!thumb && !full) {
        this.missingBlobs.set(photo.id, now)
        continue
      }
      await this.db.blobs.put({ id: photo.id, thumb, full, pending: entry?.pending ?? 0, attempts: 0 })
    }
  }

  /** Fetch one full-size photo on demand (for old photos that are kept as thumbnails only). */
  async ensureFullPhoto(photoId: ID): Promise<Blob | null> {
    const entry = await this.db.blobs.get(photoId)
    if (entry?.full) return entry.full
    const householdId = await this.db.getMeta<ID>(META.householdId)
    if (!householdId) return null
    const full = await this.backend.downloadBlob(photoPath(householdId, photoId, 'full'))
    if (full) {
      await this.db.blobs.put({ id: photoId, thumb: entry?.thumb ?? null, full, pending: entry?.pending ?? 0, attempts: 0 })
    }
    return full
  }

  private isRecent(photo: Photo, now: number): boolean {
    const taken = Date.parse(photo.takenAt ?? photo.createdAt)
    return now - taken < this.opts.fullPhotoDays * 86_400_000
  }

  // ------------------------------------------------------------------ status --

  private async refreshCounts(): Promise<void> {
    const [pending, uploads, stuck] = await Promise.all([
      this.db.outbox.count(),
      this.db.blobs.where('pending').equals(1).count(),
      this.db.deadLetters.count(),
    ])
    this.setStatus({ pending, uploads, stuck })
  }

  private setStatus(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch }
    for (const fn of this.listeners) fn(this.status)
  }
}

class LockedOut extends Error {
  constructor() {
    super('locked_out')
  }
}

class Paused extends Error {
  constructor() {
    super('paused')
  }
}

const isLockedOut = (e: unknown): e is LockedOut => e instanceof LockedOut
