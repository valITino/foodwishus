// A tiny hash router. Hash routes work on GitHub Pages without redirect tricks and
// keep the installed app on a single URL.

import { useSyncExternalStore } from 'react'

export interface Route {
  /** Always starts with "/", never ends with one (except the root). */
  path: string
  segments: string[]
  query: URLSearchParams
}

let cachedHash: string | null = null
let cachedRoute: Route = { path: '/', segments: [], query: new URLSearchParams() }
const listeners = new Set<() => void>()

function current(): Route {
  const hash = window.location.hash
  if (hash === cachedHash) return cachedRoute
  const raw = hash.replace(/^#/, '') || '/'
  const [rawPath, rawQuery = ''] = raw.split('?')
  const path = `/${rawPath.replace(/^\/+|\/+$/g, '')}`
  cachedHash = hash
  cachedRoute = { path, segments: path.split('/').filter(Boolean), query: new URLSearchParams(rawQuery) }
  return cachedRoute
}

const notify = () => listeners.forEach((fn) => fn())

/** The page currently on screen, remembered so it can be put back if leaving is refused. */
let shownHash = typeof window !== 'undefined' ? window.location.hash : ''
let shownDepth = typeof window !== 'undefined' ? ((window.history.state as { depth?: number } | null)?.depth ?? 0) : 0
let blocker: (() => boolean) | null = null

/**
 * While set, the phone's own back button asks before leaving the page: the function is
 * called, and if it returns true the page stays (nothing typed is lost). Used by forms
 * with unsaved changes through useLeaveGuard. navigate() and back() are never blocked.
 */
export function setBlocker(fn: (() => boolean) | null): void {
  blocker = fn
}

function remember(): void {
  shownHash = window.location.hash
  shownDepth = depth()
}

function onHistoryEvent(): void {
  if (window.location.hash !== shownHash && blocker?.()) {
    window.history.pushState({ depth: shownDepth }, '', shownHash || '#/')
    return
  }
  remember()
  notify()
}

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', onHistoryEvent)
  window.addEventListener('popstate', onHistoryEvent)
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

/** The address right now, outside of React. */
export function currentPath(): string {
  return current().path
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, current)
}

/**
 * How many in-app steps lie behind the current page. It is stored on the history
 * entry itself, so it stays right when the Android back button is used.
 */
function depth(): number {
  const state = window.history.state as { depth?: number } | null
  return state?.depth ?? 0
}

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (options.replace) window.history.replaceState({ depth: depth() }, '', `#${to}`)
  else window.history.pushState({ depth: depth() + 1 }, '', `#${to}`)
  remember()
  notify()
}

/** Go back one step, or to the fallback when the app was opened directly on this page. */
export function back(fallback = '/'): void {
  if (depth() > 0) window.history.back()
  else navigate(fallback, { replace: true })
}

/** matchPath('/recipes/:id/edit', '/recipes/abc/edit') → { id: 'abc' } */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const want = pattern.split('/').filter(Boolean)
  const have = path.split('/').filter(Boolean)
  if (want.length !== have.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(':')) params[want[i].slice(1)] = decodeURIComponent(have[i])
    else if (want[i] !== have[i]) return null
  }
  return params
}

/** The public link to a route, for sharing (invite links). */
export function publicUrl(route: string): string {
  return `${window.location.origin}${window.location.pathname}#${route}`
}
