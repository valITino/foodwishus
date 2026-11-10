// The shape of the demo kitchen's written content. Every text exists in English and
// German, side by side, so the two can never drift apart.

import type { Lang } from '../../i18n'
import type { Course, Effort, Ingredient, Nutrition, Recipe, Step } from '../types'

/** The same text in both languages: [English, German]. */
export type Both = readonly [en: string, de: string]

export const say = (text: Both, lang: Lang): string => text[lang === 'de' ? 1 : 0]

export type DishKey =
  | 'alplermagronen'
  | 'rosti'
  | 'geschnetzeltes'
  | 'hoernli'
  | 'fondue'
  | 'raclette'
  | 'rizcasimir'
  | 'kaesesouffle'
  | 'nuesslisalat'
  | 'chaeschuechli'
  | 'lasagne'
  | 'carbonara'
  | 'risotto'
  | 'pizza'
  | 'greencurry'
  | 'chili'
  | 'burger'
  | 'salmon'
  | 'roastchicken'
  | 'tomatosoup'
  | 'kuerbissuppe'
  | 'gurkensalat'
  | 'birchermuesli'
  | 'zopf'
  | 'pancakes'
  | 'shakshuka'
  | 'tiramisu'
  | 'rueblitorte'
  | 'zwetschgenwaehe'
  | 'schoggimousse'
  | 'heisseschoggi'
  | 'eistee'

export type DishIcon = 'cloche' | 'cherry' | 'teacup' | 'sprig' | 'flower' | 'whisk' | 'rolling-pin' | 'heart'

export const TAGS = {
  swiss: ['Swiss', 'Schweizerisch'],
  italian: ['Italian', 'Italienisch'],
  thai: ['Thai', 'Thailändisch'],
  american: ['American', 'Amerikanisch'],
  texmex: ['Tex-Mex', 'Tex-Mex'],
  levantine: ['Middle Eastern', 'Orientalisch'],
  french: ['French', 'Französisch'],
  vegetarian: ['Vegetarian', 'Vegetarisch'],
  comfort: ['Comfort food', 'Wohlfühlessen'],
  cheese: ['Cheese', 'Käse'],
  pasta: ['Pasta', 'Pasta'],
  soup: ['Soup', 'Suppe'],
  baking: ['Baking', 'Backen'],
  quick: ['Quick', 'Schnell'],
  light: ['Light', 'Leicht'],
  autumn: ['Autumn', 'Herbst'],
  summer: ['Summer', 'Sommer'],
  sunday: ['Sunday', 'Sonntag'],
  chocolate: ['Chocolate', 'Schokolade'],
  fruit: ['Fruit', 'Früchte'],
} as const satisfies Record<string, Both>

export type TagKey = keyof typeof TAGS

/**
 * Units as written in the recipes. Liquids are written in millilitres and shown the
 * Swiss way in German: 150 ml becomes 1.5 dl.
 */
export type Unit = 'g' | 'kg' | 'ml' | 'l' | 'tbsp' | 'tsp' | 'pinch' | 'bunch' | 'can' | 'slices' | 'sprigs' | 'cm'

const UNIT_LABELS: Record<Unit, Both> = {
  g: ['g', 'g'],
  kg: ['kg', 'kg'],
  ml: ['ml', 'ml'],
  l: ['l', 'l'],
  tbsp: ['tbsp', 'EL'],
  tsp: ['tsp', 'TL'],
  pinch: ['pinch', 'Prise'],
  bunch: ['bunch', 'Bund'],
  can: ['can', 'Dose'],
  slices: ['slices', 'Scheiben'],
  sprigs: ['sprigs', 'Zweige'],
  cm: ['cm', 'cm'],
}

/** [quantity, unit, English, German]. Use null where an ingredient has no amount or unit. */
export type IngredientLine = readonly [quantity: number | null, unit: Unit | null, en: string, de: string]
/** [English, German, timer in seconds]. */
export type StepLine = readonly [en: string, de: string, timerSeconds?: number]

export interface DemoDish {
  key: DishKey
  name: Both
  description: Both
  course: Course
  effort: Effort
  icon: DishIcon
  tags: readonly TagKey[]
  servings: number
  prep: number
  cook: number
  ingredients: readonly IngredientLine[]
  steps: readonly StepLine[]
  notes?: Both
  nutrition: Nutrition
  /** Who added the recipe card. The Chef, unless stated. */
  by?: 'taster'
  /** This dish gets a cover photo; the others show their illustrated icon. */
  cover?: boolean
}

export interface DemoMenu {
  key: 'sundayroast' | 'datenight' | 'chalet' | 'brunch'
  name: Both
  description: Both
  courses: readonly DishKey[]
}

function ingredient([quantity, unit, en, de]: IngredientLine, lang: Lang): Ingredient {
  const line: Ingredient = { name: lang === 'de' ? de : en }
  if (quantity !== null) line.quantity = quantity
  if (unit !== null) line.unit = say(UNIT_LABELS[unit], lang)
  // Swiss recipes measure liquids in decilitres.
  if (lang === 'de' && unit === 'ml' && quantity !== null && quantity >= 50 && quantity % 25 === 0) {
    line.quantity = quantity / 100
    line.unit = 'dl'
  }
  return line
}

function step([en, de, timerSeconds]: StepLine, lang: Lang): Step {
  const line: Step = { text: lang === 'de' ? de : en }
  if (timerSeconds) line.timerSeconds = timerSeconds
  return line
}

export function recipeOf(dish: DemoDish, lang: Lang): Recipe {
  const recipe: Recipe = {
    servings: dish.servings,
    prepMinutes: dish.prep,
    cookMinutes: dish.cook,
    ingredients: dish.ingredients.map((line) => ingredient(line, lang)),
    steps: dish.steps.map((line) => step(line, lang)),
  }
  if (dish.notes) recipe.notes = say(dish.notes, lang)
  return recipe
}

export const min = (minutes: number): number => minutes * 60
export const hours = (count: number): number => count * 3600
