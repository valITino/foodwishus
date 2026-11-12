import { describe, expect, it } from 'vitest'
import type { BasketItem, Dish, Menu, PantryItem, Serving } from '../../src/data/types'
import { adding, covers, groupBasket, intoPantry, isAlwaysThere, mealLines, needs, pantryLines, parseLine, parseLines, plannedMeals, sameThing, sortPantry, stocking, sumAmounts } from '../../src/features/basket/logic'

const H = 'h1'
let n = 0
const row = () => ({ id: `id${++n}`, householdId: H, createdAt: `2026-11-12T10:00:${String(n).padStart(2, '0')}.000Z`, updatedAt: '2026-11-12T10:00:00.000Z', deletedAt: null })
const item = (name: string, over: Partial<BasketItem> = {}): BasketItem => ({ ...row(), name, amount: null, note: null, state: 'open', source: 'hand', reason: null, dishId: null, addedBy: 'mia', boughtAt: null, ...over })
const stock = (name: string, amount: string | null = null, over: Partial<PantryItem> = {}): PantryItem => ({ ...row(), name, amount, ...over })
const dish = (name: string, ingredients: Dish['recipe']['ingredients']): Dish => ({ ...row(), name, description: null, course: 'main', tags: [], effort: null, recipe: { servings: 2, ingredients }, nutrition: {}, coverPhotoId: null, icon: null, createdBy: 'mia', archived: false })
const meal = (dishId: string | null, day: string | null, over: Partial<Serving> = {}): Serving =>
  ({ ...row(), dishId, menuId: null, status: day ? 'planned' : 'wishlist', plannedDate: day, plannedSlot: day ? 'dinner' : null, proposedBy: 'mia', cookedBy: 'mia', proposedAt: null, craving: null, priority: 'a', note: null, servedAt: null, eatenAt: null, skippedReason: null, proofPhotos: [], ...over }) as unknown as Serving

describe('a typed line', () => {
  it('is understood whichever way round it was typed', () => {
    expect(parseLine('2 l milk', 'en')).toEqual({ name: 'Milk', amount: '2 l' })
    expect(parseLine('Milch 2 l', 'de')).toEqual({ name: 'Milch', amount: '2 l' })
    expect(parseLine('eier, 6', 'de')).toEqual({ name: 'Eier', amount: '6' })
    expect(parseLine('500g Mehl', 'de')).toEqual({ name: 'Mehl', amount: '500 g' })
    expect(parseLine('  butter ', 'en')).toEqual({ name: 'Butter', amount: null })
    expect(parseLine('- 3 Zwiebeln', 'de')).toEqual({ name: 'Zwiebeln', amount: '3' })
  })

  it('keeps what it cannot take apart as the name', () => {
    expect(parseLine('etwas Süsses für Leo', 'de')).toEqual({ name: 'Etwas Süsses für Leo', amount: null })
    expect(parseLine('2-3 Tomaten', 'de')).toEqual({ name: '2-3 Tomaten', amount: null })
    expect(parseLine('   ', 'de')).toBeNull()
  })

  it('can be several at once: one per line or per comma', () => {
    expect(parseLines('Milch 2 l, Butter\n6 Eier; Brot', 'de')).toEqual([{ name: 'Milch', amount: '2 l' }, { name: 'Butter', amount: null }, { name: 'Eier', amount: '6' }, { name: 'Brot', amount: null }])
    // A decimal comma is not a new thing.
    expect(parseLines('Rahm 2,5 dl', 'de')).toEqual([{ name: 'Rahm', amount: '2,5 dl' }])
  })
})

