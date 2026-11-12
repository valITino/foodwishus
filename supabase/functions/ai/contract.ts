// What the app sends to the kitchen's helper and what comes back. The app imports these
// types, the function implements them, and the pretend cloud runs the same handler, so
// the three cannot drift apart.

import type { RecipeCard } from './recipe.ts'

export type { Check, CheckTopic, RecipeCard } from './recipe.ts'

export interface RecipeFromLink {
  job: 'recipe-from-link'
  /** Whatever was pasted: a link, with or without https://, or a sentence with a link in it. */
  link: string
  lang: 'en' | 'de'
  /** Write the card in `lang` even when the page is in another language. */
  translate: boolean
  /** Convert cups, ounces and Fahrenheit. */
  metric: boolean
  /** Bring the page's picture along as the cover. */
  photo: boolean
  /** Tags the kitchen already uses. */
  knownTags: string[]
}

export type HelperRequest = RecipeFromLink

export type HelperFailure =
  | 'bad_request'
  | 'not_signed_in' // no login came with the request
  | 'not_member' // a login without a seat in the kitchen
  | 'limit' // today's tickets are used up
  | 'bad_link' // nothing in the text looks like a web address
  | 'blocked' // an address that is not a public page
  | 'unreachable' // the page did not answer
  | 'too_big'
  | 'not_a_page' // a PDF, a picture, a download
  | 'not_a_recipe' // a page, but no recipe on it
  | 'helper_off' // no key is set, and the page has no recipe data of its own
  | 'helper_down' // the helper did not answer, and the page has no recipe data of its own

export interface RecipeFromLinkResult {
  ok: true
  card: RecipeCard
  /** Where the recipe really lives (after redirects, and behind a pin). */
  source: { url: string; site: string | null }
  photo: { type: string; base64: string } | null
  /** "helper": written by the AI. "page": the page's own data, word for word. */
  by: 'helper' | 'page'
  /** How many more the kitchen can read today. */
  left: number
}

export interface HelperRefusal {
  ok: false
  code: HelperFailure
}

export type HelperAnswer = RecipeFromLinkResult | HelperRefusal

/** How many pages a kitchen can have read per day. Each costs a fraction of a cent; the limit is against accidents. */
export const DAILY_TICKETS = 40
