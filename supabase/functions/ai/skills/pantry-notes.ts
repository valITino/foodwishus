// Skill: pantry notes.
//
// Given: what somebody typed or dictated about what is at home ("we still have two
// onions, half a kilo of flour, the milk is almost gone").
// Wanted: one pantry line per thing: its name and how much is left, in their own words.

import { SHOPPING_LIMITS, type PantryNotes } from '../contract.ts'
import { plain } from '../page.ts'
import { houseRules } from './house-rules.ts'

export const NOTES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lines'],
  properties: {
    lines: {
      type: 'array',
      description: 'One entry per thing that is mentioned.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'amount'],
        properties: {
          name: { type: 'string', description: 'The thing: "Mehl", "Eggs", "Olivenöl". No amount in it.' },
          amount: { type: 'string', description: 'How much is left, short, as it was said: "500 g", "2", "half a pack", "almost empty". Empty when nothing was said.' },
        },
      },
    },
  },
} as const

const text = (value: unknown, max: number): string => (typeof value === 'string' ? plain(value).replace(/\s+/g, ' ').trim().slice(0, max).trim() : '')

export const pantryNotesSkill = {
  name: 'pantry-notes',
  maxTokens: 2500,
  schema: NOTES_SCHEMA,

  system(request: Pick<PantryNotes, 'lang' | 'known'>): string {
    return [
      houseRules(request.lang),
      '',
      'Job: turn what the cook wrote or dictated about what is at home into pantry lines.',
      '- One line per thing. The name alone in "name", how much is left in "amount".',
      '- Keep the amount the way it was said, only shorter: "ein halbes Kilo", "2", "fast leer", "one open pack". Do not convert and do not guess a number.',
      '- No amount said: leave "amount" empty. The thing is simply there.',
      '- Something said to be gone ("keine Milch mehr", "we are out of eggs") is a line too, with the amount "leer" in German or "none left" in English.',
      '- Only what the text mentions. Do not add what a kitchen usually has.',
      '- Write names with a capital first letter, in the language of the text.',
      request.known.length > 0 ? `- The pantry already uses these names. Use the same name when the text means the same thing: ${request.known.slice(0, SHOPPING_LIMITS.known).join(', ')}.` : '- The pantry is still empty.',
      '- A text that is not about food or household things at all: no lines.',
    ].join('\n')
  },

  user(request: PantryNotes): string {
    return `What was written or said:\n\n<material>\n${request.text}\n</material>`
  },

  /** The helper's answer, checked and cut to size. Null when it is not the form asked for. */
  read(answer: unknown): { name: string; amount: string | null }[] | null {
    if (answer === null || typeof answer !== 'object') return null
    const raw = (answer as Record<string, unknown>).lines
    if (!Array.isArray(raw)) return null
    const lines: { name: string; amount: string | null }[] = []
    for (const entry of raw) {
      const line = (entry ?? {}) as Record<string, unknown>
      const name = text(line.name, 80)
      if (!name || lines.some((other) => other.name.toLowerCase() === name.toLowerCase())) continue
      lines.push({ name, amount: text(line.amount, 60) || null })
      if (lines.length === 60) break
    }
    return lines
  },
}