describe('the same thing under two names', () => {
  it('is found across capitals, accents and plurals', () => {
    expect(sameThing('Zwiebeln', 'zwiebel')).toBe(true)
    expect(sameThing('Eggs', 'egg')).toBe(true)
    expect(sameThing('Rüebli', 'rueebli')).toBe(false)
    expect(sameThing('Crème fraîche', 'creme fraiche')).toBe(true)
    expect(sameThing('Milch', 'Buttermilch')).toBe(false)
    expect(sameThing('', '')).toBe(false)
  })

  it('folds one plural ending and no more', () => {
    expect(sameThing('Onions', 'onion')).toBe(true)
    expect(sameThing('Tomaten', 'Tomate')).toBe(true)
    expect(sameThing('Bohnen', 'Bohne')).toBe(true)
    expect(covers('Onions', 'Onion')).toBe(true)
    expect(covers('Carrot', 'Carrots, peeled')).toBe(true)
  })

  it('knows salt, pepper and water however the recipe puts them', () => {
    for (const name of ['Salz', 'Salt and pepper', 'Plenty of black pepper', 'Salz und Pfeffer', 'Pfeffer aus der Mühle', 'Salt for the pasta water']) expect(isAlwaysThere({ name }), name).toBe(true)
    expect(isAlwaysThere({ name: 'Lukewarm water', quantity: 160 })).toBe(true)
    expect(isAlwaysThere({ name: 'Wasser', quantity: 2 })).toBe(true)
    for (const name of ['Salted butter', 'Pfefferminze', 'Watermelon', 'Black beans', 'Salzkartoffeln']) expect(isAlwaysThere({ name }), name).toBe(false)
    // Two peppers are vegetables; a teaspoon of pepper is not.
    expect(isAlwaysThere({ name: 'Pepper, red', quantity: 2 })).toBe(false)
    expect(isAlwaysThere({ name: 'Pepper', quantity: 1, unit: 'tsp' })).toBe(true)
  })

  it('at home covers an ingredient with more words around it, never by a part of a word', () => {
    expect(covers('Butter', 'butter, melted')).toBe(true)
    expect(covers('Olivenöl', 'Olivenöl extra vergine')).toBe(true)
    expect(covers('Rüebli', 'Rüebli (gross)')).toBe(true)
    expect(covers('Tomaten', 'gehackte Tomate')).toBe(true)
    expect(covers('Rahm', 'Sauerrahm')).toBe(false)
    expect(covers('Mehl', 'Maismehl')).toBe(false)
    expect(covers('Reis', 'Eis')).toBe(false)
  })
})

describe('the basket', () => {
  it('shows what to buy with the newest on top, what Fork suggests, and what is bought last-first', () => {
    const list = [item('Milk'), item('Butter'), item('Rüebli', { state: 'suggested', source: 'fork' }), item('Eggs', { state: 'bought', boughtAt: '2026-11-12T11:00:00.000Z' }), item('Bread', { state: 'bought', boughtAt: '2026-11-12T12:00:00.000Z' }), item('Gone', { deletedAt: '2026-11-12T09:00:00.000Z' })]
    const groups = groupBasket(list)
    expect(groups.open.map((i) => i.name)).toEqual(['Butter', 'Milk'])
    expect(groups.suggested.map((i) => i.name)).toEqual(['Rüebli'])
    expect(groups.bought.map((i) => i.name)).toEqual(['Bread', 'Eggs'])
  })

  it('never holds the same thing twice', () => {
    const milk = item('Milk', { amount: '1 l' })
    const eggs = item('Eggs', { state: 'bought', amount: '6' })
    const flour = item('Flour', { state: 'suggested', source: 'fork', amount: '500 g' })
    const list = [milk, eggs, flour]
    expect(adding(list, { name: 'Bread', amount: null })).toEqual({ kind: 'new' })
    // Already there: a typed amount replaces the old one, no amount keeps it.
    expect(adding(list, { name: 'milk', amount: '2 l' })).toEqual({ kind: 'there', item: milk, amount: '2 l' })
    expect(adding(list, { name: 'Milk', amount: null })).toEqual({ kind: 'there', item: milk, amount: '1 l' })
    // Ticked off or only suggested: back on the list.
    expect(adding(list, { name: 'egg', amount: null })).toEqual({ kind: 'reopen', item: eggs, amount: '6' })
    expect(adding(list, { name: 'Flour', amount: '1 kg' })).toEqual({ kind: 'reopen', item: flour, amount: '1 kg' })
  })

  it('moves what was bought into the pantry: an amount for what is there, a line for what is new', () => {
    const flour = stock('Mehl', 'fast leer')
    const pantry = [flour, stock('Salz')]
    const plan = intoPantry([{ name: 'Mehl', amount: '1 kg' }, { name: 'Milch', amount: '2 l' }, { name: 'Salz', amount: null }, { name: 'milch', amount: null }], pantry)
    expect(plan.update).toEqual([{ id: flour.id, amount: '1 kg' }])
    expect(plan.add).toEqual([{ name: 'Milch', amount: '2 l' }])
  })
})

