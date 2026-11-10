import { describe, expect, it } from 'vitest'
import type { Course, Dish, Ingredient } from '../../src/data/types'
import {
  addTag,
  changedFields,
  cleanSource,
  coursesInUse,
  detectTimerMinutes,
  dishInputFromDraft,
  draftFromDish,
  emptyDraft,
  filterDishes,
  formatAmount,
  formatCountdown,
  formatDuration,
  formatIngredient,
  formatTimer,
  ingredientsForStep,
  insertByCourse,
  matchReason,
  matchesDish,
  matchesMenu,
  menuCalories,
  menuMinutes,
  moveItem,
  normalize,
  nutritionFromDraft,
  orderedCourses,
  parseAmount,
  parseIngredientLine,
  parseIngredientList,
  parseQuantity,
  quantityInputValue,
  recipeFromDraft,
  sameValue,
  scaleQuantity,
  sortDishes,
  sortMenus,
  sourceLink,
  suggestTags,
  totalMinutes,
} from '../../src/features/recipes/logic'

let n = 0
function dish(overrides: Partial<Dish> = {}): Dish {
  n += 1
  return {
    id: `dish-${n}`,
    householdId: 'home',
    createdAt: `2026-11-${String(n).padStart(2, '0')}T10:00:00.000Z`,
    updatedAt: '2026-11-10T10:00:00.000Z',
    deletedAt: null,
    name: `Dish ${n}`,
    description: null,
    course: 'main',
    tags: [],
    effort: null,
    recipe: {},
    nutrition: {},
    coverPhotoId: null,
    icon: null,
    createdBy: null,
    archived: false,
    ...overrides,
  }
}

const amount = (value: number, unit: string | undefined, lang: 'en' | 'de' = 'en', scaled = true) => {
  const a = formatAmount(value, unit, lang, scaled)
  return a.unit ? `${a.quantity} ${a.unit}` : a.quantity
}

describe('reading what people type', () => {
  it('understands decimals, fractions and fraction signs', () => {
    expect(parseQuantity('2')).toBe(2)
    expect(parseQuantity('1.5')).toBe(1.5)
    expect(parseQuantity('1,5')).toBe(1.5)
    expect(parseQuantity('1/2')).toBe(0.5)
    expect(parseQuantity('1 1/2')).toBe(1.5)
    expect(parseQuantity('½')).toBe(0.5)
    expect(parseQuantity('1½')).toBe(1.5)
    expect(parseQuantity('2 ¾')).toBe(2.75)
    expect(parseQuantity('1/3')).toBeCloseTo(0.3333, 3)
  })

  it('says "not a number" instead of guessing', () => {
    for (const text of ['', '  ', 'two', '1/0', '-2', '1.2.3', '2 eggs']) expect(parseQuantity(text)).toBeUndefined()
  })

  it('keeps an empty form field unknown, and a typed zero zero', () => {
    expect(parseAmount('')).toBeUndefined()
    expect(parseAmount('   ')).toBeUndefined()
    expect(parseAmount('abc')).toBeUndefined()
    expect(parseAmount('0')).toBe(0)
    expect(parseAmount('520')).toBe(520)
    expect(parseAmount('12,5')).toBe(12.5)
  })

  it('writes an amount back in a form the field can read again', () => {
    expect(quantityInputValue(undefined)).toBe('')
    expect(quantityInputValue(2)).toBe('2')
    expect(quantityInputValue(0.5)).toBe('0.5')
    expect(quantityInputValue(1 / 3)).toBe('1/3')
    expect(quantityInputValue(1 + 2 / 3)).toBe('1 2/3')
    for (const value of [2, 0.5, 1 / 3, 1 + 2 / 3, 0.125]) expect(parseQuantity(quantityInputValue(value))).toBeCloseTo(value, 3)
  })
})

