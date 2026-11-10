// The thinking behind the Recipe Book, kept free of React and the database so every
// rule can be unit-tested: reading typed ingredients, scaling and formatting amounts,
// times, menu totals, search and sorting.

import type { Course, Dish, Effort, ID, Ingredient, Menu, MenuCourse, Nutrition, Recipe, Step } from '../../data/types'

export type Lang = 'en' | 'de'

// ------------------------------------------------------------------ text --

/** Lower case, accents removed, so "Rösti" is found by "rosti". */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

const words = (text: string): string[] => normalize(text).split(/[^a-z0-9]+/).filter(Boolean)

// --------------------------------------------------------------- numbers --

const GLYPHS: Record<string, number> = {
  '½': 1 / 2,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 1 / 4,
  '¾': 3 / 4,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
}
const GLYPH_CLASS = '½⅓⅔¼¾⅛⅜⅝⅞'

/**
 * Reads what people type for an amount: "2", "1.5", "1,5", "1/2", "1 1/2", "½", "1½".
 * Returns undefined for anything that is not a positive number.
 */
export function parseQuantity(input: string): number | undefined {
  const text = input.trim()
  if (!text) return undefined
  let match = text.match(new RegExp(`^(\\d+)?\\s*([${GLYPH_CLASS}])$`))
  if (match) return Number(match[1] ?? 0) + GLYPHS[match[2]]
  match = text.match(/^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/)
  if (match) {
    const bottom = Number(match[3])
    if (!bottom) return undefined
    return Number(match[1] ?? 0) + Number(match[2]) / bottom
  }
  if (/^\d+(?:[.,]\d+)?$/.test(text)) return Number(text.replace(',', '.'))
  return undefined
}

/** A number typed into a form field (minutes, kcal, grams). Empty means "not known", never 0. */
export function parseAmount(input: string): number | undefined {
  const text = input.trim().replace(',', '.')
  if (!text || !/^\d*\.?\d+$/.test(text)) return undefined
  const value = Number(text)
  return Number.isFinite(value) ? value : undefined
}

const trimNumber = (value: number, places = 2): string => String(Number(value.toFixed(places)))

/** The value for an amount field, in a form the same field can read back. */
export function quantityInputValue(quantity: number | undefined): string {
  if (quantity === undefined) return ''
  const whole = Math.floor(quantity)
  const rest = quantity - whole
  for (const [top, bottom] of [
    [1, 3],
    [2, 3],
    [1, 6],
    [5, 6],
  ]) {
    if (Math.abs(rest - top / bottom) < 0.004) return `${whole ? `${whole} ` : ''}${top}/${bottom}`
  }
  return trimNumber(quantity, 3)
}

// ----------------------------------------------------- typed ingredients --

// Units we recognise when someone types "200 g flour". Compared after normalize().
const UNIT_WORDS = new Set(
  (
    'g gr gram grams gramm kg mg ml l dl cl liter litre liters litres ' +
    'tl el tsp tbsp teaspoon teaspoons tablespoon tablespoons essloffel teeloffel cup cups tasse tassen ' +
    'prise prisen pinch pinches msp stk stuck piece pieces pc pcs zehe zehen clove cloves bund bunch ' +
    'dose dosen can cans tin tins packung packungen pkg pack packs packchen scheibe scheiben slice slices ' +
    'oz lb lbs handful handvoll zweig zweige sprig sprigs blatt blatter leaf leaves glas jar becher ' +
    'stange stangen stick sticks tropfen drop drops schuss dash wurfel cube cubes knolle head ' +
    'flasche bottle beutel bag'
  ).split(' '),
)

const LEADING_NUMBER = new RegExp(`^(\\d+\\s+\\d+\\s*\\/\\s*\\d+|\\d+\\s*\\/\\s*\\d+|\\d+(?:[.,]\\d+)?\\s*[${GLYPH_CLASS}]?|[${GLYPH_CLASS}])`)

