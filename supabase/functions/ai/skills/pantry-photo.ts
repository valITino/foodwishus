// Skill: say what is at home from photos of it.
//
// In:  one to four photos (an open fridge, a shelf, a cupboard, or single things held to
//      the camera), and the names the pantry already uses.
// Out: pantry lines to look over (the name, and an amount only where it can be seen or
//      read), and a note when part of the picture could not be made out.
//
// Seeing is not knowing: a fridge photo shows the front row. So the rule here is the
// house rule turned around: never list what you do not see. The app shows the lines to a
// person before anything is saved.

import type { PantryPhoto } from '../contract.ts'
import { SHOPPING_LIMITS } from '../contract.ts'
import { plain } from '../page.ts'
import { houseRules } from './house-rules.ts'

export const PHOTO_LINES = 40

export const PANTRY_PHOTO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lines', 'note'],
  properties: {
    lines: {
      type: 'array',
      description: 'One entry per thing you can make out. Empty when no food is to be seen.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'amount'],
        properties: {
          name: { type: 'string', description: 'The thing as on a shopping list: "Milch", "Eggs", "Rüebli". No amount in it, no brand.' },
          amount: { type: 'string', description: 'Only what can be seen or read: a count ("6"), what a label says ("500 g", "1 l"), or how full it looks ("almost empty", "half full", "opened"). Empty when it cannot be told.' },
        },
      },
    },
    note: { type: 'string', description: 'One short sentence when part of the picture could not be made out, or when no food is to be seen. Else empty.' },
  },
} as const

const text = (value: unknown, max: number): string => (typeof value === 'string' ? plain(value).replace(/\s+/g, ' ').trim().slice(0, max).trim() : '')

export const pantryPhotoSkill = {
  name: 'pantry-photo',
  maxTokens: 2500,
  schema: PANTRY_PHOTO_SCHEMA,

  system(request: Pick<PantryPhoto, 'lang' | 'known'>): string {
    return [
      houseRules(request.lang),
      '',
      'Job: look at the photos and list the food and drink you can see, as pantry lines. The photos show an open fridge, a shelf or a cupboard, or single things held to the camera.',
      '- One line per thing. The name alone in "name": what a person writes on a shopping list, in the language named above ("Milch", "Eier", "Rüebli"). Not the brand, unless the brand is what people call the thing.',
      '- "amount" only as far as it can be seen or read: how many of something that can be counted ("6"), a weight or a volume printed on the pack ("500 g", "1 l"), or how full it looks, in words ("almost empty", "half full", "opened"). When none of that can be told, leave it empty: the thing is simply there.',
      '- For this job, "never invent facts" means: never list what you do not see. Nothing that might be behind other things, inside a closed box or a bag you cannot look into. A guess about what a kitchen usually has is not a line.',
      '- When you can see that something is there but not what it is (a jar turned away, a box without a label), leave it out and say so in "note".',
      '- Food and drink only: also sauces, spices, jars and leftovers you can recognise. Not dishes, magnets, medicine or cleaning things.',
      '- The same thing in several photos, or several packs of the same thing, is one line, with the count as its amount.',
      '- Write names with a capital first letter.',
      request.known.length > 0 ? `- The pantry already uses these names. Use the same name when you see the same thing: ${request.known.slice(0, SHOPPING_LIMITS.known).join(', ')}.` : '- The pantry is still empty.',
      `- At most ${PHOTO_LINES} lines: when there is more, the things most worth knowing for cooking.`,
      '- note: one short sentence when part of the picture was too dark, too blurred or hidden to read, or when the photos show no food at all. Else empty.',
    ].join('\n')
  },

  user(request: Pick<PantryPhoto, 'photos'>): string {
    return request.photos.length === 1 ? 'The photo above shows what is at home. List what you can see.' : `The ${request.photos.length} photos above show what is at home. List what you can see, each thing once.`
  },

  /** The helper's answer, checked and cut to size. Null when it is not the form asked for. */
  read(answer: unknown): { lines: { name: string; amount: string | null }[]; note: string } | null {
    if (answer === null || typeof answer !== 'object') return null
    const raw = answer as Record<string, unknown>
    if (!Array.isArray(raw.lines)) return null
    const lines: { name: string; amount: string | null }[] = []
    for (const entry of raw.lines) {
      const line = (entry ?? {}) as Record<string, unknown>
      const name = text(line.name, 80)
      if (!name || lines.some((other) => other.name.toLowerCase() === name.toLowerCase())) continue
      lines.push({ name, amount: text(line.amount, 60) || null })
      if (lines.length === PHOTO_LINES) break
    }
    return { lines, note: text(raw.note, 240) }
  },
}