describe('typed ingredients', () => {
  it('splits amount, unit and name', () => {
    expect(parseIngredientLine('200 g flour')).toEqual({ quantity: 200, unit: 'g', name: 'flour' })
    expect(parseIngredientLine('200g Mehl')).toEqual({ quantity: 200, unit: 'g', name: 'Mehl' })
    expect(parseIngredientLine('1 1/2 cups milk')).toEqual({ quantity: 1.5, unit: 'cups', name: 'milk' })
    expect(parseIngredientLine('1½ dl Rahm')).toEqual({ quantity: 1.5, unit: 'dl', name: 'Rahm' })
    expect(parseIngredientLine('2 EL Olivenöl')).toEqual({ quantity: 2, unit: 'EL', name: 'Olivenöl' })
    expect(parseIngredientLine('1,5 kg Kartoffeln')).toEqual({ quantity: 1.5, unit: 'kg', name: 'Kartoffeln' })
    expect(parseIngredientLine('2 cups of sugar')).toEqual({ quantity: 2, unit: 'cups', name: 'sugar' })
    expect(parseIngredientLine('1 Stk. Zwiebel')).toEqual({ quantity: 1, unit: 'Stk', name: 'Zwiebel' })
  })

  it('leaves the unit out when there is none', () => {
    expect(parseIngredientLine('2 eggs')).toEqual({ quantity: 2, name: 'eggs' })
    expect(parseIngredientLine('3 large onions')).toEqual({ quantity: 3, name: 'large onions' })
    expect(parseIngredientLine('½ lemon')).toEqual({ quantity: 0.5, name: 'lemon' })
    expect(parseIngredientLine('salt')).toEqual({ name: 'salt' })
    expect(parseIngredientLine('Salz und Pfeffer')).toEqual({ name: 'Salz und Pfeffer' })
  })

  it('does not mistake a word that starts like a unit for one', () => {
    expect(parseIngredientLine('2 garlic cloves')).toEqual({ quantity: 2, name: 'garlic cloves' })
    expect(parseIngredientLine('1 lemon')).toEqual({ quantity: 1, name: 'lemon' })
    expect(parseIngredientLine('3 gelbe Peperoni')).toEqual({ quantity: 3, name: 'gelbe Peperoni' })
  })

  it('keeps a range whole, because it cannot be scaled honestly', () => {
    expect(parseIngredientLine('2-3 tomatoes')).toEqual({ name: '2-3 tomatoes' })
    expect(parseIngredientLine('2 bis 3 Tomaten')).toEqual({ name: '2 bis 3 Tomaten' })
  })

  it('never loses what was typed', () => {
    expect(parseIngredientLine('  ')).toBeNull()
    expect(parseIngredientLine('250')).toEqual({ name: '250' })
    expect(parseIngredientLine('2 EL')).toEqual({ quantity: 2, name: 'EL' })
  })

  it('takes a pasted list, bullets and all', () => {
    expect(parseIngredientList('- 400 g Hörnli\n• 2 Zwiebeln\n\n1. 200 ml Rahm\n* Salz')).toEqual([
      { quantity: 400, unit: 'g', name: 'Hörnli' },
      { quantity: 2, name: 'Zwiebeln' },
      { quantity: 200, unit: 'ml', name: 'Rahm' },
      { name: 'Salz' },
    ])
  })
})

