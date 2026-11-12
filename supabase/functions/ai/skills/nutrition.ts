// Skill: nutrition per serving, estimated from the ingredients.
//
// Given: a dish's ingredient lines with their amounts, and for how many servings it is.
// Wanted: kilocalories, protein, carbohydrates and fat per serving, as a careful estimate.
//
// This is the one place where the helper may state numbers the material does not give,
// and the app always shows them as an estimate. The rules are shared: the recipe reader
// uses them for pages without nutrition, the dish form for any dish.

import type { NutritionEstimate } from '../contract.ts'
import { plain } from '../page.ts'
import { houseRules } from './house-rules.ts'

/** How to estimate, for every job that does. */
export const NUTRITION_RULES = [
  '- Work it out from the ingredient lines and their amounts with the usual values of a food table, add everything up, and divide by the number of servings.',
  '- Count what is eaten. Of oil or butter for frying, count what a pan leaves in the food (about half). Leave out water, salt, spices by the pinch, and what is poured away (cooking water, a marinade that is discarded).',
  '- "1 onion", "2 eggs", "a can of tomatoes" have usual sizes: use them. An ingredient without any amount counts as a small usual amount, or not at all when it is a seasoning.',
  '- Round kilocalories to the nearest 10 and grams to whole numbers. Do not make it look more exact than it is.',
  '- When more than half of the main ingredients have no amount, or the number of servings is not known, do not estimate at all.',
]

export const NUTRITION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['canEstimate', 'kcalPerServing', 'proteinPerServing', 'carbsPerServing', 'fatPerServing', 'note'],
  properties: {
    canEstimate: { type: 'boolean', description: 'False when there is too little to go on. Then every number is 0.' },
    kcalPerServing: { type: 'integer', description: 'Kilocalories per serving.' },
    proteinPerServing: { type: 'integer', description: 'Protein per serving, in grams.' },
    carbsPerServing: { type: 'integer', description: 'Carbohydrates per serving, in grams.' },
    fatPerServing: { type: 'integer', description: 'Fat per serving, in grams.' },
    note: { type: 'string', description: 'One short sentence when the cook should know how rough this is or why it could not be done, else empty.' },
  },
} as const

export interface NutritionNumbers {
  kcal: number
  protein: number | null
  carbs: number | null
  fat: number | null
  note: string
}

const whole = (value: unknown, max: number): number | null => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.min(max, Math.round(value)) : null)

export const nutritionSkill = {
  name: 'nutrition',
  maxTokens: 1200,
  schema: NUTRITION_SCHEMA,

  system(request: Pick<NutritionEstimate, 'lang'>): string {
    return [
      houseRules(request.lang),
      '',
      'Job: estimate the nutrition per serving of one dish from its ingredients.',
      '- This job is the exception to "never invent facts": an estimate is what is asked for. It is shown to the cook as an estimate.',
      ...NUTRITION_RULES,
      '- note: empty when the estimate is ordinary. One short sentence when it is rough for a reason the cook can do something about ("Two ingredients have no amount."), or when you could not estimate.',
    ].join('\n')
  },

  user(request: NutritionEstimate): string {
    return [`Dish: ${request.name || '(no name yet)'}`, `Servings: ${request.servings}`, '', '<material>', ...request.ingredients.map((line) => `- ${line}`), '</material>'].join('\n')
  },

  /** The helper's answer, checked and cut to size. Null when it could not estimate or the answer is not the form asked for. */
  read(answer: unknown): NutritionNumbers | { kcal: null; note: string } | null {
    if (answer === null || typeof answer !== 'object') return null
    const raw = answer as Record<string, unknown>
    const note = typeof raw.note === 'string' ? plain(raw.note).replace(/\s+/g, ' ').trim().slice(0, 200) : ''
    const kcal = whole(raw.kcalPerServing, 5000)
    if (raw.canEstimate !== true || kcal === null) return { kcal: null, note }
    return { kcal, protein: whole(raw.proteinPerServing, 500), carbs: whole(raw.carbsPerServing, 900), fat: whole(raw.fatPerServing, 500), note }
  },
}
