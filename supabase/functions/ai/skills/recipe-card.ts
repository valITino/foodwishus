// Skill: write a recipe card from what a web page says about one recipe.
//
// In:  the page's own recipe data (when it has any) or the page's text, the language to
//      write in, whether to convert to metric, and the tags the kitchen already uses.
// Out: one card in the shape of CARD_SCHEMA. Unknown numbers are 0, unknown effort is
//      "unknown"; readCard() turns those into "not known" for the app.
// Doubts go into "checks": short notes the cook sees before saving.

import { CHECK_TOPICS, COURSES, EFFORTS, LIMITS, tidyCard, type RecipeCard } from '../recipe.ts'
import { houseRules, type Lang } from './house-rules.ts'
import { NUTRITION_RULES } from './nutrition.ts'

export interface CardRequest {
  lang: Lang
  /** Write the card in `lang` even when the page is in another language. */
  translate: boolean
  /** Convert cups, ounces, pounds and Fahrenheit. */
  metric: boolean
  /** Estimate calories, protein, carbs and fat when the material does not give them. */
  nutrition: boolean
  /** Tags the kitchen already uses, so the same thing is not tagged in two ways. */
  knownTags: string[]
  /** Where the recipe was found, for the helper to know what it is looking at. */
  site: string | null
  /** The page's own recipe data as JSON, or null when it has none. */
  data: string | null
  /** The page's text, used when there is no data. */
  text: string | null
  /** The text is no page: it is a recipe somebody wrote out in a talk. */
  written?: boolean
}

export const CARD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['isRecipe', 'name', 'description', 'course', 'effort', 'tags', 'servings', 'prepMinutes', 'cookMinutes', 'ingredientLines', 'steps', 'notes', 'kcalPerServing', 'proteinPerServing', 'carbsPerServing', 'fatPerServing', 'nutritionEstimated', 'checks'],
  properties: {
    isRecipe: { type: 'boolean', description: 'False when the material is not a recipe for one dish. Then leave everything else empty.' },
    name: { type: 'string', description: 'The name of the dish, without the site, without "recipe", without "the best".' },
    description: { type: 'string', description: 'One short sentence about the dish, or empty.' },
    course: { type: 'string', enum: [...COURSES] },
    effort: { type: 'string', enum: [...EFFORTS, 'unknown'] },
    tags: { type: 'array', items: { type: 'string' }, description: 'Up to 4 short tags for cuisine or kind, each starting with a capital letter (for example "Swiss", "Vegetarian", "Pasta").' },
    servings: { type: 'integer', description: 'For how many people. 0 when the material does not say.' },
    prepMinutes: { type: 'integer', description: 'Hands-on time in minutes. 0 when not given.' },
    cookMinutes: { type: 'integer', description: 'Cooking, baking and resting time in minutes. 0 when not given.' },
    ingredientLines: { type: 'array', items: { type: 'string' }, description: 'One line per ingredient: amount, unit, name. "250 g flour", "2 eggs", "1 pinch salt". Without an amount, the name alone.' },
    steps: { type: 'array', items: { type: 'string' }, description: 'One step per entry, in order, with its temperatures and times.' },
    notes: { type: 'string', description: 'Tips or variations the material gives, or empty.' },
    kcalPerServing: { type: 'integer', description: 'Kilocalories per serving. 0 when not known.' },
    proteinPerServing: { type: 'integer', description: 'Protein per serving in grams. 0 when not known.' },
    carbsPerServing: { type: 'integer', description: 'Carbohydrates per serving in grams. 0 when not known.' },
    fatPerServing: { type: 'integer', description: 'Fat per serving in grams. 0 when not known.' },
    nutritionEstimated: { type: 'boolean', description: 'True when the four numbers above are your own estimate from the ingredients. False when the material states them, and when they are 0.' },
    checks: {
      type: 'array',
      description: 'At most 4 real doubts the cook should look at before saving. Empty when there are none.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['about', 'note'],
        properties: { about: { type: 'string', enum: [...CHECK_TOPICS] }, note: { type: 'string', description: 'One short sentence.' } },
      },
    },
  },
} as const