describe('scaling and formatting amounts', () => {
  it('scales by servings', () => {
    expect(scaleQuantity(200, 2, 4)).toBe(400)
    expect(scaleQuantity(3, 4, 2)).toBe(1.5)
    expect(scaleQuantity(1, 3, 1)).toBeCloseTo(0.3333, 3)
    expect(scaleQuantity(100, undefined, 3)).toBe(300)
    expect(scaleQuantity(100, 0, 3)).toBe(300)
  })

  it('shows kitchen fractions for spoons, cups and things you count', () => {
    expect(amount(0.5, 'tbsp')).toBe('½ tbsp')
    expect(amount(1.5, 'tbsp')).toBe('1½ tbsp')
    expect(amount(0.33, 'cup')).toBe('⅓ cup')
    expect(amount(0.3333, undefined)).toBe('⅓')
    expect(amount(0.6667, 'TL')).toBe('⅔ TL')
    expect(amount(0.25, 'tsp')).toBe('¼ tsp')
    expect(amount(2.75, 'cups')).toBe('2¾ cups')
    expect(amount(3, undefined)).toBe('3')
    expect(amount(1.02, undefined)).toBe('1')
    expect(amount(1.9, undefined)).toBe('2')
    expect(amount(4.5, undefined)).toBe('4½')
    expect(amount(24.4, undefined)).toBe('24')
  })

  it('never rounds a small amount away to nothing', () => {
    expect(amount(0.05, 'tsp')).toBe('⅛ tsp')
    expect(amount(0.1, undefined)).toBe('⅛')
    expect(amount(0.2, 'g')).toBe('0.5 g')
  })

  it('rounds grams and millilitres to what a kitchen scale can do', () => {
    expect(amount(2.5, 'g')).toBe('2.5 g')
    expect(amount(7.3, 'g')).toBe('7.5 g')
    expect(amount(16.67, 'g')).toBe('17 g')
    expect(amount(66.67, 'g')).toBe('65 g')
    expect(amount(133.33, 'g')).toBe('135 g')
    expect(amount(333.33, 'g')).toBe('335 g')
    expect(amount(375, 'g')).toBe('375 g')
    expect(amount(583.33, 'g')).toBe('580 g')
    expect(amount(666.67, 'ml')).toBe('670 ml')
    expect(amount(250, 'ml')).toBe('250 ml')
  })

  it('rolls over into the bigger or smaller unit', () => {
    expect(amount(1500, 'g')).toBe('1.5 kg')
    expect(amount(1250, 'ml')).toBe('1.25 l')
    expect(amount(1000, 'g')).toBe('1 kg')
    expect(amount(0.25, 'kg')).toBe('250 g')
    expect(amount(0.375, 'l')).toBe('375 ml')
    expect(amount(1.333, 'kg')).toBe('1.35 kg')
    expect(amount(15, 'dl')).toBe('1.5 l')
  })

  it('keeps decilitres the Swiss way', () => {
    expect(amount(1.33, 'dl')).toBe('1.5 dl')
    expect(amount(2.67, 'dl')).toBe('2.5 dl')
    expect(amount(0.67, 'dl')).toBe('0.75 dl')
    expect(amount(4, 'dl')).toBe('4 dl')
  })

  it('uses a decimal comma in German', () => {
    expect(amount(1500, 'g', 'de')).toBe('1,5 kg')
    expect(amount(2.5, 'dl', 'de')).toBe('2,5 dl')
    expect(amount(1.5, 'EL', 'de')).toBe('1½ EL')
  })

  it('shows an unscaled recipe exactly as written', () => {
    expect(amount(133, 'g', 'en', false)).toBe('133 g')
    expect(amount(1200, 'g', 'en', false)).toBe('1200 g')
    expect(amount(0.5, undefined, 'en', false)).toBe('½')
    expect(amount(1.5, 'cups', 'en', false)).toBe('1½ cups')
    expect(amount(0.33, 'cup', 'en', false)).toBe('⅓ cup')
    expect(amount(0.3, 'cup', 'en', false)).toBe('0.3 cup')
    expect(amount(0.125, 'tsp', 'en', false)).toBe('⅛ tsp')
    expect(amount(1.2, 'dl', 'de', false)).toBe('1,2 dl')
  })

  it('formats a whole ingredient line', () => {
    const flour: Ingredient = { quantity: 200, unit: 'g', name: 'flour' }
    expect(formatIngredient(flour, 1, 'en')).toEqual({ amount: '200 g', name: 'flour' })
    expect(formatIngredient(flour, 1.5, 'en')).toEqual({ amount: '300 g', name: 'flour' })
    expect(formatIngredient({ quantity: 3, name: 'eggs' }, 0.5, 'en')).toEqual({ amount: '1½', name: 'eggs' })
    expect(formatIngredient({ name: 'salt' }, 3, 'en')).toEqual({ amount: '', name: 'salt' })
    expect(formatIngredient({ quantity: 1, unit: 'tbsp', name: 'oil' }, 1 / 3, 'en')).toEqual({ amount: '⅓ tbsp', name: 'oil' })
  })
})