/**
 * Turns one typed line into an ingredient: "200 g flour", "1 1/2 cups milk", "2 eggs",
 * "1½ dl Rahm", "salt". A range such as "2-3 tomatoes" stays whole in the name, because
 * we could not scale it honestly.
 */
export function parseIngredientLine(line: string): Ingredient | null {
  const text = line
    .replace(/^\s*(?:[-*•–]|\d+[.)](?=\s))\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return null
  if (/^\d+(?:[.,]\d+)?\s*(?:-|–|to\b|bis\b)\s*\d/.test(text)) return { name: text }

  const number = text.match(LEADING_NUMBER)
  if (!number) return { name: text }
  const quantity = parseQuantity(number[1])
  let rest = text.slice(number[1].length).trim()
  if (quantity === undefined || !rest) return { name: text }

  let unit: string | undefined
  const first = rest.match(/^([^\s\d]+)(?:\s+(.*))?$/)
  if (first && first[2] && UNIT_WORDS.has(normalize(first[1].replace(/\.$/, '')))) {
    unit = first[1].replace(/\.$/, '')
    rest = first[2].trim()
  }
  rest = rest.replace(/^(?:of|von)\s+/i, '')
  if (!rest) return { name: text }
  return unit ? { quantity, unit, name: rest } : { quantity, name: rest }
}

/** A pasted list, one ingredient per line. */
export function parseIngredientList(text: string): Ingredient[] {
  return text
    .split(/\r?\n/)
    .map(parseIngredientLine)
    .filter((i): i is Ingredient => i !== null)
}

// ------------------------------------------------- scaling and formatting --

/** How much bigger or smaller the meal is than the recipe was written for. */
export function scaleFactor(baseServings: number | undefined, servings: number): number {
  const base = baseServings && baseServings > 0 ? baseServings : 1
  return servings / base
}

export function scaleQuantity(quantity: number, baseServings: number | undefined, servings: number): number {
  return quantity * scaleFactor(baseServings, servings)
}

type UnitKind = 'g' | 'ml' | 'kg' | 'l' | 'dl' | 'cl' | 'count'

function unitKind(unit: string | undefined): UnitKind {
  switch (normalize(unit ?? '').replace(/\.$/, '')) {
    case 'g':
    case 'gr':
    case 'gram':
    case 'grams':
    case 'gramm':
      return 'g'
    case 'ml':
      return 'ml'
    case 'kg':
      return 'kg'
    case 'l':
    case 'liter':
    case 'litre':
    case 'liters':
    case 'litres':
      return 'l'
    case 'dl':
      return 'dl'
    case 'cl':
      return 'cl'
    default:
      return 'count'
  }
}

const roundTo = (value: number, step: number): number => Math.max(step, Math.round(value / step) * step)

function decimal(value: number, lang: Lang, places = 2): string {
  const text = trimNumber(value, places)
  return lang === 'de' ? text.replace('.', ',') : text
}

