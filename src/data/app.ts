// The app's single data stack: local database, cloud connection, store, sync engine.

import Dexie from 'dexie'
import { useSyncExternalStore } from 'react'
import type { Backend, Membership, ProfileInput } from './backend'
import { AppDB, META } from './db'
import { HttpFakeBackend } from './fake/httpBackend'
import { getPref, setPref } from './prefs'
import { Store } from './store'
import { SupabaseBackend } from './supabaseBackend'
import { SyncEngine, type SyncStatus } from './sync'

const DEMO_DB = 'foodwishus-demo'

/**
 * The demo kitchen: a separate database on this phone, filled with sample dishes and
 * meals. It never syncs and never touches the real kitchen. Leaving it deletes it.
 */
export const isDemo = getPref('demoData')

function createBackend(): Backend {
  if (import.meta.env.VITE_BACKEND === 'fake') return new HttpFakeBackend()
  return new SupabaseBackend(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_KEY)
}

export const db = new AppDB(isDemo ? DEMO_DB : 'foodwishus')
export const backend = createBackend()
export const store = new Store(db, isDemo)
export const sync = new SyncEngine(db, backend, store)
sync.disabled = isDemo

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

/**
 * Join with an invite code, or move a profile to this phone with a restore code.
 * Returns which of the two happened. After a "restore" the profile already exists:
 * do not overwrite it with what was typed during onboarding.
 */
export async function joinKitchen(code: string, me: ProfileInput): Promise<'join' | 'restore'> {
  const result = await backend.joinHousehold(code, me)
  await adopt(result)
  return result.kind
}

/**
 * This login already has a seat in the cloud but the phone does not know it (the reply
 * to "start" or "join" was lost on the way). Take the seat. Returns false when there is none.
 */
export async function resumeKitchen(): Promise<boolean> {
  const membership = await backend.membership()
  if (!membership) return false
  await adopt(membership)
  return true
}

/** Get back in with the recovery key, as one of the kitchen's existing members. */
export async function recoverKitchen(recoveryKey: string, memberId: string): Promise<void> {
  await adopt(await backend.recoverMember(recoveryKey, memberId))
}

/** Call once when the app opens. Works offline: a paired phone starts from its local copy. */
export async function boot(): Promise<{ paired: boolean }> {
  if (navigator.storage?.persist) void navigator.storage.persist()
  if (isDemo) {
    const { ensureDemoKitchen } = await import('./demo/seed')
    await ensureDemoKitchen(db)
    return { paired: true }
  }
  const householdId = await db.getMeta<string>(META.householdId)
  if (householdId) {
    await sync.start()
    return { paired: true }
  }
  return { paired: false }
}

/** Open the demo kitchen. The page reloads into it. */
export function enterDemo(): void {
  setPref('demoData', true)
  window.location.hash = '/'
  window.location.reload()
}

/** Leave the demo kitchen and delete it. The page reloads into the real app. */
export async function leaveDemo(): Promise<void> {
  setPref('demoData', false)
  db.close()
  await Dexie.delete(DEMO_DB)
  window.location.hash = '/'
  window.location.reload()
}
