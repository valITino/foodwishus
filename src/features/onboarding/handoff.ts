// Things that must survive the moment a phone becomes paired. The app shell swaps
// onboarding for the real app the instant the kitchen exists on this phone, so what
// onboarding still has to show or save is parked here:
//
//   - the recovery key, until its owner confirms it is written down (shown once, then gone)
//   - the status line and accessory, which pairing cannot carry and are saved right after
//
// Both are kept in localStorage so that closing the app at the wrong moment loses nothing.

import { useSyncExternalStore } from 'react'
import { updateMyProfile, type ProfileChanges } from '../../data/actions'
import { sync } from '../../data/app'

const KEY_SLOT = 'foodwishus.pendingRecoveryKey'
const KEY_OWED_SLOT = 'foodwishus.recoveryKeyOwed'
const PROFILE_SLOT = 'foodwishus.pendingProfile'

const listeners = new Set<() => void>()
let starting = false
let memoryKey: string | null = null

function read(slot: string): string | null {
  try {
    return localStorage.getItem(slot)
  } catch {
    return null
  }
}

function write(slot: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(slot)
    else localStorage.setItem(slot, value)
  } catch {
    /* private mode: the in-memory copy still works until the app closes */
  }
}

const emit = () => listeners.forEach((fn) => fn())
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// ---------------------------------------------------------- recovery key --

/** A recovery key that was handed out but not confirmed as written down yet. */
export function pendingKey(): string | null {
  return memoryKey ?? read(KEY_SLOT)
}

export function keepKey(key: string): void {
  memoryKey = key
  write(KEY_SLOT, key)
  emit()
}

/** Call when the owner says "I wrote it down". After this the key is gone for good. */
export function forgetKey(): void {
  memoryKey = null
  write(KEY_SLOT, null)
  write(KEY_OWED_SLOT, null)
  emit()
}

export function usePendingKey(): string | null {
  return useSyncExternalStore(subscribe, pendingKey)
}

/**
 * Note that this phone is about to start a kitchen and is owed a recovery key (or, with
 * false, that starting failed). If the app closes before the key was ever shown, Settings
 * can still say so and offer to make one.
 */
export function oweKey(owed: boolean): void {
  write(KEY_OWED_SLOT, owed ? '1' : null)
  emit()
}

/** True when this phone started the kitchen but nobody confirmed a recovery key yet. */
export function useKeyOwed(): boolean {
  return useSyncExternalStore(subscribe, () => read(KEY_OWED_SLOT) === '1')
}

// ------------------------------------------------------ starting a kitchen --

/** True from the tap on "Start our kitchen" until the kitchen exists and its key is here. */
export function setStarting(value: boolean): void {
  starting = value
  emit()
}

export function useStarting(): boolean {
  return useSyncExternalStore(subscribe, () => starting)
}

// ------------------------------------------------- status line and accessory --

/** Park (or drop, with null) the profile extras before a pairing attempt. */
export function parkProfile(extras: ProfileChanges | null): void {
  write(PROFILE_SLOT, extras ? JSON.stringify(extras) : null)
}

function parkedProfile(): ProfileChanges | null {
  const raw = read(PROFILE_SLOT)
  if (!raw) return null
  try {
    return JSON.parse(raw) as ProfileChanges
  } catch {
    return null
  }
}

async function saveParkedProfile(): Promise<boolean> {
  const extras = parkedProfile()
  if (!extras) return true
  try {
    await updateMyProfile(extras)
    write(PROFILE_SLOT, null)
    return true
  } catch {
    return false
  }
}

let waitingForSync = false

/** Try again after every finished sync pass until the extras are saved (or dropped). */
function retryAfterSync(): void {
  if (waitingForSync) return
  waitingForSync = true
  const stop = sync.onStatus((status) => {
    if (status.state !== 'idle') return
    void saveParkedProfile().then((done) => {
      if (!done) return
      stop()
      waitingForSync = false
    })
  })
}

/**
 * Save the parked extras to the profile. Works once this phone has its own member row.
 * If the first sync did not get through yet, they stay parked and are saved after the
 * next sync that does; this then returns false.
 */
export async function applyParkedProfile(): Promise<boolean> {
  const done = await saveParkedProfile()
  if (!done) retryAfterSync()
  return done
}

// If the app was closed before the extras could be saved, finish the job after the next sync.
if (typeof window !== 'undefined' && parkedProfile()) retryAfterSync()