const FRACTIONS: [number, string][] = [
  [0, ''],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [1 / 2, '½'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
  [1, ''],
]

/** Spoons, cups, eggs: the nearest kitchen fraction, such as ½, 1½ or ⅓. */
function kitchenFraction(value: number): string {
  if (value >= 20) return String(Math.round(value))
  if (value < 0.19) return '⅛'
  const whole = Math.floor(value)
  const rest = value - whole
  let best = FRACTIONS[0]
  for (const candidate of FRACTIONS) {
    if (Math.abs(candidate[0] - rest) < Math.abs(best[0] - rest)) best = candidate
  }
  const count = best[0] === 1 ? whole + 1 : whole
  return `${count || ''}${best[1]}` || '⅛'
}

/** An amount exactly as the recipe says it, only prettier: 0.5 becomes ½, 0.33 becomes ⅓. */
function exactFraction(value: number, lang: Lang): string {
  const whole = Math.floor(value)
  const rest = value - whole
  for (const [fraction, glyph] of [...FRACTIONS.slice(1, 6), [1 / 8, '⅛'] as [number, string]]) {
    if (Math.abs(fraction - rest) < 0.02) return `${whole || ''}${glyph}`
  }
  return decimal(value, lang)
}

function grams(value: number, small: string, big: string, lang: Lang): { quantity: string; unit: string } {
  if (value >= 1000) return { quantity: decimal(roundTo(value / 1000, 0.05), lang), unit: big }
  const step = value < 10 ? 0.5 : value < 50 ? 1 : value < 500 ? 5 : 10
  return { quantity: decimal(roundTo(value, step), lang, 1), unit: small }
}

export interface Amount {
  quantity: string
  unit?: string
}

/**
 * An amount ready to read. With scaled = false it is shown as written. Once scaled,
 * grams and millilitres are rounded to what a kitchen scale can do (and roll over into
 * kg and l), and everything else snaps to the nearest kitchen fraction.
 */
export function formatAmount(value: number, unit: string | undefined, lang: Lang, scaled = true): Amount {
  const kind = unitKind(unit)
  if (!scaled) {
    return { quantity: kind === 'count' ? exactFraction(value, lang) : decimal(value, lang), unit: unit || undefined }
  }
  switch (kind) {
    case 'g':
      return grams(value, unit as string, 'kg', lang)
    case 'ml':
      return grams(value, unit as string, 'l', lang)
    case 'kg':
      return value < 1 ? grams(value * 1000, 'g', unit as string, lang) : { quantity: decimal(roundTo(value, 0.05), lang), unit }
    case 'l':
      return value < 1 ? grams(value * 1000, 'ml', unit as string, lang) : { quantity: decimal(roundTo(value, 0.05), lang), unit }
    case 'dl':
      if (value >= 10) return { quantity: decimal(roundTo(value / 10, 0.05), lang), unit: 'l' }
      return { quantity: decimal(roundTo(value, value < 1 ? 0.25 : 0.5), lang), unit }
    case 'cl':
      if (value >= 100) return { quantity: decimal(roundTo(value / 100, 0.05), lang), unit: 'l' }
      return { quantity: decimal(roundTo(value, 0.5), lang, 1), unit }
    default:
      return { quantity: kitchenFraction(value), unit: unit || undefined }
  }
}

/** One ingredient line for a given factor: { amount: "1½ tbsp", name: "olive oil" }. */
export function formatIngredient(ingredient: Ingredient, factor: number, lang: Lang): { amount: string; name: string } {
  if (ingredient.quantity === undefined) return { amount: ingredient.unit ?? '', name: ingredient.name }
  const scaled = Math.abs(factor - 1) > 1e-9
  const { quantity, unit } = formatAmount(ingredient.quantity * factor, ingredient.unit, lang, scaled)
  return { amount: unit ? `${quantity} ${unit}` : quantity, name: ingredient.name }
}

// ------------------------------------------------------------------ time --

/** Prep plus cooking, or null when the recipe gives neither. */
export function totalMinutes(recipe: Pick<Recipe, 'prepMinutes' | 'cookMinutes'>): number | null {
  const total = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0)
  return total > 0 ? total : null
}

/** 45 → "45 min", 75 → "1 h 15 min" (German: "1 Std. 15 Min."). */
export function formatDuration(minutes: number, lang: Lang): string {
  const total = Math.max(0, Math.round(minutes))
  const hours = Math.floor(total / 60)
  const rest = total % 60
  const min = lang === 'de' ? 'Min.' : 'min'
  const hour = lang === 'de' ? 'Std.' : 'h'
  if (!hours) return `${rest} ${min}`
  return rest ? `${hours} ${hour} ${rest} ${min}` : `${hours} ${hour}`
}

/** A step timer's length: 720 → "12 min", 90 → "1 min 30 s", 30 → "30 s". */
export function formatTimer(seconds: number, lang: Lang): string {
  const total = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  const sec = lang === 'de' ? 'Sek.' : 's'
  if (!minutes) return `${rest} ${sec}`
  return rest ? `${formatDuration(minutes, lang)} ${rest} ${sec}` : formatDuration(minutes, lang)
}

