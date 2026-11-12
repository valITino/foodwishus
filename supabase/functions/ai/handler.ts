// The kitchen's helper as one HTTP handler: who may ask, what is asked, and the way
// from a pasted link to a recipe card. Everything it needs from outside (the web, the
// Claude API, the ticket counter) is handed in, so the whole thing runs in tests and in
// the pretend cloud exactly as it runs on Supabase.

import { ask, DEFAULT_MODEL, HelperError, type AskFetch } from './claude.ts'
import { SHOPPING_LIMITS, type HelperAnswer, type HelperFailure, type HelperRequest, type PantryNotes, type RecipeFromLink, type ShoppingCheck } from './contract.ts'
import { cleanLink, hostFamily, PageError, pageMeta, pageText, pinTarget, readPage, readPicture, recipeData, withoutTracking, type FetchLike } from './page.ts'
import { cardFromData, type Check, type RecipeCard } from './recipe.ts'
import { pantryNotesSkill } from './skills/pantry-notes.ts'
import { recipeCardSkill } from './skills/recipe-card.ts'
import { shoppingCheckSkill } from './skills/shopping-check.ts'

export type Ticket = { ok: true; left: number } | { ok: false; code: 'not_signed_in' | 'not_member' | 'limit' }

export interface HelperDeps {
  /** Fetches web pages and pictures. */
  fetch: FetchLike
  /** Talks to the Claude API. */
  askFetch: AskFetch
  /** The Claude API key, or null while none is set. */
  apiKey: string | null
  model?: string
  /**
   * Checks that the caller sits in a kitchen and takes one of today's tickets. Gets the
   * request's Authorization header and the project key the app sent along with it.
   */
  ticket: (authorization: string, apikey: string | null) => Promise<Ticket>
}

// The app is a web page on another address, so the browser asks first. Every header the
// Supabase client may send has to be on this list, or the browser refuses the call
// (tests/unit/ai.bundle.test.ts compares it with the client's own list).
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage', 'access-control-allow-methods': 'POST, OPTIONS' }

const json = (body: HelperAnswer, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
const refuse = (code: HelperFailure, status = 200): Response => json({ ok: false, code }, status)

const WORDS = {
  en: { servings: 'The page does not say for how many people this is.', asIs: 'Read from the page as it is: nothing translated, no units converted.' },
  de: { servings: 'Die Seite sagt nicht, für wie viele Personen das Rezept ist.', asIs: 'So von der Seite übernommen: nichts übersetzt, keine Einheiten umgerechnet.' },
}

const lines = (value: unknown, max: number, each: number = SHOPPING_LIMITS.line): string[] =>
  Array.isArray(value) ? value.filter((line): line is string => typeof line === 'string' && line.trim() !== '').map((line) => line.replace(/\s+/g, ' ').trim().slice(0, each)).slice(0, max) : []

function parse(body: unknown): HelperRequest | null {
  if (body === null || typeof body !== 'object') return null
  const raw = body as Record<string, unknown>
  const lang = raw.lang === 'de' ? 'de' : 'en'
  if (raw.job === 'shopping-check') {
    if (typeof raw.today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.today)) return null
    return { job: 'shopping-check', lang, today: raw.today, weekday: typeof raw.weekday === 'string' && /^[A-Za-z]{3,12}$/.test(raw.weekday) ? raw.weekday : '', meals: lines(raw.meals, SHOPPING_LIMITS.meals), cooked: lines(raw.cooked, SHOPPING_LIMITS.cooked), pantry: lines(raw.pantry, SHOPPING_LIMITS.pantry, 160), basket: lines(raw.basket, SHOPPING_LIMITS.basket, 130) }
  }
  if (raw.job === 'pantry-notes') {
    if (typeof raw.text !== 'string' || raw.text.trim() === '' || raw.text.length > SHOPPING_LIMITS.text) return null
    return { job: 'pantry-notes', lang, text: raw.text.trim(), known: lines(raw.known, SHOPPING_LIMITS.known, 80) }
  }
  if (raw.job !== 'recipe-from-link' || typeof raw.link !== 'string' || raw.link.length > 2000) return null
  return {
    job: 'recipe-from-link',
    link: raw.link,
    lang: raw.lang === 'de' ? 'de' : 'en',
    translate: raw.translate !== false,
    metric: raw.metric !== false,
    photo: raw.photo !== false,
    knownTags: Array.isArray(raw.knownTags) ? raw.knownTags.filter((tag): tag is string => typeof tag === 'string' && tag.length <= 24).slice(0, 40) : [],
  }
}

function base64(bytes: Uint8Array): string {
  let binary = ''
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  return btoa(binary)
}

/** A missing number of servings is worth a note, whoever wrote the card. Said once. */
function withServingsCheck(card: RecipeCard, lang: 'en' | 'de'): RecipeCard {
  if (card.servings !== null || card.checks.some((check) => check.about === 'servings')) return card
  const note: Check = { about: 'servings', note: WORDS[lang].servings }
  return { ...card, checks: [note, ...card.checks].slice(0, 4) }
}