describe('time', () => {
  it('adds prep and cooking, and admits when it does not know', () => {
    expect(totalMinutes({ prepMinutes: 15, cookMinutes: 30 })).toBe(45)
    expect(totalMinutes({ cookMinutes: 30 })).toBe(30)
    expect(totalMinutes({ prepMinutes: 10 })).toBe(10)
    expect(totalMinutes({})).toBeNull()
    expect(totalMinutes({ prepMinutes: 0, cookMinutes: 0 })).toBeNull()
  })

  it('writes durations in both languages', () => {
    expect(formatDuration(45, 'en')).toBe('45 min')
    expect(formatDuration(60, 'en')).toBe('1 h')
    expect(formatDuration(75, 'en')).toBe('1 h 15 min')
    expect(formatDuration(75, 'de')).toBe('1 Std. 15 Min.')
    expect(formatDuration(20, 'de')).toBe('20 Min.')
  })

  it('writes step timers down to the second', () => {
    expect(formatTimer(720, 'en')).toBe('12 min')
    expect(formatTimer(90, 'en')).toBe('1 min 30 s')
    expect(formatTimer(30, 'de')).toBe('30 Sek.')
    expect(formatTimer(3600, 'de')).toBe('1 Std.')
    expect(formatTimer(3690, 'en')).toBe('1 h 1 min 30 s')
  })

  it('counts down and lands on zero', () => {
    expect(formatCountdown(754_000)).toBe('12:34')
    expect(formatCountdown(59_001)).toBe('1:00')
    expect(formatCountdown(999)).toBe('0:01')
    expect(formatCountdown(0)).toBe('0:00')
    expect(formatCountdown(-500)).toBe('0:00')
    expect(formatCountdown(3_723_000)).toBe('1:02:03')
  })

  it('spots a duration in a step', () => {
    expect(detectTimerMinutes('Simmer for 20 minutes.')).toBe(20)
    expect(detectTimerMinutes('20 Minuten köcheln lassen')).toBe(20)
    expect(detectTimerMinutes('Bake 8-10 min until golden')).toBe(8)
    expect(detectTimerMinutes('Den Teig 1 Stunde ruhen lassen')).toBe(60)
    expect(detectTimerMinutes('Rest for 1.5 hours')).toBe(90)
    expect(detectTimerMinutes('Sear for 30 seconds per side')).toBe(0.5)
    expect(detectTimerMinutes('45 Sek. anbraten')).toBe(0.75)
  })

  it('does not see timers where there are none', () => {
    expect(detectTimerMinutes('Heat the oven to 180 degrees')).toBeNull()
    expect(detectTimerMinutes('Add 200 g flour and 3 small onions')).toBeNull()
    expect(detectTimerMinutes('Add 2 handfuls of spinach')).toBeNull()
    expect(detectTimerMinutes('Stir.')).toBeNull()
  })
})