/** A countdown: 754000 ms → "12:34", and "1:02:03" past the hour. Rounds up, so it ends on 0:00. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

/**
 * Spots a duration in a step's text ("simmer for 20 minutes", "1 Stunde ruhen lassen")
 * so the editor can offer a timer. Returns minutes, or null. A range gives its lower end.
 */
export function detectTimerMinutes(text: string): number | null {
  const match = normalize(text).match(
    /(\d+(?:[.,]\d+)?)(?:\s*(?:-|–|to|bis)\s*\d+(?:[.,]\d+)?)?\s*(minuten|minutes|minute|mins|min|stunden|stunde|std|hours|hour|hrs|hr|h|sekunden|sekunde|seconds|second|secs|sec|sek)\b/,
  )
  if (!match) return null
  const value = Number(match[1].replace(',', '.'))
  if (!value) return null
  const unit = match[2]
  if (unit.startsWith('s') && !unit.startsWith('st')) return Number((value / 60).toFixed(2))
  if (unit.startsWith('h') || unit.startsWith('st')) return value * 60
  return value
}

// ---------------------------------------------------------------- search --

/** Every word of the query must appear in the name, a tag, the description or an ingredient. */
export function matchesDish(dish: Pick<Dish, 'name' | 'tags' | 'description' | 'recipe'>, query: string): boolean {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const haystack = normalize([dish.name, dish.description ?? '', ...dish.tags, ...(dish.recipe.ingredients ?? []).map((i) => i.name)].join('\n'))
  return terms.every((term) => haystack.includes(term))
}

/**
 * When a dish was found through an ingredient or tag rather than its name, say which one,
 * so the result explains itself ("With Parmesan").
 */
export function matchReason(dish: Pick<Dish, 'name' | 'tags' | 'recipe'>, query: string): string | null {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return null
  const name = normalize(dish.name)
  const missing = terms.filter((term) => !name.includes(term))
  if (missing.length === 0) return null
  const candidates = [...(dish.recipe.ingredients ?? []).map((i) => i.name), ...dish.tags]
  return candidates.find((text) => missing.some((term) => normalize(text).includes(term))) ?? null
}

export type DishSort = 'az' | 'newest' | 'quickest' | 'lightest'

const byName = (a: { name: string }, b: { name: string }) => normalize(a.name).localeCompare(normalize(b.name)) || a.name.localeCompare(b.name)

/** Unknown values always go last, whatever the direction. */
function byNumber<T extends { name: string }>(value: (item: T) => number | null | undefined) {
  return (a: T, b: T) => {
    const x = value(a)
    const y = value(b)
    if (x == null && y == null) return byName(a, b)
    if (x == null) return 1
    if (y == null) return -1
    return x - y || byName(a, b)
  }
}

export function sortDishes<T extends Pick<Dish, 'name' | 'createdAt' | 'recipe' | 'nutrition'>>(dishes: T[], sort: DishSort): T[] {
  const list = [...dishes]
  switch (sort) {
    case 'newest':
      return list.sort((a, b) => (a.createdAt === b.createdAt ? byName(a, b) : a.createdAt < b.createdAt ? 1 : -1))
    case 'quickest':
      return list.sort(byNumber((d) => totalMinutes(d.recipe)))
    case 'lightest':
      return list.sort(byNumber((d) => d.nutrition.kcalPerServing))
    default:
      return list.sort(byName)
  }
}

/** Menus sort by name or by age; they have no time or calories of their own. */
export function sortMenus<T extends Pick<Menu, 'name' | 'createdAt'>>(menus: T[], sort: DishSort): T[] {
  const list = [...menus]
  if (sort === 'newest') return list.sort((a, b) => (a.createdAt === b.createdAt ? byName(a, b) : a.createdAt < b.createdAt ? 1 : -1))
  return list.sort(byName)
}

export interface DishQuery {
  query: string
  course: Course | null
  sort: DishSort
  showArchived: boolean
}

export function filterDishes<T extends Dish>(dishes: T[], q: DishQuery): T[] {
  return sortDishes(
    dishes.filter((d) => (q.showArchived || !d.archived) && (!q.course || d.course === q.course) && matchesDish(d, q.query)),
    q.sort,
  )
}