describe('what the plan asks for', () => {
  const soup = dish('Rüeblisuppe', [{ quantity: 500, unit: 'g', name: 'Rüebli' }, { quantity: 1, name: 'Zwiebel' }, { quantity: 1, unit: 'dl', name: 'Rahm' }, { name: 'Salz' }])
  const roesti = dish('Rösti', [{ quantity: 800, unit: 'g', name: 'Kartoffeln' }, { quantity: 2, name: 'Zwiebeln' }, { quantity: 30, unit: 'g', name: 'Butter, geklärt' }])
  const salad = dish('Salat', [{ quantity: 200, unit: 'g', name: 'Rüebli' }, { quantity: 1, unit: 'EL', name: 'Rahm' }])
  const menu = { ...row(), name: 'Sonntag', description: null, courses: [{ dishId: salad.id, order: 1 }, { dishId: soup.id, order: 0 }] } as unknown as Menu
  const servings = [meal(roesti.id, '2026-11-14'), meal(soup.id, '2026-11-13'), meal(salad.id, null), meal(salad.id, '2026-11-30'), meal(roesti.id, '2026-11-13', { status: 'eaten' }), meal(null, '2026-11-15', { menuId: menu.id })]
  const meals = plannedMeals(servings, [soup, roesti, salad], [menu], '2026-11-12', '2026-11-18')

  it('is every planned meal in the window, each course of a menu on its own, in order', () => {
    expect(meals.map((m) => `${m.day} ${m.dishName}`)).toEqual(['2026-11-13 Rüeblisuppe', '2026-11-14 Rösti', '2026-11-15 Rüeblisuppe', '2026-11-15 Salat'])
  })

  it('leaves out what is at home, what is on the basket, and what is always there', () => {
    const found = needs(meals, [stock('Butter', '250 g'), stock('Rahm')], [item('Kartoffeln')], 'de')
    expect(found.map((need) => `${need.name}: ${need.amount}`)).toEqual(['Rüebli: 1,2 kg', 'Zwiebel: 4'])
  })

  it('says which meal asks first, and how many do', () => {
    const [carrots, onions] = needs(meals, [stock('Butter'), stock('Rahm')], [item('Kartoffeln')], 'de')
    expect(carrots).toMatchObject({ dishName: 'Rüeblisuppe', day: '2026-11-13', meals: 3 })
    expect(onions).toMatchObject({ dishName: 'Rüeblisuppe', meals: 3 })
  })

  it('does not count what is ticked off as on the basket, nor what was removed from the pantry as there', () => {
    const found = needs(meals, [stock('Rahm', null, { deletedAt: '2026-11-12T00:00:00Z' })], [item('Rüebli', { state: 'bought' })], 'de')
    expect(found.map((need) => need.name)).toEqual(['Rüebli', 'Zwiebel', 'Rahm', 'Kartoffeln', 'Butter'])
  })

  it('adds amounts of one unit and sets different ones side by side', () => {
    expect(sumAmounts([{ quantity: 200, unit: 'g', name: 'x' }, { quantity: 300, unit: 'g', name: 'x' }], 'en')).toBe('500 g')
    expect(sumAmounts([{ quantity: 1, unit: 'dl', name: 'Rahm' }, { quantity: 1, unit: 'EL', name: 'Rahm' }], 'de')).toBe('1 dl + 1 EL')
    expect(sumAmounts([{ name: 'Salz' }], 'de')).toBeNull()
  })

  it('reads as lines for the helper', () => {
    expect(mealLines(meals.slice(0, 1), 'de')).toEqual(['2026-11-13: Rüeblisuppe: 500 g Rüebli; 1 Zwiebel; 1 dl Rahm; Salz'])
    expect(mealLines([{ ...meals[0], ingredients: [] }], 'de')).toEqual(['2026-11-13: Rüeblisuppe: (no ingredients written down)'])
  })
})

describe('the pantry', () => {
  it('is in the order a person looks things up', () => {
    expect(sortPantry([stock('Zucker'), stock('äpfel'), stock('Mehl'), stock('Alt', null, { deletedAt: '2026-01-01T00:00:00Z' })], 'de').map((i) => i.name)).toEqual(['äpfel', 'Mehl', 'Zucker'])
  })

  it('knows what is there already', () => {
    const flour = stock('Mehl', '1 kg')
    expect(stocking([flour], { name: 'mehl', amount: '500 g' })).toEqual({ kind: 'there', item: flour })
    expect(stocking([flour], { name: 'Maismehl', amount: null })).toEqual({ kind: 'new' })
  })

  it('reads as lines for the helper, with how old each note is', () => {
    const now = new Date('2026-11-15T12:00:00.000Z').getTime()
    const lines = pantryLines([stock('Mehl', '1 kg', { updatedAt: '2026-11-12T10:00:00.000Z' }), stock('Eier', null, { updatedAt: '2026-11-15T08:00:00.000Z' }), stock('Milch', 'fast leer', { updatedAt: '2026-11-14T11:00:00.000Z' })], now)
    expect(lines).toEqual(['Mehl: 1 kg (noted 3 days ago)', 'Eier: there, amount not noted (noted today)', 'Milch: fast leer (noted yesterday)'])
  })
})
