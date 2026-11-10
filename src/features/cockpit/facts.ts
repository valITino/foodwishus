// Puts the fun facts into words. The numbers library says what is true
// ({ kind: 'mostEaten', dishId, count: 7 }); this turns it into a line with a wink.

import type { ID } from '../../data/types'
import type { FunFact } from '../../lib/stats'
import type { CockpitCopy } from './copy'

export interface FactLine {
  key: FunFact['kind']
  text: string
  /** Set when the fact is about one dish: the line leads to its numbers. */
  dishId?: ID
}

export interface FactNames {
  dish: (id: ID) => string
  /** 0 = Monday … 6 = Sunday. */
  weekday: (index: number) => string
  /** What the best reaction is called in this kitchen ("Super delicious"). */
  superDelicious: string
}

export function factLine(fact: FunFact, words: CockpitCopy['facts'], names: FactNames): FactLine {
  switch (fact.kind) {
    case 'mostEaten':
      return { key: fact.kind, text: words.mostEaten(names.dish(fact.dishId), fact.count), dishId: fact.dishId }
    case 'streak':
      return { key: fact.kind, text: words.streak(fact.days) }
    case 'perfectScores':
      return { key: fact.kind, text: words.perfectScores(fact.count) }
    case 'superDelicious':
      return { key: fact.kind, text: words.superDelicious(names.superDelicious, fact.count) }
    case 'favouriteWeekday':
      return { key: fact.kind, text: words.favouriteWeekday(names.weekday(fact.weekday), fact.count) }
    case 'cravingAccuracy':
      return { key: fact.kind, text: words.cravingAccuracy(fact.percent) }
    case 'seconds':
      return { key: fact.kind, text: words.seconds(fact.count) }
    case 'proofPhotos':
      return { key: fact.kind, text: words.proofPhotos(fact.count) }
  }
}

export function factLines(facts: FunFact[], words: CockpitCopy['facts'], names: FactNames): FactLine[] {
  return facts.map((fact) => factLine(fact, words, names))
}