export const COURSE_ORDER: readonly Course[] = ['starter', 'main', 'side', 'dessert', 'breakfast', 'snack', 'drink']

/** The courses that have at least one dish, in menu order: the only filter chips worth showing. */
export function coursesInUse(dishes: Pick<Dish, 'course'>[]): Course[] {
  const used = new Set(dishes.map((d) => d.course))
  return COURSE_ORDER.filter((course) => used.has(course))
}

// ----------------------------------------------------------------- menus --

export function orderedCourses(menu: Pick<Menu, 'courses'>): MenuCourse[] {
  return [...menu.courses].sort((a, b) => a.order - b.order)
}

export interface Tally {
  /** The sum of everything that is known. */
  total: number
  known: number
  unknown: number
}

const tally = (values: (number | null | undefined)[]): Tally => {
  const known = values.filter((v): v is number => v != null)
  return { total: known.reduce((sum, v) => sum + v, 0), known: known.length, unknown: values.length - known.length }
}

type CourseDish = Pick<Dish, 'recipe' | 'nutrition'> | null | undefined

/** Menu calories: the sum of its courses, per person. Unknown courses are counted, never treated as 0. */
export function menuCalories(dishes: CourseDish[]): Tally {
  return tally(dishes.map((d) => d?.nutrition.kcalPerServing))
}

/** Total time of a menu: every course's prep and cooking added up. */
export function menuMinutes(dishes: CourseDish[]): Tally {
  return tally(dishes.map((d) => (d ? totalMinutes(d.recipe) : null)))
}

/** Menus are found by their own name, their description, or the name of a dish in them. */
export function matchesMenu(menu: Pick<Menu, 'name' | 'description'>, dishNames: string[], query: string): boolean {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const haystack = normalize([menu.name, menu.description ?? '', ...dishNames].join('\n'))
  return terms.every((term) => haystack.includes(term))
}

const TABLE_RANK: Record<Course, number> = { starter: 0, main: 1, side: 2, dessert: 3, breakfast: 4, snack: 4, drink: 4 }

/**
 * Where a newly picked dish goes in a menu. While the menu still runs starter, main,
 * dessert, the new dish slots into its natural place. Once the order has been changed by
 * hand we stop guessing and add it at the end.
 */
export function insertByCourse<T extends { course: Course }>(list: T[], item: T): T[] {
  const ranks = list.map((entry) => TABLE_RANK[entry.course])
  const natural = ranks.every((rank, i) => i === 0 || ranks[i - 1] <= rank)
  if (!natural) return [...list, item]
  let at = list.length
  while (at > 0 && ranks[at - 1] > TABLE_RANK[item.course]) at -= 1
  return [...list.slice(0, at), item, ...list.slice(at)]
}

// ------------------------------------------------------------- cook mode --

// Words that say how much or in what state, not what: they must not link a step to an ingredient.
const FILLER = new Set(
  (
    'a an the and or of in to on at by it is as up for with into from some few little ' +
    'fresh large small medium big ground chopped finely roughly sliced diced grated dried whole cold warm hot ripe ' +
    'pinch handful piece pieces bunch dash splash generous ' +
    'und oder mit der die das den dem ein eine einen im am an zu um es je so da fur von aus ' +
    'frisch frische frischer gross grosse grosser kleine klein kleiner gehackt gewurfelt gerieben fein grob gemahlen getrocknet kalt kalte warm reif reife ' +
    'prise handvoll stuck bund schuss etwas wenig paar'
  ).split(' '),
)

function sameWord(a: string, b: string): boolean {
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return short.length >= 3 && long.length - short.length <= 2 && long.startsWith(short)
}

/**
 * Which ingredients a step talks about, by index: "Whisk the eggs with the sugar" finds
 * "3 eggs" and "120 g sugar". Cook mode shows them right under the step. Only the name
 * counts, not what comes after a comma ("veal, cut into strips" is found by "veal").
 */