export const recipeCardSkill = {
  name: 'recipe-card',
  maxTokens: 4000,
  schema: CARD_SCHEMA,

  system(request: CardRequest): string {
    return [
      houseRules(request.lang),
      '',
      'Job: write one recipe card from the material below.',
      request.translate ? '- Write every part of the card in the language named above, also when the material is in another language. Keep dish names that are proper names (Rösti, Tiramisu, Pad Thai).' : '- Keep the language of the material for the card itself. Only the checks are in the language named above.',
      request.metric
        ? '- Convert cups, ounces, pounds, sticks of butter and Fahrenheit to metric, rounded to amounts a cook would weigh (120 g, not 118.3 g). When a conversion depends on the ingredient (a cup of flour is not a cup of sugar), convert as well as you can and add a check about it.'
        : '- Keep the units of the material as they are.',
      '- Ingredient lines: amount first, then unit, then name, then a short preparation note if the material has one ("1 onion, finely chopped"). Decimal amounts with a point or simple fractions (0.5 or 1/2). One ingredient per line; split "salt and pepper" into two lines.',
      '- Group headings of ingredients ("For the dough") are not ingredients: leave them out, unless two groups share an ingredient, then add the group to the name ("200 g butter for the dough").',
      '- Steps: one action per step, in the order of the material, as an instruction ("Fry the onions until golden."). Keep every temperature and every time. Do not number them.',
      `- course is what the dish mostly is. effort: "easy" for up to about 30 minutes and few steps, "fancy" for long or tricky recipes, "medium" in between, "unknown" when the material is too thin to tell.`,
      request.knownTags.length > 0 ? `- For tags, prefer these, which the kitchen already uses, when they fit: ${request.knownTags.slice(0, 40).join(', ')}.` : '- Tags are optional.',
      '- servings and times only as the material states them. 0 means "not given".',
      ...(request.nutrition
        ? [
            '- Nutrition: when the material states calories per serving, use its numbers as they are (also protein, carbohydrates and fat, when given) and set nutritionEstimated to false.',
            '- When the material states no calories, estimate the four numbers yourself and set nutritionEstimated to true. This is the one exception to "never invent facts", and the app shows it as an estimate. Do not add a check about it: the app says so itself.',
            ...NUTRITION_RULES.map((rule) => `  ${rule}`),
          ]
        : ['- Nutrition only as the material states it. 0 means "not given". Never estimate, and nutritionEstimated stays false.']),
      '- checks: for example a missing number of servings, an amount like "1 can" without a size, a rough conversion, steps that refer to a video, or a recipe that is cut off. Not for things that are fine.',
      '- If the material is not a recipe for one dish (a list of recipes, a shop, a login page, an article): isRecipe false, and every other field empty or 0.',
      `- Limits: name up to ${LIMITS.name} characters, at most ${LIMITS.lines} ingredient lines and ${LIMITS.steps} steps.`,
    ].join('\n')
  },

  user(request: CardRequest): string {
    const from = request.site ? `Found on: ${request.site}\n\n` : ''
    if (request.data) return `${from}The page's own recipe data (JSON, as published for search engines):\n\n<material>\n${request.data}\n</material>`
    if (request.written) return `A recipe as it was written out in a talk, possibly with a few words around it:\n\n<material>\n${request.text ?? ''}\n</material>`
    return `${from}The text of the page (menus and footers removed, possibly with leftovers around the recipe):\n\n<material>\n${request.text ?? ''}\n</material>`
  },

  /** The helper's answer as a card. Null when it says this is not a recipe, or the answer has no name. */
  read(answer: unknown): RecipeCard | null {
    if (answer === null || typeof answer !== 'object') return null
    const raw = answer as Record<string, unknown>
    if (raw.isRecipe !== true) return null
    const card = tidyCard({ ...raw, effort: raw.effort === 'unknown' ? null : raw.effort })
    return card.name !== '' && (card.ingredientLines.length > 0 || card.steps.length > 0) ? card : null
  },
}
