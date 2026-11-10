// The app's single data stack: local database, cloud connection, store, sync engine.

import { useSyncExternalStore } from 'react'
import type { Backend, Membership, ProfileInput } from './backend'
import { AppDB, META } from './db'
import { HttpFakeBackend } from './fake/httpBackend'
import { Store } from './store'
import { SupabaseBackend } from './supabaseBackend'
import { SyncEngine, type SyncStatus } from './sync'

function createBackend(): Backend {
  if (import.meta.env.VITE_BACKEND === 'fake') return new HttpFakeBackend()
  return new SupabaseBackend(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_KEY)
}

export const db = new AppDB()
export const backend = createBackend()
export const store = new Store(db)
export const sync = new SyncEngine(db, backend, store)

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (onChange) => sync.onStatus(onChange),
    () => sync.status,
  )
}

/** Remember which kitchen this phone belongs to, then fetch everything. */
async function adopt(membership: Membership): Promise<void> {
  await db.transaction('rw', db.meta, async () => {
    await db.setMeta(META.householdId, membership.householdId)
    await db.setMeta(META.memberId, membership.memberId)
    await db.meta.delete(META.cursor)
  })
  await sync.start()
  await sync.sync()
}

/** Start the kitchen. Returns the recovery key, which is shown exactly once. */
export async function startKitchen(name: string, me: ProfileInput): Promise<string> {
  const result = await backend.createHousehold(name, me)
  await adopt(result)
  return result.recoveryKey
}

export async function joinKitchen(code: string, me: ProfileInput): Promise<void> {
  await adopt(await backend.joinHousehold(code, me))
}

/** Call once when the app opens. Works offline: a paired phone starts from its local copy. */
export async function boot(): Promise<{ paired: boolean }> {
  if (navigator.storage?.persist) void navigator.storage.persist()
  const householdId = await db.getMeta<string>(META.householdId)
  if (householdId) {
    await sync.start()
    return { paired: true }
  }
  return { paired: false }
}