export function ingredientsForStep(stepText: string, ingredients: Pick<Ingredient, 'name'>[]): number[] {
  const stepWords = words(stepText).filter((w) => !FILLER.has(w))
  const found: number[] = []
  ingredients.forEach((ingredient, index) => {
    const names = words(ingredient.name.split(/[,(]/)[0]).filter((w) => w.length >= 2 && !FILLER.has(w) && !/^\d+$/.test(w))
    if (names.some((name) => stepWords.some((word) => sameWord(name, word)))) found.push(index)
  })
  return found
}

// ------------------------------------------------------------ the editor --

export interface DraftIngredient extends Ingredient {
  key: string
}

export interface DraftStep {
  key: string
  text: string
  /** As typed. Empty means no timer. */
  timerMinutes: string
  photoId?: ID
}

/** The dish form. Numbers stay as typed text until saving, so an empty field can mean "unknown". */
export interface DishDraft {
  name: string
  description: string
  course: Course
  effort: Effort | null
  tags: string[]
  coverPhotoId: ID | null
  icon: string | null
  servings: number
  prepMinutes: string
  cookMinutes: string
  ingredients: DraftIngredient[]
  steps: DraftStep[]
  notes: string
  sourceUrl: string
  kcal: string
  protein: string
  carbs: string
  fat: string
  isEstimate: boolean
}

let keyCounter = 0
export const draftKey = (): string => `k${++keyCounter}`

const numberText = (value: number | undefined): string => (value === undefined ? '' : trimNumber(value))

export const DEFAULT_SERVINGS = 2

export function emptyDraft(): DishDraft {
  return {
    name: '',
    description: '',
    course: 'main',
    effort: null,
    tags: [],
    coverPhotoId: null,
    icon: 'cloche',
    servings: DEFAULT_SERVINGS,
    prepMinutes: '',
    cookMinutes: '',
    ingredients: [],
    steps: [{ key: draftKey(), text: '', timerMinutes: '' }],
    notes: '',
    sourceUrl: '',
    kcal: '',
    protein: '',
    carbs: '',
    fat: '',
    isEstimate: false,
  }
}

export function draftFromDish(dish: Dish): DishDraft {
  const { recipe, nutrition } = dish
  return {
    name: dish.name,
    description: dish.description ?? '',
    course: dish.course,
    effort: dish.effort,
    tags: [...dish.tags],
    coverPhotoId: dish.coverPhotoId,
    icon: dish.icon,
    servings: recipe.servings && recipe.servings > 0 ? recipe.servings : DEFAULT_SERVINGS,
    prepMinutes: numberText(recipe.prepMinutes),
    cookMinutes: numberText(recipe.cookMinutes),
    ingredients: (recipe.ingredients ?? []).map((i) => ({ ...i, key: draftKey() })),
    steps: (recipe.steps ?? []).map((s) => ({
      key: draftKey(),
      text: s.text,
      timerMinutes: s.timerSeconds ? trimNumber(s.timerSeconds / 60) : '',
      photoId: s.photoId,
    })),
    notes: recipe.notes ?? '',
    sourceUrl: recipe.sourceUrl ?? '',
    kcal: numberText(nutrition.kcalPerServing),
    protein: numberText(nutrition.proteinG),
    carbs: numberText(nutrition.carbsG),
    fat: numberText(nutrition.fatG),
    isEstimate: nutrition.isEstimate ?? false,
  }
}

/** Removes keys whose value is undefined, so stored recipes stay tidy. */
function compact<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T
}

const wholeMinutes = (text: string): number | undefined => {
  const value = parseAmount(text)
  return value === undefined ? undefined : Math.round(value)
}

