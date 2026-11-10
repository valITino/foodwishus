// The phone's own copy of everything: an IndexedDB database (through Dexie).
// Screens read from here, so they open instantly and work offline.

import Dexie, { type Table } from 'dexie'
import type {
  Criterion,
  Dish,
  Household,
  ID,
  ISO,
  Member,
  Menu,
  Photo,
  Review,
  Serving,
  SyncTable,
} from './types'

/** A change waiting to reach the cloud. Sent strictly in seq order. */
export interface OutboxOp {
  seq?: number
  table: SyncTable
  rowId: ID
  kind: 'put' | 'patch'
  data: Record<string, unknown>
  createdAt: ISO
  attempts: number
  lastError?: string
}

/** A change the cloud refused three times. Kept so nothing vanishes silently. */
export interface DeadLetter extends OutboxOp {
  failedAt: ISO
}

/** Image bytes for a photo row. pending = 1 means "still needs uploading". */
export interface BlobEntry {
  id: ID
  full: Blob | null
  thumb: Blob | null
  pending: 0 | 1
  attempts: number
}

export interface MetaEntry {
  key: string
  value: unknown
}

export class AppDB extends Dexie {
  households!: Table<Household, ID>
  members!: Table<Member, ID>
  criteria!: Table<Criterion, ID>
  dishes!: Table<Dish, ID>
  menus!: Table<Menu, ID>
  servings!: Table<Serving, ID>
  reviews!: Table<Review, ID>
  photos!: Table<Photo, ID>
  blobs!: Table<BlobEntry, ID>
  outbox!: Table<OutboxOp, number>
  deadLetters!: Table<DeadLetter, number>
  meta!: Table<MetaEntry, string>

  constructor(name = 'foodwishus') {
    super(name)
    this.version(1).stores({
      households: 'id',
      members: 'id, householdId',
      criteria: 'id, householdId, sortOrder',
      dishes: 'id, householdId, course, updatedAt',
      menus: 'id, householdId',
      servings: 'id, householdId, dishId, menuId, status, plannedDate',
      reviews: 'id, householdId, servingId, dishId',
      photos: 'id, householdId',
      blobs: 'id, pending',
      outbox: '++seq, [table+rowId]',
      deadLetters: '++seq',
      meta: 'key',
    })
  }

  /** The Dexie table for a synced table name. */
  rows(table: SyncTable): Table<Record<string, unknown> & { id: ID }, ID> {
    return this.table(table)
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.meta.get(key))?.value as T | undefined
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.meta.put({ key, value })
  }
}

export const META = {
  /** ISO timestamp: only rows changed after this are pulled. */
  cursor: 'sync.cursor',
  householdId: 'me.householdId',
  memberId: 'me.memberId',
  lastSyncAt: 'sync.lastSyncAt',
  lastError: 'sync.lastError',
  /** ISO timestamp of the last backup saved from this device. */
  lastBackupAt: 'backup.lastAt',
} as const
