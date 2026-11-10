// The app's single data stack: local database, cloud connection, store, sync engine.

import { useSyncExternalStore } from 'react'
import type { Backend, Membership, ProfileInput } from './backend'
import { AppDB, META } from './db'
import { HttpFakeBackend } from './fake/httpBackend'
import { getPref, setPref } from './prefs'
import { deviceMemory, PushControl, pushSetup } from './push'
import { takeSeat } from './seat'
import { Store } from './store'
import { SupabaseBackend } from './supabaseBackend'
import { SyncEngine, type SyncStatus } from './sync'
import { wipeOnNextStart } from './wipe'

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

const pushRig = pushSetup()
/** Notifications on this device (push.ts). The demo kitchen has no cloud that could send any. */
export const push = new PushControl(pushRig.device, backend, deviceMemory, isDemo ? '' : pushRig.vapidKey, typeof navigator === 'undefined' ? '' : navigator.userAgent)

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (onChange) => sync.onStatus(onChange),
    () => sync.status,
  )
}

/** Remember who this device is logged in as, then fetch everything. */
async function adopt(membership: Membership): Promise<void> {
  await takeSeat(db, membership)
  await sync.start()
  await sync.sync()
}

/** Open the kitchen. Whoever does this is its admin. The PIN is for logging in on other devices. */
export async function startKitchen(name: string, me: ProfileInput, pin: string): Promise<void> {
  await adopt(await backend.createHousehold(name, me, pin))
}

/**
 * Use a code from the admin. "join" takes the second seat with this profile and PIN.
 * "restore" logs in as the profile the code was made for (the profile typed here is
 * ignored) and replaces its forgotten PIN. Returns which of the two happened.
 */
export async function joinKitchen(code: string, me: ProfileInput, pin: string): Promise<'join' | 'restore'> {
  const result = await backend.joinHousehold(code, me, pin)
  await adopt(result)
  return result.kind
}

/** Log in on this device with name and PIN. Profile, settings and everything else follow. */
export async function logIn(name: string, pin: string): Promise<void> {
  await adopt(await backend.signInWithPin(name, pin))
}

/**
 * This login already has a seat in the cloud but the device does not know it (the reply
 * to "start", "join" or "log in" was lost on the way). Take the seat. Returns false when there is none.
 */
export async function resumeKitchen(): Promise<boolean> {
  const membership = await backend.membership()
  if (!membership) return false
  await adopt(membership)
  return true
}

/**
 * Log this device out and wipe its copy of the kitchen. Needs a connection, so the cloud
 * knows the device is gone. Changes that were not sent yet are lost: check
 * `sync.status.pending` first and warn. The page reloads to the start screen.
 */
export async function logOut(): Promise<void> {
  // No more notifications for this device. Asked first, while the cloud still knows who
  // is asking; the cloud also drops them by itself when the device is logged out.
  await push.removeFromCloud().catch(() => undefined)
  await backend.signOutDevice()
  await forgetThisDevice()
}

/** The cloud already logged this device out: wipe the local copy and start over. */
export async function forgetThisDevice(): Promise<void> {
  sync.stop()
  // The browser lets go of its subscription too: nothing arrives for a kitchen this device left.
  await push.forget().catch(() => undefined)
  await backend.signOut().catch(() => undefined)
  // The copy is deleted on the way back in, before anything reads from it (wipe.ts).
  wipeOnNextStart(db.name)
  window.location.hash = '/'
  window.location.reload()
}

let booting: Promise<{ paired: boolean }> | undefined

/**
 * Call when the app opens. Works offline: a paired phone starts from its local copy.
 * Safe to call twice (React does so in development): both callers get the same start.
 */
export function boot(): Promise<{ paired: boolean }> {
  return (booting ??= bootOnce())
}

async function bootOnce(): Promise<{ paired: boolean }> {
  if (navigator.storage?.persist) void navigator.storage.persist()
  if (isDemo) {
    const { ensureDemoKitchen } = await import('./demo/seed')
    await ensureDemoKitchen(db, { empty: getPref('demoEmpty') })
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
  wipeOnNextStart(DEMO_DB)
  window.location.hash = '/'
  window.location.reload()
}
