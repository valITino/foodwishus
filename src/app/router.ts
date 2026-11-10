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
/** How many in-app steps we can go back before leaving the app. */
let depth = 0

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

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, current)
}

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (options.replace) {
    window.location.replace(`#${to}`)
  } else {
    depth += 1
    window.location.hash = to
  }
}

/** Go back one step, or to the fallback when the app was opened directly on this page. */
export function back(fallback = '/'): void {
  if (depth > 0) {
    depth -= 1
    window.history.back()
  } else {
    navigate(fallback, { replace: true })
  }
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
