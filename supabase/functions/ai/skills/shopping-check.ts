// Skill: what is missing for the planned meals.
//
// Given: the planned meals of the next days with their ingredients, what was cooked
// lately, the pantry as the two of them noted it (with how old each note is), and what
// is on the shopping list already.
// Wanted: the things to buy, each with an amount and one sentence of reason, for the
// two of them to decide about. The helper suggests; it never puts anything on the list.

import { SHOPPING_LIMITS, type ShoppingCheck, type ShoppingSuggestion } from '../contract.ts'
import { plain } from '../page.ts'
import { houseRules } from './house-rules.ts'

export const CHECK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'note'],
  properties: {
    items: {
      type: 'array',
      description: 'The things to buy, the one needed soonest first. Empty when everything is at home.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'amount', 'reason'],
        properties: {
          name: { type: 'string', description: 'The thing, as it stands on a shopping list: "Rüebli", "Rahm", "Eggs". No amount in it.' },
          amount: { type: 'string', description: 'How much to buy: "500 g", "2", "1 l". Empty when it cannot be said.' },
          reason: { type: 'string', description: 'One short sentence: which meal asks for it, and what the pantry says.' },
        },
      },
    },
    note: { type: 'string', description: 'One short sentence about the check itself when the cook should know something (meals without ingredients could not be checked), else empty.' },
  },
} as const

const text = (value: unknown, max: number): string => (typeof value === 'string' ? plain(value).replace(/\s+/g, ' ').trim().slice(0, max).trim() : '')

const list = (title: string, lines: string[], none: string): string => `${title}\n${lines.length > 0 ? lines.map((line) => `- ${line}`).join('\n') : `- ${none}`}`

export const shoppingCheckSkill = {
  name: 'shopping-check',
  maxTokens: 2500,
  schema: CHECK_SCHEMA,

  system(request: Pick<ShoppingCheck, 'lang'>): string {
    return [
      houseRules(request.lang),
      '',
      'Job: work out what has to be bought so that the planned meals can be cooked.',
      '- Go through every ingredient the planned meals ask for and add up what several meals need of the same thing.',
      '- Compare with the pantry. The same thing may stand there under another name (Rüebli, Karotten and carrots are one thing; Rahm and cream too). Use kitchen sense.',
      '- Enough at home: not on the list. None at home, or clearly less than the meals need: on the list, with the amount that is missing. Round up to what a shop sells when that is obvious (eggs come in sixes, cream in 2 dl), otherwise give the amount needed.',
      '- A pantry line without an amount means the thing is there and counts as enough. Words like "almost empty", "a bit", "fast leer", "ein Rest" mean too little for a meal that needs a real amount.',
      '- A pantry note is only as good as it is fresh. What was cooked since the note was written has used things up: take that off before you compare, and say so in the reason when it decides the matter.',
      '- Salt, pepper, water and a little oil or butter for frying are at home unless the pantry says otherwise. Do not list them.',
      '- Never list what is on the shopping list already, and never a thing no planned meal asks for.',
      '- reason: one short sentence that names the meal and its day as a weekday (the weekday stands next to each date; write it in the language named above), and what the pantry says. For example: "For the Rüeblisuppe on Thursday: it needs 500 g, the pantry has 200 g."',
      `- At most ${SHOPPING_LIMITS.items} items, the one needed soonest first. When in doubt whether there is enough, list it and say why: a person decides.`,
      '- note: empty, unless a planned meal has no ingredients written down (then say for which meal nothing could be checked).',
    ].join('\n')
  },

  user(request: ShoppingCheck): string {
    return [
      `Today is ${request.today}${request.weekday ? ` (${request.weekday})` : ''}.`,
      '',
      '<material>',
      list('Planned meals:', request.meals, 'none'),
      '',
      list('Cooked lately:', request.cooked, 'nothing'),
      '',
      list('Pantry:', request.pantry, 'nothing noted'),
      '',
      list('On the shopping list already:', request.basket, 'nothing'),
      '</material>',
    ].join('\n')
  },

  /** The helper's answer, checked and cut to size. Null when it is not the form asked for. */
  read(answer: unknown): { items: ShoppingSuggestion[]; note: string } | null {
    if (answer === null || typeof answer !== 'object') return null
    const raw = answer as Record<string, unknown>
    if (!Array.isArray(raw.items)) return null
    const items: ShoppingSuggestion[] = []
    for (const entry of raw.items) {
      const item = (entry ?? {}) as Record<string, unknown>
      const name = text(item.name, 80)
      if (!name || items.some((other) => other.name.toLowerCase() === name.toLowerCase())) continue
      items.push({ name, amount: text(item.amount, 40) || null, reason: text(item.reason, 240) })
      if (items.length === SHOPPING_LIMITS.items) break
    }
    return { items, note: text(raw.note, 240) }
  },
}
