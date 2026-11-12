// From a recipe card the helper wrote to the dish form, and the hand-over between the
// two screens. The card's lines go through the same parsers as typed ones, so a dish
// read from a link is no different from one written by hand.

import { cleanLink, withoutTracking } from '../../../supabase/functions/ai/page.ts'
import type { Check, CheckTopic, RecipeCard } from '../../data/backend'
import { addTag, DEFAULT_SERVINGS, detectTimerMinutes, draftKey, emptyDraft, normalize, parseIngredientLine, type DishDraft } from './logic'

/** The web address in whatever was pasted or shared ("Look at this pin: https://pin.it/AbC"), or null. */
export function linkIn(text: string): string | null {
  return cleanLink(text)?.href ?? null
}

/** What makes two addresses the same page: tracking tails, "www." and a last slash do not count. */
function pageKey(link: string): string | null {
  const typed = cleanLink(link)
  const url = typed ? cleanLink(withoutTracking(typed.href)) : null
  return url ? `${url.hostname.toLowerCase().replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}${url.search}` : null
}

/** The dish that was already made from this page, if there is one. */
export function dishFromPage<T extends { recipe: { sourceUrl?: string } }>(dishes: T[], link: string): T | null {
  const key = pageKey(link)
  if (!key) return null
  return dishes.find((dish) => dish.recipe.sourceUrl !== undefined && pageKey(dish.recipe.sourceUrl) === key) ?? null
}

/** A step's own time as its timer, when it names one a kitchen timer makes sense for. */
function timerFor(step: string): string {
  const minutes = detectTimerMinutes(step)
  return minutes !== null && minutes >= 1 && minutes <= 240 ? String(minutes) : ''
}

/**
 * A tag the way this kitchen writes it: its own spelling when it has the tag already
 * ("Swiss", not "swiss"). A new one starts with a capital letter, unless the kitchen
 * mostly writes its tags small.
 */
export function kitchenTag(tag: string, knownTags: string[]): string {
  const own = knownTags.find((known) => normalize(known) === normalize(tag))
  if (own) return own
  const small = knownTags.filter((known) => /^\p{Ll}/u.test(known)).length
  const first = small * 2 > knownTags.length ? tag.charAt(0).toLowerCase() : tag.charAt(0).toUpperCase()
  return first + tag.slice(1)
}

/** The dish form, filled in from a card. `sourceUrl` is where the recipe really lives; `knownTags` are the kitchen's own. */
export function draftFromCard(card: RecipeCard, sourceUrl: string, knownTags: string[] = []): DishDraft {
  const blank = emptyDraft()
  const steps = card.steps.map((text) => ({ key: draftKey(), text, timerMinutes: timerFor(text) }))
  return {
    ...blank,
    name: card.name,
    description: card.description,
    course: card.course,
    effort: card.effort,
    tags: card.tags.reduce<string[]>((tags, tag) => addTag(tags, kitchenTag(tag, knownTags)), []),
    servings: card.servings ?? DEFAULT_SERVINGS,
    prepMinutes: card.prepMinutes ? String(card.prepMinutes) : '',
    cookMinutes: card.cookMinutes ? String(card.cookMinutes) : '',
    ingredients: card.ingredientLines.map((line) => ({ ...(parseIngredientLine(line) ?? { name: line }), key: draftKey() })),
    steps: steps.length > 0 ? steps : blank.steps,
    notes: card.notes,
    sourceUrl,
    kcal: card.kcalPerServing ? String(card.kcalPerServing) : '',
    // A number from a web page is somebody's estimate, and scaling it is ours.
    isEstimate: card.kcalPerServing !== null,
  }
}

/** The page's picture as a file, the way one from the gallery arrives. */
export function pictureFile(photo: { type: string; base64: string } | null): File | null {
  if (!photo) return null
  try {
    const bytes = Uint8Array.from(atob(photo.base64), (letter) => letter.charCodeAt(0))
    return new File([bytes], `cover.${photo.type.split('/')[1] ?? 'jpg'}`, { type: photo.type })
  } catch {
    return null
  }
}

/** What to call the place a recipe was read from: the site's own name, else its address. */
export function siteName(source: { url: string; site: string | null }): string {
  if (source.site === 'pinterest') return 'Pinterest'
  if (source.site) return source.site
  try {
    return new URL(source.url).hostname.replace(/^www\./, '')
  } catch {
    return source.url
  }
}

/** Which part of the dish form a note is about. Null: the dish as a whole. */
export function sectionFor(about: CheckTopic, showCalories: boolean): 'recipe' | 'ingredients' | 'steps' | 'calories' | null {
  if (about === 'servings' || about === 'times') return 'recipe'
  if (about === 'ingredients' || about === 'steps') return about
  if (about === 'calories') return showCalories ? 'calories' : null
  return null
}

/** Notes worth showing: none about calories for a kitchen that does not show them. */
export function shownChecks(checks: Check[], showCalories: boolean): Check[] {
  return checks.filter((check) => check.about !== 'calories' || showCalories)
}

// ------------------------------------------------------------- the hand-over --

/** What the link reader hands to the dish form. Kept in memory only: a picture cannot travel in an address. */
export interface Handover {
  draft: DishDraft
  cover: File | null
  /**
   * Set when a page was read: where from, by whom, what to look at, and the dish the
   * recipe book already has from that page. Not set when the form is just started with a source.
   */
  read: { site: string; by: 'helper' | 'page'; checks: Check[]; already: { id: string; name: string } | null } | null
}

const waiting = new Map<string, Handover>()
let handed = 0

/** Leave something for the dish form. Returns the ticket to open `/recipes/new?from=<ticket>` with. */
export function handOver(handover: Handover): string {
  // Only the newest one is ever picked up.
  waiting.clear()
  const ticket = `h${++handed}`
  waiting.set(ticket, handover)
  return ticket
}

export function handoverFor(ticket: string | null | undefined): Handover | null {
  return (ticket && waiting.get(ticket)) || null
}

export function dropHandover(ticket: string | null | undefined): void {
  if (ticket) waiting.delete(ticket)
}
