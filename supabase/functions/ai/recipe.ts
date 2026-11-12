// From what a page says about a recipe to a recipe card for the app. Two ways lead
// there: the page's own data for search engines (schema.org, read here without any AI),
// and the helper (skills/recipe-card.ts), which writes the card in the kitchen's
// language and units. Plain functions, tested under Node.

import { plain } from './page.ts'

export const COURSES = ['starter', 'main', 'side', 'dessert', 'breakfast', 'snack', 'drink'] as const
export type Course = (typeof COURSES)[number]
export const EFFORTS = ['easy', 'medium', 'fancy'] as const
export type Effort = (typeof EFFORTS)[number]
export const CHECK_TOPICS = ['servings', 'times', 'ingredients', 'steps', 'calories', 'other'] as const
export type CheckTopic = (typeof CHECK_TOPICS)[number]

/** Something the cook should look at before saving, in the cook's language. */
export interface Check {
  about: CheckTopic
  note: string
}

/**
 * A recipe card as the app's dish editor takes it. Ingredients are lines ("250 g flour"):
 * the app has one parser for those, whether typed, pasted or read from a page.
 */
export interface RecipeCard {
  name: string
  description: string
  course: Course
  effort: Effort | null
  tags: string[]
  servings: number | null
  prepMinutes: number | null
  cookMinutes: number | null
  ingredientLines: string[]
  steps: string[]
  notes: string
  kcalPerServing: number | null
  checks: Check[]
}

export const LIMITS = { name: 80, description: 300, tag: 24, tags: 5, lines: 60, line: 140, steps: 40, step: 900, notes: 600, checks: 4, check: 200 }

const text = (value: unknown, max: number): string => (typeof value === 'string' ? plain(value).replace(/\s+/g, ' ').slice(0, max).trim() : '')
const count = (value: unknown, max: number): number | null => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.min(max, Math.round(value)) : null)

/** Keep a card within what the app can hold, whatever it came from. */
export function tidyCard(card: Partial<Record<keyof RecipeCard, unknown>>): RecipeCard {
  const list = (value: unknown, max: number, each: number): string[] => (Array.isArray(value) ? value.map((item) => text(item, each)).filter(Boolean).slice(0, max) : [])
  const checks = Array.isArray(card.checks) ? card.checks : []
  return {
    name: text(card.name, LIMITS.name),
    description: text(card.description, LIMITS.description),
    course: COURSES.find((course) => course === String(card.course).toLowerCase()) ?? 'main',
    effort: EFFORTS.find((effort) => effort === String(card.effort).toLowerCase()) ?? null,
    tags: [...new Set(list(card.tags, LIMITS.tags * 2, LIMITS.tag).map((tag) => tag.toLowerCase()))].slice(0, LIMITS.tags),
    servings: count(card.servings, 99),
    prepMinutes: count(card.prepMinutes, 24 * 60),
    cookMinutes: count(card.cookMinutes, 48 * 60),
    ingredientLines: list(card.ingredientLines, LIMITS.lines, LIMITS.line),
    steps: list(card.steps, LIMITS.steps, LIMITS.step),
    notes: text(card.notes, LIMITS.notes),
    kcalPerServing: count(card.kcalPerServing, 5000),
    checks: checks
      .map((check): Check => {
        const raw = (check ?? {}) as Record<string, unknown>
        return { about: CHECK_TOPICS.find((topic) => topic === String(raw.about).toLowerCase()) ?? 'other', note: text(raw.note, LIMITS.check) }
      })
      .filter((check) => check.note !== '')
      .slice(0, LIMITS.checks),
  }
}

// ----------------------------------------------------- the page's own data --

/** "PT1H30M", "P0DT45M", "PT90M" → minutes. Null for anything else. */
export function isoMinutes(duration: unknown): number | null {
  if (typeof duration !== 'string') return null
  const match = /^P(?:(\d+(?:[.,]\d+)?)D)?(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/i.exec(duration.trim())
  if (!match) return null
  const [days, hours, minutes] = match.slice(1, 4).map((part) => (part ? Number(part.replace(',', '.')) : 0))
  const total = Math.round(days * 24 * 60 + hours * 60 + minutes)
  return total > 0 ? total : null
}

/** "4", "4 servings", ["4", "4 Portionen"], 4, "Makes 12 muffins" → the first sensible number. */
export function servingsFrom(recipeYield: unknown): number | null {
  const values = Array.isArray(recipeYield) ? recipeYield : [recipeYield]
  for (const value of values) {
    if (typeof value === 'number' && value > 0 && value < 100) return Math.round(value)
    if (typeof value !== 'string') continue
    const found = /(\d{1,2})(?!\d)/.exec(value)
    if (found && Number(found[1]) > 0) return Number(found[1])
  }
  return null
}

/** "1. Knead. 2. Rest. 3. Bake." written in one line is three steps. Only when the line starts the count itself. */
function numbered(line: string): string[] {
  if (!/^\s*1[.)]\s/.test(line)) return [line]
  const parts = line.split(/(?:^|\s)\d{1,2}[.)]\s+(?=\S)/).map((part) => part.trim()).filter(Boolean)
  return parts.length >= 2 ? parts : [line]
}

