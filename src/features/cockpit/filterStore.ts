// What the Cockpit remembers while the app is open: the filter, whether the filter
// bar is open, how far down the page was, and which charts have already grown in.
// Leaving for a dish and coming back finds everything as it was.

import { useLayoutEffect, useSyncExternalStore } from 'react'
import { NO_FILTER, parseFilter, type CockpitFilter } from './filter'

const KEY = 'foodwishus.cockpit.filter'

function load(): CockpitFilter {
  try {
    return parseFilter(sessionStorage.getItem(KEY))
  } catch {
    return NO_FILTER
  }
}

let filter: CockpitFilter = typeof sessionStorage === 'undefined' ? NO_FILTER : load()
const listeners = new Set<() => void>()

export function setFilter(next: CockpitFilter | ((current: CockpitFilter) => CockpitFilter)): void {
  filter = typeof next === 'function' ? next(filter) : next
  try {
    sessionStorage.setItem(KEY, JSON.stringify(filter))
  } catch {
    /* private mode: memory is enough */
  }
  for (const fn of listeners) fn()
}

export const resetFilter = (): void => setFilter(NO_FILTER)

export function useFilter(): CockpitFilter {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => filter,
  )
}

// ---------------------------------------------------------- scroll position --

let scroll = 0

/**
 * Puts the page back where it was, once it has something to show. The position is
 * read in the moment of leaving (not from scroll events, which arrive a frame late:
 * a tap right after a scroll would otherwise be remembered in the wrong place).
 */
export function useScrollMemory(ready: boolean): void {
  useLayoutEffect(() => {
    if (!ready) return
    window.scrollTo(0, scroll)
    return () => {
      scroll = window.scrollY
    }
  }, [ready])
}

// ------------------------------------------------------------ grown charts --

const grown = new Set<string>()

/** Charts grow in once. After that they simply are there. */
export const hasGrown = (id: string): boolean => grown.has(id)
export const markGrown = (id: string): void => void grown.add(id)
