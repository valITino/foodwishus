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
  /** Estimate calories, protein, carbs and fat when the page does not give them. */
  nutrition: boolean
  /** Tags the kitchen already uses. */
  knownTags: string[]
}

/** What is missing for the planned meals, given what the pantry says. */
export interface ShoppingCheck {
  job: 'shopping-check'
  lang: 'en' | 'de'
  /** The kitchen's day, "2026-11-12", and its weekday in English. */
  today: string
  weekday: string
  /** The planned meals of the next days, one per line: "2026-11-13 (Friday): Rüeblisuppe: 500 g Rüebli; 1 Zwiebel". */
  meals: string[]
  /** What was cooked lately, in the same form: it tells what has probably been used up since a pantry note. */
  cooked: string[]
  /** The pantry, one thing per line: "Mehl: 1 kg (noted 3 days ago)". */
  pantry: string[]
  /** What is on the shopping list already. */
  basket: string[]
}

/** Turn what somebody wrote or dictated about what is at home into pantry lines. */
export interface PantryNotes {
  job: 'pantry-notes'
  lang: 'en' | 'de'
  text: string
  /** The names the pantry already uses. */
  known: string[]
}

/** Estimate a dish's nutrition per serving from its ingredients. */
export interface NutritionEstimate {
  job: 'nutrition-estimate'
  lang: 'en' | 'de'
  name: string
  servings: number
  /** One ingredient per line, amount first: "500 g Rüebli". */
  ingredients: string[]
}

export type HelperRequest = RecipeFromLink | ShoppingCheck | PantryNotes | NutritionEstimate

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
  | 'not_enough' // too little to go on (an estimate without amounts, or without ingredients)
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

export interface ShoppingSuggestion {
  name: string
  /** How much to buy, as a person would write it. Null when it cannot be said. */
  amount: string | null
  /** One sentence: which meal asks for it and what the pantry says. */
  reason: string
}

export interface ShoppingCheckResult {
  ok: true
  items: ShoppingSuggestion[]
  /** Something the cook should know about the check itself, or empty. */
  note: string
  left: number
}

export interface PantryNotesResult {
  ok: true
  lines: { name: string; amount: string | null }[]
  left: number
}

export interface NutritionEstimateResult {
  ok: true
  /** Per serving. Always an estimate. */
  kcal: number
  protein: number | null
  carbs: number | null
  fat: number | null
  /** How rough it is, when that is worth saying. */
  note: string
  left: number
}

export interface HelperRefusal {
  ok: false
  code: HelperFailure
}

export type HelperResult = RecipeFromLinkResult | ShoppingCheckResult | PantryNotesResult | NutritionEstimateResult
export type HelperAnswer = HelperResult | HelperRefusal

/** The answer each job gets. */
export type ResultOf<R extends HelperRequest> = R extends RecipeFromLink ? RecipeFromLinkResult : R extends ShoppingCheck ? ShoppingCheckResult : R extends PantryNotes ? PantryNotesResult : R extends NutritionEstimate ? NutritionEstimateResult : never

/** What a kitchen can send per request: enough for a full week and a full pantry, not for a book. */
export const SHOPPING_LIMITS = { meals: 30, cooked: 20, pantry: 200, basket: 100, line: 600, text: 2000, known: 200, items: 20 }

/** How many times a kitchen can ask the helper per day (a page read, a plan checked, pantry notes sorted). Each costs a fraction of a cent; the limit is against accidents. */
export const DAILY_TICKETS = 40
