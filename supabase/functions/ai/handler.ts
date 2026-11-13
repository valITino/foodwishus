// The kitchen's helper as one HTTP handler: who may ask, what is asked, and the way
// from a pasted link to a recipe card. Everything it needs from outside (the web, the
// Claude API, the ticket counter) is handed in, so the whole thing runs in tests and in
// the pretend cloud exactly as it runs on Supabase.

import { ask, DEFAULT_MODEL, HelperError, type AskFetch } from './claude.ts'
import { PHOTO_LIMITS, SHOPPING_LIMITS, type AssistantAsk, type AssistantTurn, type HelperAnswer, type HelperFailure, type HelperPhoto, type HelperRequest, type NutritionEstimate, type PantryNotes, type PantryPhoto, type RecipeFromLink, type RecipeFromPhoto, type RecipeFromText, type ShoppingCheck } from './contract.ts'
import { cleanLink, hostFamily, PageError, pageMeta, pageText, pinTarget, readPage, readPicture, recipeData, withoutTracking, type FetchLike } from './page.ts'
import { cardFromData, type Check, type RecipeCard } from './recipe.ts'
import { ASSISTANT_LIMITS, assistantSkill } from './skills/assistant.ts'
import { nutritionSkill } from './skills/nutrition.ts'
import { pantryNotesSkill } from './skills/pantry-notes.ts'
import { pantryPhotoSkill } from './skills/pantry-photo.ts'
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
  /** Another model for the assistant's talk, when the owner wants a stronger one there. */
  chatModel?: string
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
  en: { servings: 'The page does not say for how many people this is.', asIs: 'Read from the page as it is: nothing translated, no units converted.', estimated: 'The page gives no calories. The numbers are an estimate from the ingredients.' },
  de: { servings: 'Die Seite sagt nicht, für wie viele Personen das Rezept ist.', asIs: 'So von der Seite übernommen: nichts übersetzt, keine Einheiten umgerechnet.', estimated: 'Die Seite nennt keine Kalorien. Die Zahlen sind aus den Zutaten geschätzt.' },
}

const lines = (value: unknown, max: number, each: number = SHOPPING_LIMITS.line): string[] =>
  Array.isArray(value) ? value.filter((line): line is string => typeof line === 'string' && line.trim() !== '').map((line) => line.replace(/\s+/g, ' ').trim().slice(0, each)).slice(0, max) : []

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

/**
 * The photos of a request. Null: something that is no photo, or none where one is needed.
 * 'too_big': more or larger than the phone is meant to send. A photo is only looked at
 * as far as it takes to know it is base64: the picture itself is the AI's to read.
 */
function photos(value: unknown, max: number, needed: boolean): HelperPhoto[] | 'too_big' | null {
  if (value === undefined || value === null) return needed ? null : []
  if (!Array.isArray(value) || (needed && value.length === 0)) return null
  if (value.length > max) return 'too_big'
  const out: HelperPhoto[] = []
  let all = 0
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') return null
    const { type, base64 } = entry as Record<string, unknown>
    const kind = PHOTO_TYPES.find((name) => name === type)
    if (!kind || typeof base64 !== 'string' || base64.length < 100) return null
    if (base64.length > PHOTO_LIMITS.each) return 'too_big'
    if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+$/.test(base64.slice(0, 200)) || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64.slice(-200))) return null
    all += base64.length
    out.push({ type: kind, base64 })
  }
  return all > PHOTO_LIMITS.all ? 'too_big' : out
}