describe('search and sort', () => {
  const rosti = dish({ name: 'Rösti mit Spiegelei', tags: ['Swiss', 'Comfort'], recipe: { prepMinutes: 10, cookMinutes: 25, ingredients: [{ name: 'Kartoffeln' }, { name: 'Butter' }] }, nutrition: { kcalPerServing: 480 } })
  const lasagne = dish({ name: 'Lasagne al forno', tags: ['Italian'], description: 'Layers of love', recipe: { prepMinutes: 30, cookMinutes: 45, ingredients: [{ name: 'Parmesan' }, { name: 'Butter' }] }, nutrition: { kcalPerServing: 640 } })
  const salad = dish({ name: 'Apple salad', course: 'starter', recipe: { prepMinutes: 10 }, nutrition: {} })
  const strudel = dish({ name: 'Äpfelstrudel', course: 'dessert', archived: true, nutrition: { kcalPerServing: 390 } })
  const all = [rosti, lasagne, salad, strudel]

  it('ignores case and accents', () => {
    expect(normalize('Rösti')).toBe('rosti')
    expect(normalize('  GROSSE Süßspeise ')).toBe('grosse sussspeise')
    expect(matchesDish(rosti, 'rosti')).toBe(true)
    expect(matchesDish(rosti, 'RÖSTI')).toBe(true)
  })

  it('finds a dish by name, tag, description or ingredient', () => {
    expect(matchesDish(lasagne, 'forno')).toBe(true)
    expect(matchesDish(lasagne, 'italian')).toBe(true)
    expect(matchesDish(lasagne, 'love')).toBe(true)
    expect(matchesDish(lasagne, 'parmesan')).toBe(true)
    expect(matchesDish(lasagne, 'kartoffel')).toBe(false)
    expect(matchesDish(lasagne, '')).toBe(true)
  })

  it('needs every word of the search to match', () => {
    expect(matchesDish(rosti, 'swiss butter')).toBe(true)
    expect(matchesDish(rosti, 'swiss parmesan')).toBe(false)
  })

  it('explains a match that is not in the name', () => {
    expect(matchReason(lasagne, 'parm')).toBe('Parmesan')
    expect(matchReason(rosti, 'swiss')).toBe('Swiss')
    expect(matchReason(rosti, 'rösti')).toBeNull()
    expect(matchReason(rosti, '')).toBeNull()
    expect(matchReason(rosti, 'rösti butter')).toBe('Butter')
  })

  it('sorts A to Z without tripping over umlauts', () => {
    expect(sortDishes(all, 'az').map((d) => d.name)).toEqual(['Äpfelstrudel', 'Apple salad', 'Lasagne al forno', 'Rösti mit Spiegelei'])
  })

  it('sorts newest first', () => {
    expect(sortDishes(all, 'newest').map((d) => d.name)).toEqual(['Äpfelstrudel', 'Apple salad', 'Lasagne al forno', 'Rösti mit Spiegelei'])
    expect(sortDishes([rosti, lasagne], 'newest')[0]).toBe(lasagne)
  })

  it('sorts quickest first, with unknown times last', () => {
    expect(sortDishes(all, 'quickest').map((d) => d.name)).toEqual(['Apple salad', 'Rösti mit Spiegelei', 'Lasagne al forno', 'Äpfelstrudel'])
  })

  it('sorts fewest calories first, with unknown calories last', () => {
    expect(sortDishes(all, 'lightest').map((d) => d.name)).toEqual(['Äpfelstrudel', 'Rösti mit Spiegelei', 'Lasagne al forno', 'Apple salad'])
  })

  it('combines search, course filter and the archive switch', () => {
    const q = { query: '', course: null, sort: 'az' as const, showArchived: false }
    expect(filterDishes(all, q).map((d) => d.name)).toEqual(['Apple salad', 'Lasagne al forno', 'Rösti mit Spiegelei'])
    expect(filterDishes(all, { ...q, showArchived: true })).toHaveLength(4)
    expect(filterDishes(all, { ...q, course: 'starter' }).map((d) => d.name)).toEqual(['Apple salad'])
    expect(filterDishes(all, { ...q, query: 'butter', sort: 'lightest' }).map((d) => d.name)).toEqual(['Rösti mit Spiegelei', 'Lasagne al forno'])
    expect(filterDishes(all, { ...q, query: 'butter', course: 'dessert' })).toEqual([])
  })

  it('offers only the courses that have dishes, in menu order', () => {
    expect(coursesInUse(all)).toEqual(['starter', 'main', 'dessert'])
    expect(coursesInUse([])).toEqual([])
  })
})

