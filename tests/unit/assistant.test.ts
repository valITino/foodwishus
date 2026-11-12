import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BasketItem, Dish, Menu, PantryItem, Review, Serving } from '../../src/data/types'
import { settleOffers } from '../../src/features/assistant/ask'
import { kitchenBrief, namedIn, wholeRecipe } from '../../src/features/assistant/brief'
import { KEPT_TURNS, loadTalk, saveTalk, SENT_TURNS, toSend, type Turn } from '../../src/features/assistant/talk'

// What the phone tells Fork, and what it keeps of the talk. No cloud, no AI: only words.

const row = { householdId: 'k', createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z', deletedAt: null }
const dish = (id: string, name: string, more: Partial<Dish> = {}): Dish => ({ ...row, id, name, description: null, course: 'main', tags: [], effort: null, recipe: {}, nutrition: {}, coverPhotoId: null, icon: null, createdBy: null, archived: false, ...more })
const serving = (id: string, more: Partial<Serving>): Serving => ({ ...row, id, dishId: null, menuId: null, proposedBy: 'mia', cookedBy: 'mia', proposedAt: row.createdAt, note: 'a private note', suggestedDays: [], craving: null, priority: id, status: 'wishlist', plannedDate: null, plannedSlot: null, servedAt: null, eatenAt: null, skippedReason: null, proofPhotos: [], ...more })
const review = (id: string, servingId: string, dishId: string, overall: number): Review => ({ ...row, id, servingId, dishId, reviewerId: 'leo', reaction: null, extraReactions: [], overall, scores: {}, portionsEaten: 1, wouldEatAgain: null, comment: 'a private comment', chips: [], chefSelfRating: null, chefReaction: null, chefExtraReactions: [], chefReply: null, sealedAt: null }) as Review

const TODAY = '2026-11-12'
const roesti = dish('r', 'Rösti', { tags: ['Swiss', 'potato'], effort: 'easy', recipe: { servings: 2, prepMinutes: 10, cookMinutes: 30, ingredients: [{ quantity: 600, unit: 'g', name: 'Kartoffeln' }, { quantity: 2, unit: 'EL', name: 'Butter' }, { name: 'Salz' }], steps: [{ text: 'Kartoffeln  reiben.' }, { text: 'In Butter 30 Minuten braten.', timerSeconds: 1800 }], notes: 'Am Vortag kochen.' }, nutrition: { kcalPerServing: 520, proteinG: 9, isEstimate: true } })
const fondue = dish('f', 'Fondue', { description: 'Käse,   geschmolzen.' })
const old = dish('o', 'An old one', { archived: true })
const gone = dish('g', 'Gone', { deletedAt: '2026-11-02T00:00:00.000Z' })
const brunch: Menu = { ...row, id: 'm', name: 'Brunch', description: null, courses: [{ dishId: 'r', order: 0 }, { dishId: 'f', order: 1 }], createdBy: null, archived: false }

const parts = {
  dishes: [roesti, old, gone, fondue],
  menus: [brunch],
  servings: [
    serving('1', { dishId: 'f', status: 'planned', plannedDate: '2026-11-13', plannedSlot: 'dinner', cookedBy: 'leo' }),
    serving('2', { dishId: 'r', status: 'planned', plannedDate: '2026-11-13', plannedSlot: 'breakfast' }),
    serving('3', { dishId: 'r', status: 'planned', plannedDate: '2026-11-10', plannedSlot: 'dinner' }), // slipped by: not ahead any more
    serving('4', { menuId: 'm', status: 'wishlist', craving: 4, suggestedDays: ['2026-11-01', '2026-12-24'] }),
    serving('5', { dishId: 'f', status: 'wishlist' }),
    serving('6', { dishId: 'r', status: 'eaten', eatenAt: '2026-11-02T18:30:00.000Z', plannedSlot: 'dinner' }),
    serving('7', { dishId: 'r', status: 'eaten', eatenAt: '2026-10-20T11:30:00.000Z', plannedSlot: 'lunch' }),
    serving('8', { dishId: 'o', status: 'eaten', eatenAt: '2026-10-01T18:00:00.000Z' }), // the dish is archived: nothing to name
    serving('9', { dishId: 'f', status: 'skipped' }),
  ],
  reviews: [review('a', '6', 'r', 5), review('b', '7', 'r', 4), { ...review('c', '6', 'r', 1), deletedAt: 'x' } as Review],
  pantry: [{ ...row, id: 'p', name: 'Mehl', amount: '1 kg' } as PantryItem],
  basket: [{ ...row, id: 'b1', name: 'Milch', amount: '2 l', state: 'open' } as BasketItem, { ...row, id: 'b2', name: 'Brot', amount: null, state: 'open' } as BasketItem, { ...row, id: 'b3', name: 'Zucker', amount: null, state: 'suggested' } as BasketItem, { ...row, id: 'b4', name: 'Eier', amount: null, state: 'bought' } as BasketItem],
}

describe('the kitchen, as Fork is told', () => {
  const brief = kitchenBrief(parts, 'leo', TODAY, true)

  it('lists the recipe book by name, with what the phone knows, and gives each dish a ref', () => {
    expect(brief.kitchen.dishes).toEqual(['D1 | Fondue | main | never eaten', 'D2 | Rösti | main, 40 min, easy, 520 kcal, tags: Swiss, potato | eaten 2 times, last 2026-11-02, liked 4.5 of 5', 'Menu "Brunch": D2, D1'])
    expect([...brief.dishOf]).toEqual([['D1', 'f'], ['D2', 'r']])
    expect(brief.refOf.get('r')).toBe('D2')
    // Archived and deleted dishes are not in the book that is told.
    expect(brief.refOf.has('o')).toBe(false)
    expect(brief.refOf.has('g')).toBe(false)
  })

  it('tells what is planned from today on, in order, and who cooks, from this person\'s side', () => {
    expect(brief.kitchen.plan).toEqual(['2026-11-13 (Friday), breakfast: D2 Rösti, your partner cooks', '2026-11-13 (Friday), dinner: D1 Fondue, you cook'])
    expect(kitchenBrief(parts, 'mia', TODAY, true).kitchen.plan[0]).toBe('2026-11-13 (Friday), breakfast: D2 Rösti, you cook')
  })

  it('tells the wishes with their hearts and the good days that are still ahead', () => {
    expect(brief.kitchen.wishes).toEqual(['the menu "Brunch" (D2, D1), 4 of 5 hearts, your partner cooks, good days: 2026-12-24', 'D1 Fondue, no hearts yet, your partner cooks'])
  })

  it('tells what was eaten lately, newest first, with how it was liked', () => {
    expect(brief.kitchen.eaten).toEqual(['2026-11-02, dinner: D2 Rösti, liked 5 of 5', '2026-10-20, lunch: D2 Rösti, liked 4 of 5'])
  })

  it('tells the pantry and what is on the basket to buy', () => {
    expect(brief.kitchen.pantry).toHaveLength(1)
    expect(brief.kitchen.pantry[0]).toMatch(/^Mehl: 1 kg \(noted /)
    // Suggestions nobody accepted and things already bought are not "on the list".
    expect(brief.kitchen.basket).toEqual(['Milch: 2 l', 'Brot'])
    expect(brief.kitchen).toMatchObject({ today: TODAY, weekday: 'Thursday', calories: true })
  })

  it('never tells names of people, notes or comments, and no calories to somebody who has them switched off', () => {
    const told = JSON.stringify(brief.kitchen)
    for (const secret of ['mia', 'leo', 'a private note', 'a private comment']) expect(told).not.toContain(secret)
    const without = kitchenBrief(parts, 'leo', TODAY, false)
    expect(without.kitchen.calories).toBe(false)
    expect(JSON.stringify(without.kitchen)).not.toContain('kcal')
  })

  it('writes a whole recipe as one block that starts with its ref', () => {
    expect(wholeRecipe(roesti, 'D2', 'de', true)).toBe(
      ['D2 | Rösti | 2 servings', 'Ingredients:', '- 600 g Kartoffeln', '- 2 EL Butter', '- Salz', 'Steps:', '- Kartoffeln reiben.', '- In Butter 30 Minuten braten.', 'Notes: Am Vortag kochen.', 'Per serving (an estimate): 520 kcal, 9 g protein'].join('\n'),
    )
    expect(wholeRecipe(roesti, 'D2', 'de', false)).not.toContain('kcal')
    expect(wholeRecipe(fondue, 'D1', 'en', true)).toBe(['D1 | Fondue | 0 servings', 'Käse, geschmolzen.', 'Ingredients:', '- (none written down)', 'Steps:', '- (none written down)'].join('\n'))
    // No empty line inside: one recipe is one block.
    expect(wholeRecipe(roesti, 'D2', 'en', true)).not.toContain('\n\n')
  })

  it('finds the dishes a question names, the longer name first, without accents', () => {
    const book = [roesti, fondue, dish('re', 'Rösti mit Spiegelei'), dish('x', 'Ei')]
    expect(namedIn('Was ist im ROESTI drin?', book)).toEqual([])
    expect(namedIn('Was ist im Rösti drin?', book)).toEqual(['r'])
    expect(namedIn('wie viele kalorien hat rosti mit spiegelei', book)).toEqual(['re'])
    expect(namedIn('Fondue oder Rösti?', book)).toEqual(['f', 'r'])
    // Two letters are no name to go by.
    expect(namedIn('Ei oder nicht Ei', book)).toEqual([])
  })
})

describe('offers become buttons for real dishes', () => {
  it('turns refs into dishes and drops what this phone does not know', () => {
    const dishOf = new Map([['D1', 'f'], ['D2', 'r']])
    expect(
      settleOffers(
        [
          { kind: 'plan', dish: 'D2', day: '2026-11-13', slot: 'dinner' },
          { kind: 'wish', dish: 'D1' },
          { kind: 'dish', dish: 'D7' },
          { kind: 'basket', lines: [{ name: 'Rüebli', amount: '500 g' }] },
          { kind: 'recipe' },
          { kind: 'go', place: 'pantry' },
        ],
        dishOf,
      ),
    ).toEqual([{ kind: 'plan', dishId: 'r', day: '2026-11-13', slot: 'dinner' }, { kind: 'wish', dishId: 'f' }, { kind: 'basket', lines: [{ name: 'Rüebli', amount: '500 g' }] }, { kind: 'recipe' }, { kind: 'go', place: 'pantry' }])
  })
})

describe('the talk on the phone', () => {
  // The phone's little store, stood in for: the tests run without a browser.
  const kept = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => void kept.set(key, value), removeItem: (key: string) => void kept.delete(key), clear: () => kept.clear(), get length() { return kept.size } })
  beforeEach(() => kept.clear())
  const turn = (n: number, who: 'me' | 'fork' = n % 2 === 0 ? 'me' : 'fork'): Turn => ({ id: `t${n}`, who, text: `said ${n}` })

  it('is kept per person, and separately for the demo kitchen', () => {
    saveTalk('leo', [turn(0), { ...turn(1), offers: [{ kind: 'go', place: 'week' }], done: { 0: 'Opened' } }])
    expect(loadTalk('leo')).toEqual([turn(0), { ...turn(1), offers: [{ kind: 'go', place: 'week' }], done: { 0: 'Opened' } }])
    expect(loadTalk('mia')).toEqual([])
    expect(loadTalk('leo', true)).toEqual([])
    saveTalk('leo', [])
    expect(localStorage.length).toBe(0)
  })

  it('keeps only the last turns, and survives a broken store', () => {
    saveTalk('leo', Array.from({ length: KEPT_TURNS + 10 }, (_, n) => turn(n)))
    expect(loadTalk('leo')).toHaveLength(KEPT_TURNS)
    expect(loadTalk('leo')[0].id).toBe('t10')
    localStorage.setItem('foodwishus.fork.leo', '{not json')
    expect(loadTalk('leo')).toEqual([])
    localStorage.setItem('foodwishus.fork.leo', JSON.stringify([turn(0), { who: 'somebody', text: 1 }, 'nonsense']))
    expect(loadTalk('leo')).toEqual([turn(0)])
  })

  it('sends the last turns with the question, starting with something the person said, words only', () => {
    expect(toSend([], 'Hi')).toEqual([{ who: 'me', text: 'Hi' }])
    const long = Array.from({ length: 30 }, (_, n) => ({ ...turn(n), offers: [{ kind: 'recipe' as const }] }))
    const sent = toSend(long, 'And now?')
    expect(sent).toHaveLength(SENT_TURNS + 1)
    expect(sent[0]).toEqual({ who: 'me', text: 'said 18' })
    expect(sent.at(-1)).toEqual({ who: 'me', text: 'And now?' })
    // A cut that would start with Fork starts one later.
    expect(toSend([turn(1, 'fork'), turn(2, 'me'), turn(3, 'fork')], 'x').map((entry) => entry.text)).toEqual(['said 2', 'said 3', 'x'])
  })
})