/** What a request asks for, tidied. Null: not a request. 'too_big': photos beyond the limits. */
function parse(body: unknown): HelperRequest | 'too_big' | null {
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
  if (raw.job === 'nutrition-estimate') {
    const servings = typeof raw.servings === 'number' && Number.isFinite(raw.servings) ? Math.round(raw.servings) : 0
    if (servings < 1 || servings > 99) return null
    return { job: 'nutrition-estimate', lang, name: typeof raw.name === 'string' ? raw.name.replace(/\s+/g, ' ').trim().slice(0, 80) : '', servings, ingredients: lines(raw.ingredients, 60, 140) }
  }
  const knownTags = Array.isArray(raw.knownTags) ? raw.knownTags.filter((tag): tag is string => typeof tag === 'string' && tag.length <= 24).slice(0, 40) : []
  if (raw.job === 'assistant') {
    const turns: AssistantTurn[] = []
    for (const entry of Array.isArray(raw.turns) ? raw.turns.slice(-ASSISTANT_LIMITS.turns) : []) {
      if (entry === null || typeof entry !== 'object') continue
      const turn = entry as Record<string, unknown>
      const text = typeof turn.text === 'string' ? turn.text.trim().slice(0, turn.who === 'fork' ? ASSISTANT_LIMITS.answer : ASSISTANT_LIMITS.turn) : ''
      if (text !== '' && (turn.who === 'me' || turn.who === 'fork')) turns.push({ who: turn.who, text })
    }
    // A talk ends with the person's question, or there is nothing to answer.
    if (turns.at(-1)?.who !== 'me') return null
    const kitchen = raw.kitchen !== null && typeof raw.kitchen === 'object' ? (raw.kitchen as Record<string, unknown>) : {}
    if (typeof kitchen.today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(kitchen.today)) return null
    const shown = photos(raw.photos, PHOTO_LIMITS.withQuestion, false)
    if (shown === null || shown === 'too_big') return shown
    const L = ASSISTANT_LIMITS
    return {
      job: 'assistant',
      lang,
      turns,
      kitchen: {
        today: kitchen.today,
        weekday: typeof kitchen.weekday === 'string' && /^[A-Za-z]{3,12}$/.test(kitchen.weekday) ? kitchen.weekday : '',
        calories: kitchen.calories === true,
        dishes: lines(kitchen.dishes, L.dishes, L.line),
        plan: lines(kitchen.plan, L.plan, L.line),
        wishes: lines(kitchen.wishes, L.wishes, L.line),
        eaten: lines(kitchen.eaten, L.eaten, L.line),
        pantry: lines(kitchen.pantry, L.pantry, 160),
        basket: lines(kitchen.basket, L.basket, 130),
      },
      // Recipes keep their line breaks: they are read as ingredients and steps.
      recipes: Array.isArray(raw.recipes) ? raw.recipes.filter((recipe): recipe is string => typeof recipe === 'string' && recipe.trim() !== '').map((recipe) => recipe.trim().slice(0, L.recipe)).slice(0, L.recipes) : [],
      ...(shown.length > 0 ? { photos: shown } : {}),
    }
  }
  if (raw.job === 'pantry-photo' || raw.job === 'recipe-from-photo') {
    const shown = photos(raw.photos, PHOTO_LIMITS.photos, true)
    if (shown === null || shown === 'too_big') return shown
    if (raw.job === 'pantry-photo') return { job: 'pantry-photo', lang, photos: shown, known: lines(raw.known, SHOPPING_LIMITS.known, 80) }
    return { job: 'recipe-from-photo', lang, photos: shown, translate: raw.translate !== false, metric: raw.metric !== false, nutrition: raw.nutrition === true, knownTags }
  }
  if (raw.job === 'recipe-from-text') {
    if (typeof raw.text !== 'string' || raw.text.trim().length < 20 || raw.text.length > 6000) return null
    return { job: 'recipe-from-text', lang, text: raw.text.trim(), nutrition: raw.nutrition === true, knownTags }
  }
  if (raw.job !== 'recipe-from-link' || typeof raw.link !== 'string' || raw.link.length > 2000) return null
  return {
    job: 'recipe-from-link',
    link: raw.link,
    lang: raw.lang === 'de' ? 'de' : 'en',
    translate: raw.translate !== false,
    metric: raw.metric !== false,
    photo: raw.photo !== false,
    // An app from before this switch does not send it: for that app nothing is estimated.
    nutrition: raw.nutrition === true,
    knownTags,
  }
}

function base64(bytes: Uint8Array): string {
  let binary = ''
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  return btoa(binary)
}

