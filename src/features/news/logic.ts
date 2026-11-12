// Turning a stored line of news into a sentence. Kept free of React and of the
// database, so the wording rules can be unit-tested.

import type { NewsItem } from '../../data/news'
import type { Day, ID, Slot } from '../../data/types'
import type { NewsCopy } from './copy'

/** What the sentence needs to know about the kitchen as it is now. */
export interface NewsContext {
  meId: ID
  /** A person's name, or an empty string when they are not known (any more). */
  nameOf: (memberId: ID | null) => string
  /** The dish's or the menu's name as it is today. Null when it is gone. */
  mealName: (item: Pick<NewsItem, 'dishId' | 'menuId'>) => string | null
  /** Who cooks the meal a line is about. Null when the meal is gone. */
  cookOf: (servingId: ID) => ID | null
  /** "tomorrow, dinner" */
  when: (day: Day, slot: Slot | null) => string
  /** What to call a dish that left the recipe book and left no name behind. */
  goneName: string
}

/** One line of news as a sentence for whoever is reading. */
export function newsLine(item: NewsItem, ctx: NewsContext, lines: NewsCopy['lines']): string {
  const who = ctx.nameOf(item.actorId)
  const dish = ctx.mealName(item) ?? item.facts.name ?? ctx.goneName
  const cook = item.servingId ? ctx.cookOf(item.servingId) : null
  const iCook = cook !== null && cook === ctx.meId

  switch (item.kind) {
    case 'proposed':
      if (!who) return lines.proposedPlain(dish)
      return iCook ? lines.proposedForCook(who, dish) : lines.proposed(who, dish)
    case 'planned': {
      if (!item.facts.day) return lines.plannedSomeDay(dish)
      const when = ctx.when(item.facts.day, item.facts.slot ?? null)
      return who ? lines.plannedBy(who, dish, when) : lines.planned(dish, when)
    }
    case 'moved':
      return item.facts.day ? lines.moved(dish, ctx.when(item.facts.day, item.facts.slot ?? null)) : lines.plannedSomeDay(dish)
    case 'unplanned':
      return lines.unplanned(dish)
    case 'served':
      // "Proof, please" is for whoever eats it.
      return who && !iCook ? lines.servedForEater(who, dish) : lines.served(dish)
    case 'eaten':
      return who ? lines.eaten(who, dish) : lines.eatenPlain(dish)
    case 'answered': {
      // The cook answers, and the answer is news for whoever wrote the verdict.
      const answerer = ctx.nameOf(cook)
      if (!answerer || iCook) return lines.answeredPlain(dish)
      return item.facts.hasReply ? lines.answered(answerer, dish) : lines.reacted(answerer, dish)
    }
    case 'skipped':
      return item.facts.reason ? lines.skippedBecause(dish, item.facts.reason) : lines.skipped(dish)
    case 'removed':
      return lines.removed(dish)
    case 'hearts':
      return who ? lines.hearts(who, dish, item.facts.hearts ?? 0) : lines.heartsPlain(dish, item.facts.hearts ?? 0)
    case 'note':
      return who ? lines.note(who, dish) : lines.notePlain(dish)
    case 'cook': {
      if (item.facts.cookId === ctx.meId) return lines.cookYou(dish)
      const name = ctx.nameOf(item.facts.cookId ?? null)
      return name ? lines.cook(name, dish) : lines.cookPlain(dish)
    }
    case 'dish':
      return who ? lines.dish(who, dish) : lines.dishPlain(dish)
    case 'dishes':
      return lines.dishes(item.facts.count ?? 0)
    case 'menu':
      return who ? lines.menu(who, dish) : lines.menuPlain(dish)
    case 'joined':
      return lines.joined(who || item.facts.name || '')
    case 'basket': {
      const count = item.facts.count ?? 1
      if (count > 1) return who ? lines.basketMany(who, count) : lines.basketManyPlain(count)
      return who ? lines.basketOne(who, item.facts.name ?? '') : lines.basketOnePlain(item.facts.name ?? '')
    }
    case 'fork': {
      const count = item.facts.count ?? 1
      return count > 1 ? lines.forkMany(count) : lines.forkOne(item.facts.name ?? '')
    }
  }
}

/** True when the reader is the one who eats the meal a line is about (and so owes its proof). */
export function readerEats(item: Pick<NewsItem, 'servingId'>, ctx: Pick<NewsContext, 'meId' | 'cookOf'>): boolean {
  if (!item.servingId) return false
  const cook = ctx.cookOf(item.servingId)
  return cook !== null && cook !== ctx.meId
}
