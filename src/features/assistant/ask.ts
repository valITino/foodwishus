// One question to Fork, from the phone's side: gather the kitchen, send the talk, and
// come back with an answer whose buttons point at real dishes. When Fork wants to read a
// recipe first, it gets it and is asked again, once.

import type { AssistantOffer } from '../../data/backend'
import { askFork, kitchenForFork, photosToShow, ReadError } from '../../data/helper'
import type { ID } from '../../data/types'
import { today } from '../../lib/dates'
import { BRIEF_LIMITS, kitchenBrief, namedIn, wholeRecipe } from './brief'
import { toSend, type Offer, type Turn } from './talk'

export interface Answer {
  text: string
  offers: Offer[]
  /** How many more questions the kitchen has today. */
  left: number
}

/** Refs become dishes. An offer for a dish this phone does not know is dropped. */
export function settleOffers(offers: AssistantOffer[], dishOf: Map<string, ID>): Offer[] {
  return offers.flatMap((offer): Offer[] => {
    if (offer.kind === 'plan' || offer.kind === 'wish' || offer.kind === 'dish') {
      const dishId = dishOf.get(offer.dish)
      if (!dishId) return []
      return [offer.kind === 'plan' ? { kind: 'plan', dishId, day: offer.day, slot: offer.slot } : { kind: offer.kind, dishId }]
    }
    return [offer]
  })
}

export async function askAbout(turns: Turn[], question: string, who: { meId: ID; lang: 'en' | 'de'; calories: boolean }, files: readonly Blob[] = []): Promise<Answer> {
  // Photos that come with the question are made ready first: a file that is no picture stops here, before anything is sent.
  const photos = files.length > 0 ? await photosToShow(files) : []
  const now = await kitchenForFork()
  const brief = kitchenBrief(now, who.meId, today(), who.calories)
  const recipe = (dishId: ID): string[] => {
    const dish = now.dishes.find((entry) => entry.id === dishId)
    const ref = brief.refOf.get(dishId)
    return dish && ref ? [wholeRecipe(dish, ref, who.lang, who.calories)] : []
  }
  // Dishes the question names go along at once: no second round for the obvious.
  let recipes = namedIn(question, now.dishes.filter((dish) => brief.refOf.has(dish.id))).flatMap(recipe)
  const talk = toSend(turns, question)

  for (let round = 0; round < 2; round++) {
    const answer = await askFork({ lang: who.lang, turns: talk, kitchen: brief.kitchen, recipes, ...(photos.length > 0 ? { photos } : {}) })
    if (answer.text !== '') return { text: answer.text, offers: settleOffers(answer.offers, brief.dishOf), left: answer.left }
    // Fork wants to read a recipe first. Send it and ask again.
    const more = answer.look.flatMap((ref) => recipe(brief.dishOf.get(ref) ?? ''))
    if (more.length === 0) break
    recipes = [...recipes, ...more].slice(0, BRIEF_LIMITS.recipes)
  }
  throw new ReadError('helper_down')
}