/** Numbers the helper estimated are said to be an estimate, in the same words every time. Said once. */
function withEstimateCheck(card: RecipeCard, lang: 'en' | 'de'): RecipeCard {
  if (!card.nutritionEstimated) return card
  const note: Check = { about: 'calories', note: WORDS[lang].estimated }
  return { ...card, checks: [...card.checks.filter((check) => check.about !== 'calories'), note].slice(-4) }
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
    const ask_ = { lang: request.lang, translate: request.translate, metric: request.metric, nutrition: request.nutrition, knownTags: request.knownTags, site: source.site, data: data ? JSON.stringify(data).slice(0, 30_000) : null, text: data ? null : pageText(page.html) }
    try {
      const answer = await ask({ apiKey: deps.apiKey, model: deps.model ?? DEFAULT_MODEL, system: skill.system(ask_), user: skill.user(ask_), schema: skill.schema, maxTokens: skill.maxTokens }, deps.askFetch)
      card = skill.read(answer)
      // Without the switch nothing is an estimate, whatever came back.
      if (card && card.nutritionEstimated && !request.nutrition) card = { ...card, kcalPerServing: null, proteinPerServing: null, carbsPerServing: null, fatPerServing: null, nutritionEstimated: false }
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
  return { ok: true, card: withServingsCheck(withEstimateCheck(card, request.lang), request.lang), source, photo: picture ? { type: picture.type, base64: base64(picture.bytes) } : null, by, left }
}

/** One question to the helper for a job that is nothing without it. Null: it did not answer. */
async function askSkill(deps: HelperDeps, skill: { system: string; user: string; schema: unknown; maxTokens: number; before?: { role: 'user' | 'assistant'; content: string }[]; images?: HelperPhoto[]; model?: string }): Promise<unknown | null> {
  try {
    const { model, ...question } = skill
    return await ask({ apiKey: deps.apiKey as string, model: model ?? deps.model ?? DEFAULT_MODEL, ...question }, deps.askFetch)
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

async function nutritionEstimate(request: NutritionEstimate, deps: HelperDeps, left: number): Promise<HelperAnswer> {
  // Nothing to add up: said without asking anybody.
  if (request.ingredients.length === 0) return { ok: false, code: 'not_enough' }
  if (!deps.apiKey) return { ok: false, code: 'helper_off' }
  const skill = nutritionSkill
  const answer = await askSkill(deps, { system: skill.system(request), user: skill.user(request), schema: skill.schema, maxTokens: skill.maxTokens })
  const read = answer === null ? null : skill.read(answer)
  if (!read) return { ok: false, code: 'helper_down' }
  if (read.kcal === null) return { ok: false, code: 'not_enough' }
  return { ok: true, ...read, left }
}

/** A question to Fork, the kitchen assistant. The phone brings the kitchen along; nothing is kept here. */
async function assistant(request: AssistantAsk, deps: HelperDeps, left: number): Promise<HelperAnswer> {
  if (!deps.apiKey) return { ok: false, code: 'helper_off' }
  const skill = assistantSkill
  const answer = await askSkill(deps, { system: skill.system(request), before: skill.history(request.turns), user: skill.user(request), images: request.photos, schema: skill.schema, maxTokens: skill.maxTokens, model: deps.chatModel })
  const read = answer === null ? null : skill.read(answer, request)
  return read ? { ok: true, ...read, left } : { ok: false, code: 'helper_down' }
}

/** What is at home, from photos of it. Lines to look over: the app saves nothing before a person has. */
async function pantryPhoto(request: PantryPhoto, deps: HelperDeps, left: number): Promise<HelperAnswer> {
  if (!deps.apiKey) return { ok: false, code: 'helper_off' }
  const skill = pantryPhotoSkill
  const answer = await askSkill(deps, { system: skill.system(request), user: skill.user(request), images: request.photos, schema: skill.schema, maxTokens: skill.maxTokens })
  const read = answer === null ? null : skill.read(answer)
  return read ? { ok: true, ...read, left } : { ok: false, code: 'helper_down' }
}

/** A recipe written out in words (by the assistant) or shown in photos, as a card for the dish form. */
async function recipeFromText(request: RecipeFromText | RecipeFromPhoto, deps: HelperDeps, left: number): Promise<HelperAnswer> {
  if (!deps.apiKey) return { ok: false, code: 'helper_off' }
  const skill = recipeCardSkill
  const common = { lang: request.lang, nutrition: request.nutrition, knownTags: request.knownTags, site: null, data: null }
  const ask_ = request.job === 'recipe-from-photo' ? { ...common, translate: request.translate, metric: request.metric, text: null, pictured: request.photos.length } : { ...common, translate: true, metric: true, text: request.text, written: true }
  const answer = await askSkill(deps, { system: skill.system(ask_), user: skill.user(ask_), images: request.job === 'recipe-from-photo' ? request.photos : undefined, schema: skill.schema, maxTokens: skill.maxTokens })
  if (answer === null) return { ok: false, code: 'helper_down' }
  let card = skill.read(answer)
  if (!card) return { ok: false, code: 'not_a_recipe' }
  if (card.nutritionEstimated && !request.nutrition) card = { ...card, kcalPerServing: null, proteinPerServing: null, carbsPerServing: null, fatPerServing: null, nutritionEstimated: false }
  return { ok: true, card: withServingsCheck(withEstimateCheck(card, request.lang), request.lang), left }
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
    // Too many or too large photos: an answer the app has words for, and no ticket taken.
    if (asked === 'too_big') return refuse('too_big')

    const authorization = request.headers.get('authorization') ?? ''
    if (!/^Bearer\s+\S+/i.test(authorization)) return refuse('not_signed_in', 401)
    const ticket = await deps.ticket(authorization, request.headers.get('apikey'))
    if (!ticket.ok) return refuse(ticket.code, ticket.code === 'limit' ? 200 : 403)

    try {
      if (asked.job === 'shopping-check') return json(await shoppingCheck(asked, deps, ticket.left))
      if (asked.job === 'pantry-notes') return json(await pantryNotes(asked, deps, ticket.left))
      if (asked.job === 'nutrition-estimate') return json(await nutritionEstimate(asked, deps, ticket.left))
      if (asked.job === 'assistant') return json(await assistant(asked, deps, ticket.left))
      if (asked.job === 'recipe-from-text' || asked.job === 'recipe-from-photo') return json(await recipeFromText(asked, deps, ticket.left))
      if (asked.job === 'pantry-photo') return json(await pantryPhoto(asked, deps, ticket.left))
      return json(await recipeFromLink(asked, deps, ticket.left))
    } catch (error) {
      if (error instanceof PageError) return refuse(error.code)
      console.error('helper failed', error instanceof Error ? error.message : error)
      return refuse('helper_down')
    }
  }
}