describe('menus', () => {
  const starter = dish({ course: 'starter', recipe: { prepMinutes: 15 }, nutrition: { kcalPerServing: 180 } })
  const main = dish({ course: 'main', recipe: { prepMinutes: 20, cookMinutes: 40 }, nutrition: { kcalPerServing: 620 } })
  const dessert = dish({ course: 'dessert', recipe: {}, nutrition: {} })

  it('adds up the calories of its courses', () => {
    expect(menuCalories([starter, main])).toEqual({ total: 800, known: 2, unknown: 0 })
  })

  it('counts unknown courses instead of treating them as zero', () => {
    expect(menuCalories([starter, main, dessert])).toEqual({ total: 800, known: 2, unknown: 1 })
    expect(menuCalories([dessert])).toEqual({ total: 0, known: 0, unknown: 1 })
    expect(menuCalories([starter, undefined])).toEqual({ total: 180, known: 1, unknown: 1 })
    expect(menuCalories([])).toEqual({ total: 0, known: 0, unknown: 0 })
  })

  it('treats a typed zero as known', () => {
    const water = dish({ nutrition: { kcalPerServing: 0 } })
    expect(menuCalories([water, starter])).toEqual({ total: 180, known: 2, unknown: 0 })
  })

  it('adds up the time the same way', () => {
    expect(menuMinutes([starter, main])).toEqual({ total: 75, known: 2, unknown: 0 })
    expect(menuMinutes([starter, main, dessert, null])).toEqual({ total: 75, known: 2, unknown: 2 })
  })

  it('reads the courses in their saved order', () => {
    expect(orderedCourses({ courses: [{ dishId: 'c', order: 2 }, { dishId: 'a', order: 0 }, { dishId: 'b', order: 1 }] }).map((c) => c.dishId)).toEqual(['a', 'b', 'c'])
  })

  it('sorts menus by name or newest first', () => {
    const menus = [
      { name: 'Zopf brunch', createdAt: '2026-11-01T10:00:00.000Z' },
      { name: 'Älpler evening', createdAt: '2026-11-03T10:00:00.000Z' },
      { name: 'Date night', createdAt: '2026-11-02T10:00:00.000Z' },
    ]
    expect(sortMenus(menus, 'az').map((m) => m.name)).toEqual(['Älpler evening', 'Date night', 'Zopf brunch'])
    expect(sortMenus(menus, 'newest').map((m) => m.name)).toEqual(['Älpler evening', 'Date night', 'Zopf brunch'])
    expect(sortMenus(menus.slice(0, 2), 'newest')[0].name).toBe('Älpler evening')
  })

  it('finds a menu by its name or by a dish in it', () => {
    const menu = { name: 'Sunday feast', description: 'For slow afternoons' }
    expect(matchesMenu(menu, ['Rösti', 'Apfelstrudel'], 'feast')).toBe(true)
    expect(matchesMenu(menu, ['Rösti', 'Apfelstrudel'], 'strudel')).toBe(true)
    expect(matchesMenu(menu, ['Rösti'], 'slow sunday')).toBe(true)
    expect(matchesMenu(menu, ['Rösti'], 'lasagne')).toBe(false)
  })

  it('slots a new dish into its natural place', () => {
    const c = (course: Course, id: string) => ({ course, id })
    const ids = (list: { id: string }[]) => list.map((x) => x.id)
    expect(ids(insertByCourse([], c('main', 'm')))).toEqual(['m'])
    expect(ids(insertByCourse([c('main', 'm')], c('starter', 's')))).toEqual(['s', 'm'])
    expect(ids(insertByCourse([c('starter', 's'), c('dessert', 'd')], c('main', 'm')))).toEqual(['s', 'm', 'd'])
    expect(ids(insertByCourse([c('starter', 's'), c('main', 'm1')], c('main', 'm2')))).toEqual(['s', 'm1', 'm2'])
    expect(ids(insertByCourse([c('starter', 's'), c('main', 'm')], c('drink', 'x')))).toEqual(['s', 'm', 'x'])
  })

  it('stops guessing once the order was changed by hand', () => {
    const c = (course: Course, id: string) => ({ course, id })
    expect(insertByCourse([c('dessert', 'd'), c('main', 'm')], c('starter', 's')).map((x) => x.id)).toEqual(['d', 'm', 's'])
  })
})