export function recipeFromDraft(draft: DishDraft): Recipe {
  const ingredients: Ingredient[] = draft.ingredients
    .filter((i) => i.name.trim())
    .map((i) => compact({ quantity: i.quantity, unit: i.unit?.trim() || undefined, name: i.name.trim() }))
  const steps: Step[] = draft.steps
    .filter((s) => s.text.trim())
    .map((s) => {
      const minutes = parseAmount(s.timerMinutes)
      return compact({ text: s.text.trim(), timerSeconds: minutes ? Math.round(minutes * 60) : undefined, photoId: s.photoId })
    })
  return compact({
    servings: draft.servings,
    prepMinutes: wholeMinutes(draft.prepMinutes),
    cookMinutes: wholeMinutes(draft.cookMinutes),
    ingredients,
    steps,
    notes: draft.notes.trim() || undefined,
    sourceUrl: cleanSource(draft.sourceUrl) || undefined,
  })
}

/** Calories as stored. An empty kcal field stays unknown: it is left out, never saved as 0. */
export function nutritionFromDraft(draft: DishDraft): Nutrition {
  const nutrition = compact({
    kcalPerServing: parseAmount(draft.kcal),
    proteinG: parseAmount(draft.protein),
    carbsG: parseAmount(draft.carbs),
    fatG: parseAmount(draft.fat),
  }) as Nutrition
  if (draft.isEstimate && Object.keys(nutrition).length > 0) nutrition.isEstimate = true
  return nutrition
}

/** What goes to createDish / updateDish. */
export function dishInputFromDraft(draft: DishDraft) {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    course: draft.course,
    effort: draft.effort,
    tags: draft.tags,
    recipe: recipeFromDraft(draft),
    nutrition: nutritionFromDraft(draft),
    coverPhotoId: draft.coverPhotoId,
    icon: draft.icon,
  }
}

/** Deep equality that ignores key order and treats a missing key like undefined. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return a == null && b == null
  if (typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => sameValue(item, b[i]))
  }
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].every((key) => sameValue(left[key], right[key]))
}

/**
 * Only the fields that really changed. Edits travel to the other phone field by field,
 * so saving a form must not resend (and overwrite) what was never touched.
 */
export function changedFields<T extends object>(before: object, after: T): Partial<T> {
  const old = before as Record<string, unknown>
  const out: Partial<T> = {}
  for (const key of Object.keys(after) as (keyof T & string)[]) {
    if (!sameValue(old[key], after[key])) out[key] = after[key]
  }
  return out
}

/** A tag as we keep it: trimmed, no leading "#", no commas. Empty when nothing is left. */
export function cleanTag(input: string): string {
  return input
    .replace(/[#,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24)
}

/** Adds a tag unless it is already there (compared without case or accents). */
export function addTag(tags: string[], input: string): string[] {
  const tag = cleanTag(input)
  if (!tag || tags.some((t) => normalize(t) === normalize(tag))) return tags
  return [...tags, tag]
}

/** The kitchen's most used tags that this dish does not have yet. */
export function suggestTags(dishes: Pick<Dish, 'tags'>[], current: string[], limit = 6): string[] {
  const counts = new Map<string, { tag: string; count: number }>()
  for (const dish of dishes) {
    for (const tag of dish.tags) {
      const key = normalize(tag)
      const entry = counts.get(key) ?? { tag, count: 0 }
      entry.count += 1
      counts.set(key, entry)
    }
  }
  const taken = new Set(current.map(normalize))
  return [...counts.entries()]
    .filter(([key]) => !taken.has(key))
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([, entry]) => entry.tag)
}

const looksLikeLink = (text: string): boolean => /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(text)

/** A typed source: "chefkoch.de/rezept" gains its https://, "Grandma's book, p. 12" stays as it is. */
export function cleanSource(input: string): string {
  const text = input.trim()
  if (!text) return ''
  if (/^https?:\/\//i.test(text)) return text
  return looksLikeLink(text) ? `https://${text}` : text
}

/** For showing a source: the link and its short name, or null when it is not a link. */
export function sourceLink(source: string | undefined): { href: string; label: string } | null {
  if (!source || !/^https?:\/\//i.test(source)) return null
  try {
    const url = new URL(source)
    return { href: url.href, label: url.hostname.replace(/^www\./, '') }
  } catch {
    return null
  }
}

/** Moves one entry of a list. Out-of-range moves return the list unchanged. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