async function recipeFromLink(request: RecipeFromLink, deps: HelperDeps, left: number): Promise<HelperAnswer> {
  const link = cleanLink(request.link)
  if (!link) return { ok: false, code: 'bad_link' }

  let page = await readPage(link, deps.fetch)
  // A pin is a picture with a link: the recipe lives on the page behind it.
  if (hostFamily(page.url) === 'pinterest') {
    const target = pinTarget(page.html, page.url)
    if (target) page = await readPage(new URL(target), deps.fetch)
  }

  const meta = pageMeta(page.html)
  const data = recipeData(page.html)
  const fromPage = data ? cardFromData(data) : null
  const source = { url: withoutTracking(page.url), site: meta.site ?? (hostFamily(page.url) || null) }

  let card: RecipeCard | null = null
  let by: 'helper' | 'page' = 'page'
  let helperFailed: HelperFailure | null = deps.apiKey ? null : 'helper_off'

  if (deps.apiKey) {
    const skill = recipeCardSkill
    const ask_ = { lang: request.lang, translate: request.translate, metric: request.metric, knownTags: request.knownTags, site: source.site, data: data ? JSON.stringify(data).slice(0, 30_000) : null, text: data ? null : pageText(page.html) }
    try {
      const answer = await ask({ apiKey: deps.apiKey, model: deps.model ?? DEFAULT_MODEL, system: skill.system(ask_), user: skill.user(ask_), schema: skill.schema, maxTokens: skill.maxTokens }, deps.askFetch)
      card = skill.read(answer)
      if (card) by = 'helper'
      else if (!fromPage) return { ok: false, code: 'not_a_recipe' }
    } catch (error) {
      if (!(error instanceof HelperError)) throw error
      // For the function's log: the owner sees a refused key or an outage there. Never the key itself.
      console.warn('helper did not answer:', error.message)
      helperFailed = 'helper_down'
    }
  }

  if (!card) {
    // No helper, or it did not answer: the page's own data, word for word, is still a card.
    if (!fromPage) return { ok: false, code: helperFailed ?? 'not_a_recipe' }
    card = { ...fromPage.card, checks: request.translate || request.metric ? [{ about: 'other', note: WORDS[request.lang].asIs }] : [] }
  }

  const image = request.photo ? (fromPage?.image ?? meta.image) : null
  const picture = image ? await readPicture(image, page.url, deps.fetch) : null
  return { ok: true, card: withServingsCheck(card, request.lang), source, photo: picture ? { type: picture.type, base64: base64(picture.bytes) } : null, by, left }
}

/** One question to the helper for a job that is nothing without it. Null: it did not answer. */
async function askSkill(deps: HelperDeps, skill: { system: string; user: string; schema: unknown; maxTokens: number }): Promise<unknown | null> {
  try {
    return await ask({ apiKey: deps.apiKey as string, model: deps.model ?? DEFAULT_MODEL, ...skill }, deps.askFetch)
  } catch (error) {
    if (!(error instanceof HelperError)) throw error
    console.warn('helper did not answer:', error.message)
    return null
  }
}

async function shoppingCheck(request: ShoppingCheck, deps: HelperDeps, left: number): Promise<HelperAnswer> {
  // Nothing planned: nothing to buy for, and nothing to ask.
  if (request.meals.length === 0) return { ok: true, items: [], note: '', left }
  if (!deps.apiKey) return { ok: false, code: 'helper_off' }
  const skill = shoppingCheckSkill
  const answer = await askSkill(deps, { system: skill.system(request), user: skill.user(request), schema: skill.schema, maxTokens: skill.maxTokens })
  const read = answer === null ? null : skill.read(answer)
  return read ? { ok: true, ...read, left } : { ok: false, code: 'helper_down' }
}

async function pantryNotes(request: PantryNotes, deps: HelperDeps, left: number): Promise<HelperAnswer> {
  if (!deps.apiKey) return { ok: false, code: 'helper_off' }
  const skill = pantryNotesSkill
  const answer = await askSkill(deps, { system: skill.system(request), user: skill.user(request), schema: skill.schema, maxTokens: skill.maxTokens })
  const read = answer === null ? null : skill.read(answer)
  return read ? { ok: true, lines: read, left } : { ok: false, code: 'helper_down' }
}

/** The handler. Every expected outcome is an answer with status 200; only a broken request is not. */
export function helperHandler(deps: HelperDeps): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (request.method !== 'POST') return refuse('bad_request', 405)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return refuse('bad_request', 400)
    }
    const asked = parse(body)
    if (!asked) return refuse('bad_request', 400)

    const authorization = request.headers.get('authorization') ?? ''
    if (!/^Bearer\s+\S+/i.test(authorization)) return refuse('not_signed_in', 401)
    const ticket = await deps.ticket(authorization, request.headers.get('apikey'))
    if (!ticket.ok) return refuse(ticket.code, ticket.code === 'limit' ? 200 : 403)

    try {
      if (asked.job === 'shopping-check') return json(await shoppingCheck(asked, deps, ticket.left))
      if (asked.job === 'pantry-notes') return json(await pantryNotes(asked, deps, ticket.left))
      return json(await recipeFromLink(asked, deps, ticket.left))
    } catch (error) {
      if (error instanceof PageError) return refuse(error.code)
      console.error('helper failed', error instanceof Error ? error.message : error)
      return refuse('helper_down')
    }
  }
}