describe('cook mode', () => {
  const ingredients = [{ name: 'eggs' }, { name: 'brown sugar' }, { name: 'Butter' }, { name: 'Buttermilch' }, { name: 'olive oil' }, { name: 'Zwiebeln' }, { name: 'fresh thyme' }]
  const names = (text: string) => ingredientsForStep(text, ingredients).map((i) => ingredients[i].name)

  it('finds the ingredients a step talks about', () => {
    expect(names('Whisk the eggs with the sugar until pale.')).toEqual(['eggs', 'brown sugar'])
    expect(names('Crack one egg into the pan with a little oil')).toEqual(['eggs', 'olive oil'])
    expect(names('Die Zwiebel fein hacken und in Butter andünsten')).toEqual(['Butter', 'Zwiebeln'])
  })

  it('does not confuse butter with buttermilk, or filler words with food', () => {
    expect(names('Buttermilch dazugiessen')).toEqual(['Buttermilch'])
    expect(names('Serve with fresh bread')).toEqual([])
    expect(names('Let it rest.')).toEqual([])
  })

  it('goes by the name of an ingredient, not by how it is prepared or measured', () => {
    const list = [{ name: 'veal, cut into thin strips against the grain' }, { name: 'a generous handful of flat-leaf parsley, roughly chopped' }, { name: 'a pinch of salt' }, { name: 'Ei' }, { name: 'Kartoffeln (festkochend), gewürfelt' }]
    const found = (text: string) => ingredientsForStep(text, list).map((i) => list[i].name.split(/[,(]/)[0].trim())
    expect(found('Sear the veal in two batches instead of stewing it.')).toEqual(['veal'])
    expect(found('Cut the bread into thin strips and add a pinch of sugar.')).toEqual([])
    expect(found('Scatter the parsley on top and season with salt.')).toEqual(['a generous handful of flat-leaf parsley', 'a pinch of salt'])
    expect(found('Das Ei in die Pfanne schlagen, die Kartoffeln wenden.')).toEqual(['Ei', 'Kartoffeln'])
    expect(found('Ein Glas Wasser dazugeben.')).toEqual([])
  })
})

describe('the dish form', () => {
  it('never turns an empty calorie field into zero', () => {
    const draft = emptyDraft()
    expect(nutritionFromDraft(draft)).toEqual({})
    expect('kcalPerServing' in nutritionFromDraft({ ...draft, protein: '12' })).toBe(false)
    expect(nutritionFromDraft({ ...draft, kcal: '520', protein: '24', carbs: '', fat: '18,5', isEstimate: true })).toEqual({ kcalPerServing: 520, proteinG: 24, fatG: 18.5, isEstimate: true })
    expect(nutritionFromDraft({ ...draft, kcal: '0' })).toEqual({ kcalPerServing: 0 })
  })

  it('does not label nothing as an estimate', () => {
    expect(nutritionFromDraft({ ...emptyDraft(), isEstimate: true })).toEqual({})
  })

  it('drops empty rows and turns timer minutes into seconds', () => {
    const draft = {
      ...emptyDraft(),
      servings: 4,
      prepMinutes: '15',
      cookMinutes: '',
      ingredients: [
        { key: 'a', quantity: 200, unit: 'g', name: ' flour ' },
        { key: 'b', name: '  ' },
        { key: 'c', name: 'salt', unit: '' },
      ],
      steps: [
        { key: 'a', text: ' Mix. ', timerMinutes: '' },
        { key: 'b', text: '', timerMinutes: '5' },
        { key: 'c', text: 'Bake.', timerMinutes: '12' },
        { key: 'd', text: 'Sear.', timerMinutes: '0,5', photoId: 'photo-1' },
      ],
      notes: '  ',
      sourceUrl: 'chefkoch.de/rezept',
    }
    expect(recipeFromDraft(draft)).toEqual({
      servings: 4,
      prepMinutes: 15,
      ingredients: [{ quantity: 200, unit: 'g', name: 'flour' }, { name: 'salt' }],
      steps: [{ text: 'Mix.' }, { text: 'Bake.', timerSeconds: 720 }, { text: 'Sear.', timerSeconds: 30, photoId: 'photo-1' }],
      sourceUrl: 'https://chefkoch.de/rezept',
    })
  })

  it('survives a round trip through the form unchanged', () => {
    const original = dish({
      name: 'Älplermagronen',
      description: 'Creamy, cheesy, gone in minutes',
      course: 'main',
      effort: 'easy',
      tags: ['Swiss'],
      icon: 'whisk',
      recipe: {
        servings: 4,
        prepMinutes: 10,
        cookMinutes: 25,
        ingredients: [{ quantity: 400, unit: 'g', name: 'Hörnli' }, { quantity: 1 / 3, unit: 'cup', name: 'cream' }, { name: 'salt' }],
        steps: [{ text: 'Boil.', timerSeconds: 600 }, { text: 'Serve.' }],
        notes: 'More cheese.',
        sourceUrl: 'https://example.com/a',
      },
      nutrition: { kcalPerServing: 640, proteinG: 22.5, isEstimate: true },
    })
    const input = dishInputFromDraft(draftFromDish(original))
    expect(input.recipe).toEqual(original.recipe)
    expect(input.nutrition).toEqual(original.nutrition)
    expect(input).toMatchObject({ name: 'Älplermagronen', description: 'Creamy, cheesy, gone in minutes', course: 'main', effort: 'easy', tags: ['Swiss'], icon: 'whisk', coverPhotoId: null })
  })

  it('sends only the fields that changed, so the other phone keeps its own edits', () => {
    const original = dish({ name: 'Rösti', tags: ['Swiss'], recipe: { servings: 2, ingredients: [{ name: 'Kartoffeln', quantity: 500, unit: 'g' }] }, nutrition: { kcalPerServing: 480 } })
    const draft = draftFromDish(original)
    // The form's own reading of the dish is the baseline, so opening and saving changes nothing.
    const before = dishInputFromDraft(draft)
    expect(changedFields(before, dishInputFromDraft(draftFromDish(original)))).toEqual({})
    expect(changedFields(before, dishInputFromDraft({ ...draft, name: 'Rösti deluxe' }))).toEqual({ name: 'Rösti deluxe' })
    expect(changedFields(before, dishInputFromDraft({ ...draft, kcal: '' }))).toEqual({ nutrition: {} })
    const more = changedFields(before, dishInputFromDraft({ ...draft, servings: 4, tags: ['Swiss', 'Quick'] }))
    expect(Object.keys(more).sort()).toEqual(['recipe', 'tags'])
  })

  it('compares values without caring about key order or missing keys', () => {
    expect(sameValue({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true)
    expect(sameValue({ a: 1, b: undefined }, { a: 1 })).toBe(true)
    expect(sameValue(null, undefined)).toBe(true)
    expect(sameValue({ a: 1 }, { a: 2 })).toBe(false)
    expect(sameValue([1, 2], [2, 1])).toBe(false)
    expect(sameValue([], {})).toBe(false)
    expect(sameValue(0, null)).toBe(false)
  })

  it('adds tags once, however they are typed', () => {
    expect(addTag([], ' #Swiss, ')).toEqual(['Swiss'])
    expect(addTag(['Swiss'], 'swiss')).toEqual(['Swiss'])
    expect(addTag(['Swiss'], '   ')).toEqual(['Swiss'])
    expect(addTag(['Swiss'], 'date  night')).toEqual(['Swiss', 'date night'])
  })

  it('suggests the tags the kitchen uses most', () => {
    const dishes = [{ tags: ['Swiss', 'Comfort'] }, { tags: ['swiss', 'Quick'] }, { tags: ['Comfort', 'Swiss'] }]
    expect(suggestTags(dishes, [])).toEqual(['Swiss', 'Comfort', 'Quick'])
    expect(suggestTags(dishes, ['SWISS'])).toEqual(['Comfort', 'Quick'])
    expect(suggestTags(dishes, [], 1)).toEqual(['Swiss'])
  })

  it('tells a link from a book', () => {
    expect(cleanSource('  ')).toBe('')
    expect(cleanSource('https://example.com/a')).toBe('https://example.com/a')
    expect(cleanSource('www.bettybossi.ch/rezept/1')).toBe('https://www.bettybossi.ch/rezept/1')
    expect(cleanSource("Grandma's book, p. 12")).toBe("Grandma's book, p. 12")
    expect(sourceLink('https://www.bettybossi.ch/rezept/1')).toEqual({ href: 'https://www.bettybossi.ch/rezept/1', label: 'bettybossi.ch' })
    expect(sourceLink("Grandma's book, p. 12")).toBeNull()
    expect(sourceLink(undefined)).toBeNull()
  })

  it('moves rows up and down', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b'])
    const same = ['a', 'b']
    expect(moveItem(same, 0, -1)).toBe(same)
    expect(moveItem(same, 1, 2)).toBe(same)
  })
})