/** Steps come as one text, a list of texts, a list of steps, or sections of steps. */
export function stepTexts(instructions: unknown, depth = 0): string[] {
  if (depth > 4 || instructions == null) return []
  if (typeof instructions === 'string') {
    return plain(instructions)
      .split(/\n+/)
      .flatMap(numbered)
      .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim())
      .filter((line) => line.length > 2)
  }
  if (Array.isArray(instructions)) return instructions.flatMap((item) => stepTexts(item, depth + 1))
  if (typeof instructions === 'object') {
    const node = instructions as Record<string, unknown>
    if (node.itemListElement) return stepTexts(node.itemListElement, depth + 1)
    if (typeof node.text === 'string') return stepTexts(node.text, depth + 1)
    if (typeof node.name === 'string') return stepTexts(node.name, depth + 1)
  }
  return []
}

const words = (value: unknown): string[] =>
  (Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,;|]/) : [])
    .filter((item): item is string => typeof item === 'string')
    .map((item) => plain(item).toLowerCase().trim())
    .filter(Boolean)

function pictureOf(image: unknown): string | null {
  if (typeof image === 'string') return image
  if (Array.isArray(image)) return image.map(pictureOf).find(Boolean) ?? null
  if (image && typeof image === 'object') return pictureOf((image as Record<string, unknown>).url ?? (image as Record<string, unknown>).contentUrl)
  return null
}

const COURSE_WORDS: [Course, RegExp][] = [
  ['dessert', /dessert|nachtisch|nachspeise|kuchen|cake|cookie|guetzli|sweet|süss|gebäck|torte/],
  ['breakfast', /breakfast|frühstück|brunch|zmorge/],
  ['starter', /starter|appetizer|vorspeise|soup|suppe|salad|salat/],
  ['side', /side|beilage/],
  ['snack', /snack|apéro|apero|fingerfood|zvieri/],
  ['drink', /drink|getränk|cocktail|smoothie|beverage/],
  ['main', /main|hauptgericht|hauptspeise|dinner|lunch|entree|entrée/],
]

/** The course a page files its recipe under, as one of ours. Null when it does not say. */
export function courseFrom(categories: string[]): Course | null {
  for (const [course, pattern] of COURSE_WORDS) if (categories.some((category) => pattern.test(category))) return course
  return null
}

export interface PageRecipe {
  card: RecipeCard
  /** The recipe's picture, if the page names one. */
  image: string | null
  /** "de", "en": the language the page says the recipe is in. */
  language: string | null
}

/**
 * A card straight from the page's own data, word for word: nothing translated, nothing
 * converted. Null when the data has neither ingredients nor steps.
 */
export function cardFromData(data: Record<string, unknown>): PageRecipe | null {
  const ingredientLines = (Array.isArray(data.recipeIngredient) ? data.recipeIngredient : Array.isArray(data.ingredients) ? data.ingredients : []).filter((line): line is string => typeof line === 'string')
  const steps = stepTexts(data.recipeInstructions)
  if (ingredientLines.length === 0 && steps.length === 0) return null

  const prep = isoMinutes(data.prepTime)
  const cook = isoMinutes(data.cookTime)
  const total = isoMinutes(data.totalTime)
  const categories = [...words(data.recipeCategory), ...words(data.keywords)]
  const nutrition = (data.nutrition ?? {}) as Record<string, unknown>
  const kcal = typeof nutrition.calories === 'number' ? nutrition.calories : typeof nutrition.calories === 'string' ? Number(/(\d+(?:[.,]\d+)?)/.exec(nutrition.calories)?.[1]?.replace(',', '.')) : NaN
  const servings = servingsFrom(data.recipeYield)

  const card = tidyCard({
    name: data.name,
    description: data.description,
    course: courseFrom(categories) ?? 'main',
    effort: null,
    tags: words(data.recipeCuisine),
    servings,
    prepMinutes: prep,
    // A page that only gives the total: count it as cooking time rather than lose it.
    cookMinutes: cook ?? (total !== null ? Math.max(0, total - (prep ?? 0)) || null : null),
    ingredientLines,
    steps,
    notes: '',
    kcalPerServing: Number.isFinite(kcal) ? kcal : null,
    checks: [],
  })
  return { card, image: pictureOf(data.image), language: typeof data.inLanguage === 'string' ? data.inLanguage.slice(0, 2).toLowerCase() : null }
}
