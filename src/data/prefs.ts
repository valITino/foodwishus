// Choices kept on this device. showCalories also travels with the person's profile
// (src/app/settingsSync.ts); the demo switches and the link reader's switches stay local.

import { useSyncExternalStore } from 'react'

export interface Prefs {
  /** Show calorie numbers anywhere in the app. */
  showCalories: boolean
  /** Fill the app with sample dishes and meals so every screen can be judged. */
  demoData: boolean
  /** With demoData: open the demo kitchen without sample content. Used by tests. */
  demoEmpty: boolean
  /** Reading a recipe from a link: write it in the app's language. */
  linkTranslate: boolean
  /** Reading a recipe from a link: convert cups, ounces and Fahrenheit. */
  linkMetric: boolean
  /** Reading a recipe from a link: bring the page's picture along. */
  linkPhoto: boolean
}

const KEY = 'foodwishus.prefs'
const defaults: Prefs = { showCalories: true, demoData: false, demoEmpty: false, linkTranslate: true, linkMetric: true, linkPhoto: true }
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

/** Hear about every change. Returns a function that stops listening. */
export function onPrefChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
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
