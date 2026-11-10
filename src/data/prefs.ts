// Choices that belong to this phone only (they do not sync).

import { useSyncExternalStore } from 'react'

export interface Prefs {
  /** Show calorie numbers anywhere in the app. */
  showCalories: boolean
  /** Fill the app with sample dishes and meals so every screen can be judged. */
  demoData: boolean
  /** With demoData: open the demo kitchen without sample content. Used by tests. */
  demoEmpty: boolean
}

const KEY = 'foodwishus.prefs'
const defaults: Prefs = { showCalories: true, demoData: false, demoEmpty: false }
const listeners = new Set<() => void>()
let cache: Prefs | null = null

function read(): Prefs {
  if (cache) return cache
  try {
    cache = { ...defaults, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>) }
  } catch {
    cache = { ...defaults }
  }
  return cache
}

export function getPref<K extends keyof Prefs>(key: K): Prefs[K] {
  return read()[key]
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  cache = { ...read(), [key]: value }
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    /* private mode: keep it in memory */
  }
  for (const fn of listeners) fn()
}

export function usePref<K extends keyof Prefs>(key: K): Prefs[K] {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => read()[key],
  )
}
