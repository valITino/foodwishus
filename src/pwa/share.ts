// A link shared to the app from another one (Pinterest, the browser): Android opens the
// app's start address with the shared text behind a question mark (see "share_target" in
// public/manifest.webmanifest). The app lives behind the hash, so the question mark part
// is turned into the page that reads recipe links, and then taken off the address.

import { linkIn } from '../features/recipes/importLogic'

/** The names Android fills in. Unusual on purpose: nothing else may ever look like a share. */
export const SHARE_PARAMS = { title: 'shared_title', text: 'shared_text', url: 'shared_url' } as const

/**
 * Where a start address with shared content should lead: the link reader with the link
 * filled in, or with nothing when no web address was shared. Null: this is no share.
 */
export function sharedRoute(search: string): string | null {
  const query = new URLSearchParams(search)
  const parts = [query.get(SHARE_PARAMS.url), query.get(SHARE_PARAMS.text), query.get(SHARE_PARAMS.title)]
  if (parts.every((part) => part === null)) return null
  // Most apps put the address into the text ("Look at this pin: https://pin.it/AbC").
  for (const part of parts) {
    const link = part ? linkIn(part) : null
    if (link) return `/recipes/import?link=${encodeURIComponent(link)}`
  }
  return '/recipes/import'
}

/** Call once, before the app draws. */
export function takeShare(): void {
  const route = sharedRoute(window.location.search)
  if (route === null) return
  window.history.replaceState(null, '', `${window.location.pathname}#${route}`)
}
