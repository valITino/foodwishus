import { expect, test, type Locator, type Page } from '@playwright/test'

// The Cockpit, seen by Leo (the Taster) in the demo kitchen. The small kitchen below is
// built so that every tile has one right answer; the last test walks the full demo
// kitchen on a narrow phone. Nothing here touches a cloud.

type Kit = { db: any; actions: any }
const kitOf = 'window.__foodwishus'

// ----------------------------------------------------------------- helpers --

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' })
const today = () => dayFormat.format(new Date())

function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

/** 0 = Monday … 6 = Sunday. */
const weekdayIndex = (day: string) => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7

interface Options {
  lang?: 'en' | 'de'
  prefs?: object
  /** Open the full demo kitchen instead of the empty one. */
  full?: boolean
}

/** Open the demo kitchen on the Cockpit. */
async function openCockpit(page: Page, { lang = 'en', prefs = {}, full = false }: Options = {}): Promise<void> {
  await page.addInitScript(
    ([language, text]) => {
      localStorage.setItem('foodwishus.prefs', text)
      localStorage.setItem('foodwishus.lang', language)
      localStorage.setItem('foodwishus.theme', 'light')
    },
    [lang, JSON.stringify({ demoData: true, demoEmpty: !full, ...prefs })] as const,
  )
  await page.goto('/#/cockpit')
  await expect(page.getByRole('heading', { level: 1, name: 'Cockpit' })).toBeVisible()
  await page.waitForFunction(`Boolean(${kitOf})`)
}

interface Seeded {
  mia: string
  leo: string
  rosti: string
  curry: string
  cake: string
}

/**
 * A small kitchen with known numbers. Today is T.
 *
 *   Rösti   T      lunch    Mia cooks   craving 5   rated 5   super delicious   2 portions of 400 kcal
 *   Rösti   T-1    dinner   Mia cooks   craving 4   rated 4   yummy             1 portion
 *   Curry   T-2    dinner   Leo cooks   craving 5   rated 2   not my thing      1 portion of 800 kcal
 *   Cake    T-120  dessert  Mia cooks   craving 3   rated 5   super delicious   calories unknown
 *
 * Plus a curry that was skipped three days ago and a cake waiting on the wishlist.
 * Everything was proposed two days before it was eaten.
 */
async function seed(page: Page): Promise<Seeded> {
  const now = today()
  return page.evaluate(
    async (days) => {
      const { db, actions } = (window as unknown as { __foodwishus: Kit }).__foodwishus
      const leo: string = await db.getMeta('me.memberId')
      const householdId: string = await db.getMeta('me.householdId')
      const mia: string = (await db.members.toArray()).find((m: { id: string }) => m.id !== leo).id
      const criteria: { id: string }[] = (await db.criteria.toArray()).sort((a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder)

      const rosti = (await actions.createDish({ name: 'Rösti', course: 'main', tags: ['Swiss'], nutrition: { kcalPerServing: 400 }, recipe: { prepMinutes: 10, cookMinutes: 20, ingredients: [{ name: 'Potatoes' }, { name: 'butter' }] } })).id
      const curry = (await actions.createDish({ name: 'Green curry', course: 'main', tags: ['Thai'], nutrition: { kcalPerServing: 800 }, recipe: { prepMinutes: 15, cookMinutes: 30, ingredients: [{ name: 'Rice' }, { name: 'Butter' }] } })).id
      const cake = (await actions.createDish({ name: 'Carrot cake', course: 'dessert', tags: ['Swiss', 'Baking'], recipe: { prepMinutes: 20, cookMinutes: 40 } })).id

      const meals = [
        { dishId: rosti, ago: 0, hour: '11:00', slot: 'lunch', cook: mia, craving: 5, overall: 5, reaction: 6, portions: 2, taste: 5 },
        { dishId: rosti, ago: 1, hour: '18:00', slot: 'dinner', cook: mia, craving: 4, overall: 4, reaction: 5, portions: 1, taste: 4 },
        { dishId: curry, ago: 2, hour: '18:00', slot: 'dinner', cook: leo, craving: 5, overall: 2, reaction: 2, portions: 1, taste: 2 },
        { dishId: cake, ago: 120, hour: '14:00', slot: 'dessert', cook: mia, craving: 3, overall: 5, reaction: 6, portions: 1, taste: 5 },
      ]
      for (const meal of meals) {
        const day = days[meal.ago]
        const serving = await actions.proposeServing({ dishId: meal.dishId, cookedBy: meal.cook })
        // There is no "eaten" action before the review milestone, so these rows are written directly.
        await db.servings.update(serving.id, {
          status: 'eaten',
          craving: meal.craving,
          plannedDate: day,
          plannedSlot: meal.slot,
          proposedAt: `${days[meal.ago + 2]}T09:00:00.000Z`,
          eatenAt: `${day}T${meal.hour}:00.000Z`,
        })
        const at = `${day}T${meal.hour}:30.000Z`
        await db.reviews.put({
          id: crypto.randomUUID(),
          householdId,
          createdAt: at,
          updatedAt: at,
          deletedAt: null,
          servingId: serving.id,
          dishId: meal.dishId,
          // The Taster's verdict comes from whoever did not cook.
          reviewerId: meal.cook === mia ? leo : mia,
          reaction: meal.reaction,
          extraReactions: [],
          overall: meal.overall,
          scores: { [criteria[0].id]: meal.taste, [criteria[1].id]: meal.overall },
          portionsEaten: meal.portions,
          wouldEatAgain: meal.overall >= 4,
          comment: meal.ago === 0 ? 'Crisp like a postcard from Bern.' : null,
          chips: [],
          chefSelfRating: null,
          chefReaction: null,
          chefExtraReactions: [],
          chefReply: null,
          sealedAt: null,
        })
      }

      const skipped = await actions.proposeServing({ dishId: curry, cookedBy: mia })
      await db.servings.update(skipped.id, { status: 'skipped', plannedDate: days[3], plannedSlot: 'dinner', skippedReason: 'Ate out' })
      await actions.proposeServing({ dishId: cake, cookedBy: mia })
      return { mia, leo, rosti, curry, cake }
    },
    Object.fromEntries([0, 1, 2, 3, 4, 120, 122].map((ago) => [ago, addDays(now, -ago)])),
  )
}

const tile = (page: Page, id: string) => page.getByTestId(`tile-${id}`)
const chart = (page: Page, id: string) => page.locator(`[data-chart="${id}"]`)
const filterButton = (page: Page) => page.getByRole('button', { name: /^Filters/ })
const panel = (page: Page) => page.getByTestId('filter-panel')
const chips = (page: Page) => page.getByTestId('filter-chip')

/** Open the filter panel, tap one of its choices, and fold it away again. */
async function choose(page: Page, ...names: (string | RegExp)[]): Promise<void> {
  await filterButton(page).click()
  for (const name of names) await panel(page).getByRole('button', { name, exact: true }).click()
  await page.getByTestId('filter-done').click()
  await expect(panel(page)).toHaveCount(0)
}

/** Tap a spot inside a drawing, given as shares of its width and height. */
async function tapAt(target: Locator, fx: number, fy: number): Promise<void> {
  await target.scrollIntoViewIfNeeded()
  const box = await target.boundingBox()
  if (!box) throw new Error('Nothing to tap')
  await target.click({ position: { x: box.width * fx, y: box.height * fy } })
}

// ------------------------------------------------------------------- tiles --

test.describe('the tiles', () => {
  test('show the exact numbers of a small kitchen', async ({ page }) => {
    await openCockpit(page)
    await seed(page)

    await expect(tile(page, 'meals')).toHaveText('4meals eaten')
    await expect(tile(page, 'average')).toHaveText('4.0average ratingfrom 4 ratings')
    // Rösti is the only dish rated twice: (5 + 4) / 2.
    await expect(tile(page, 'best')).toContainText('Best rated')
    await expect(tile(page, 'best')).toContainText('Rösti')
    await expect(tile(page, 'best')).toContainText('4.5 from 2 ratings')
    await expect(tile(page, 'most')).toContainText('Eaten most often')
    await expect(tile(page, 'most')).toContainText('Rösti')
    await expect(tile(page, 'most')).toContainText('twice')
    // One skipped, four eaten.
    await expect(tile(page, 'skip')).toHaveText('20%skipped1 of 5 meals')
    await expect(tile(page, 'days-to-eat')).toHaveText('2.0daysfrom wish to plateaverage over 4 meals')
    // Super delicious twice, yummy once, not my thing once.
    await expect(tile(page, 'reaction')).toContainText('Most common reaction')
    await expect(tile(page, 'reaction')).toContainText('Super delicious')
    await expect(tile(page, 'reaction')).toContainText('twice')
    // Today, yesterday and the day before.
    await expect(tile(page, 'streak')).toHaveText('3daysin a rowLongest run: 3 days')
    await expect(tile(page, 'wishes')).toHaveText('1open wishOn the wishlist now')

    // This week runs from Monday: how much of the last three days it holds depends on today.
    const sinceMonday = Math.min(weekdayIndex(today()), 2)
    const kcal = ['800', '1,200', '2,000'][sinceMonday]
    const from = ['From 1 meal.', 'From 2 meals.', 'From 3 meals.'][sinceMonday]
    await expect(tile(page, 'calories-week')).toHaveText(`${kcal}kcaleaten this week${from}`)
  })

  test('update by themselves when a meal is eaten', async ({ page }) => {
    await openCockpit(page)
    const ids = await seed(page)
    await expect(tile(page, 'meals')).toHaveText('4meals eaten')
    await page.evaluate(
      async ([dishId, eatenAt]) => {
        const { db, actions } = (window as unknown as { __foodwishus: Kit }).__foodwishus
        const serving = await actions.proposeServing({ dishId })
        await db.servings.update(serving.id, { status: 'eaten', eatenAt })
      },
      [ids.curry, `${addDays(today(), -5)}T18:00:00.000Z`] as const,
    )
    await expect(tile(page, 'meals')).toHaveText('5meals eaten')
    await expect(tile(page, 'skip')).toContainText('1 of 6 meals')
  })
})

// ------------------------------------------------------------------ filter --

test.describe('the filter bar', () => {
  test('a date range changes the numbers and shows as a chip that can be taken off', async ({ page }) => {
    await openCockpit(page)
    await seed(page)
    await expect(page.getByTestId('filter-summary')).toHaveText('All meals so far')

    await filterButton(page).click()
    await expect(filterButton(page)).toHaveAttribute('aria-expanded', 'true')
    await panel(page).getByRole('button', { name: 'Last 3 months' }).click()
    // The cake was eaten four months ago: three meals are left, and the button says so.
    await expect(page.getByTestId('filter-done')).toHaveText('Show 3 meals')
    await page.getByTestId('filter-done').click()
    await expect(filterButton(page)).toHaveAttribute('aria-expanded', 'false')

    await expect(tile(page, 'meals')).toHaveText('3meals eaten')
    await expect(tile(page, 'average')).toHaveText('3.7average ratingfrom 3 ratings')
    await expect(tile(page, 'skip')).toHaveText('25%skipped1 of 4 meals')
    // The tiles about right now do not follow the filter.
    await expect(tile(page, 'streak')).toContainText('3daysin a row')
    await expect(tile(page, 'wishes')).toContainText('1open wish')

    await expect(chips(page)).toHaveText(['Last 3 months'])
    await expect(filterButton(page)).toHaveAccessibleName('Filters, 1 active')
    await page.getByRole('button', { name: 'Remove filter: Last 3 months' }).click()
    await expect(chips(page)).toHaveCount(0)
    await expect(tile(page, 'meals')).toHaveText('4meals eaten')
  })

  test('course, cook, rating and reaction narrow the meals, and Reset clears them all', async ({ page }) => {
    await openCockpit(page)
    await seed(page)

    await choose(page, 'Dessert')
    await expect(tile(page, 'meals')).toHaveText('1meal eaten')
    await expect(chips(page)).toHaveText(['Dessert'])
    await page.getByRole('button', { name: 'Reset', exact: true }).click()
    await expect(chips(page)).toHaveCount(0)
    await expect(tile(page, 'meals')).toHaveText('4meals eaten')

    // Leo cooked the curry, and Mia was not impressed.
    await choose(page, 'Leo')
    await expect(tile(page, 'meals')).toHaveText('1meal eaten')
    await expect(tile(page, 'average')).toHaveText('2.0average ratingfrom 1 rating')
    await expect(chips(page)).toHaveText(['Cooked by Leo'])
    await page.getByRole('button', { name: 'Reset', exact: true }).click()

    // Two taps make a range: 4 to 5 leaves the curry out.
    await choose(page, 'Rating 4', 'Rating 5')
    await expect(chips(page)).toHaveText(['Rating 4 to 5'])
    await expect(tile(page, 'meals')).toHaveText('3meals eaten')

    // Add a reaction on top: only the two "super delicious" meals remain.
    await choose(page, 'Super delicious')
    await expect(chips(page)).toHaveText(['Rating 4 to 5', '🤤 Super delicious'])
    await expect(tile(page, 'meals')).toHaveText('2meals eaten')
    await expect(filterButton(page)).toHaveAccessibleName('Filters, 2 active')

    await page.getByRole('button', { name: 'Reset', exact: true }).click()
    await expect(chips(page)).toHaveCount(0)
    await expect(tile(page, 'meals')).toHaveText('4meals eaten')
  })

  test('dishes are picked from a list, tags and calories from chips', async ({ page }) => {
    await openCockpit(page)
    await seed(page)

    await filterButton(page).click()
    await panel(page).getByRole('button', { name: 'Dish: Any dish' }).click()
    const sheet = page.getByRole('dialog', { name: 'Pick dishes' })
    await sheet.getByRole('checkbox', { name: /Rösti/ }).click()
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(panel(page).getByRole('button', { name: 'Dish: Rösti' })).toBeVisible()
    await page.getByTestId('filter-done').click()
    await expect(chips(page)).toHaveText(['Rösti'])
    await expect(tile(page, 'meals')).toHaveText('2meals eaten')
    await page.getByRole('button', { name: 'Remove filter: Rösti' }).click()

    // Swiss: the Rösti twice and the carrot cake.
    await choose(page, 'Swiss')
    await expect(tile(page, 'meals')).toHaveText('3meals eaten')
    await page.getByRole('button', { name: 'Reset', exact: true }).click()

    // 700 kcal and more per serving: only the curry. The cake has no calories, so it never matches.
    await choose(page, '700 and more')
    await expect(chips(page)).toHaveText(['700 and more kcal'])
    await expect(tile(page, 'meals')).toHaveText('1meal eaten')
    await expect(tile(page, 'most')).toContainText('Green curry')
  })

  test('a custom range takes two dates', async ({ page }) => {
    await openCockpit(page)
    await seed(page)
    const now = today()

    await filterButton(page).click()
    await panel(page).getByRole('button', { name: 'Custom' }).click()
    await panel(page).getByLabel('From').fill(addDays(now, -1))
    await panel(page).getByLabel('To', { exact: true }).fill(now)
    await page.getByTestId('filter-done').click()
    // Yesterday and today: the two Rösti.
    await expect(tile(page, 'meals')).toHaveText('2meals eaten')
    await expect(chips(page)).toHaveCount(1)
    await expect(chips(page).first()).toContainText(' to ')
  })

  test('nothing matches: Fork says so and offers a way back', async ({ page }) => {
    await openCockpit(page)
    await seed(page)
    await choose(page, 'Meh')
    await expect(tile(page, 'meals')).toHaveText('0meals eaten')
    await expect(page.getByTestId('no-match')).toContainText('Nothing matches these filters')
    await expect(page.locator('[data-chart]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Reset filters' }).click()
    await expect(page.getByTestId('no-match')).toHaveCount(0)
    await expect(tile(page, 'meals')).toHaveText('4meals eaten')
  })

  test('the filter is still there after a trip to another tab', async ({ page }) => {
    await openCockpit(page)
    await seed(page)
    await choose(page, 'Dessert')
    await expect(tile(page, 'meals')).toHaveText('1meal eaten')

    await page.getByRole('navigation', { name: /^(Main|Hauptnavigation)$/ }).getByRole('button', { name: 'Wishlist' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Wishlist' })).toBeVisible()
    await page.getByRole('navigation', { name: /^(Main|Hauptnavigation)$/ }).getByRole('button', { name: 'Cockpit' }).click()

    await expect(chips(page)).toHaveText(['Dessert'])
    await expect(tile(page, 'meals')).toHaveText('1meal eaten')
  })
})

// ------------------------------------------------------------------ charts --

test.describe('the charts', () => {
  test('say their numbers on a tap and with the keyboard', async ({ page }) => {
    await openCockpit(page)
    await seed(page)

    // How often each reaction was given: the bars carry their counts, a tap names the face.
    const reactions = chart(page, 'reactions')
    await reactions.scrollIntoViewIfNeeded()
    await expect(reactions).toHaveAttribute('data-grow', 'in')
    await expect(reactions.getByRole('heading')).toHaveText('How often each reaction was given')
    await expect(reactions.getByTestId('readout')).toHaveText('Tap the chart to read its numbers.')
    // Six bars side by side: the last one is "super delicious".
    await tapAt(reactions.locator('[role="group"] svg'), 0.93, 0.5)
    await expect(reactions.getByTestId('readout')).toHaveText('🤤 Super delicious: 2')
    // The arrow keys walk through the bars.
    await reactions.getByRole('group').focus()
    await page.keyboard.press('ArrowLeft')
    await expect(reactions.getByTestId('readout')).toHaveText('😋 Yummy: 1')
    await page.keyboard.press('Home')
    await expect(reactions.getByTestId('readout')).toHaveText('😵 Kitchen disaster: 0')

    // Screen readers get the whole chart in one sentence.
    await expect(reactions.getByRole('group')).toHaveAccessibleName(/Kitchen disaster: 0, Not my thing: 1, Meh: 0, Pretty good: 0, Yummy: 1, Super delicious: 2/)

    // Craving accuracy: the misses are 0, 0, 3 and 2, so 1 − (5 / 4) / 4 = 69%.
    await expect(chart(page, 'craving').getByTestId('craving-accuracy')).toHaveText('69%craving accuracyfrom 4 meals')

    // The mix of courses: three mains and one dessert.
    const mix = chart(page, 'mix')
    await expect(mix.getByTestId('slice-row')).toHaveText(['Main3, 75%', 'Dessert1, 25%'])
    await mix.getByRole('radio', { name: 'Tags' }).click()
    await expect(mix.getByTestId('bar-row')).toHaveText(['Swiss3 plates', 'Baking1 plate', 'Thai1 plate'])

    // Recipes: (30 + 30 + 45 + 60) / 4 minutes, and butter in three plates whatever its capital.
    await expect(chart(page, 'recipes').getByTestId('recipe-time')).toHaveText('41 minaverage recipe timeover 4 plates')
    await expect(chart(page, 'recipes').getByTestId('bar-row').first()).toHaveText('Butterin 3 plates')

    // Dishes eaten most often, as bars.
    await expect(chart(page, 'top-dishes').getByTestId('bar-row')).toHaveText(['Röstitwice', 'Green curryonce', 'Carrot cakeonce'])
  })

  test('a criterion can be added to the ratings, and two dishes compared', async ({ page }) => {
    await openCockpit(page)
    await seed(page)

    const ratings = chart(page, 'ratings')
    await expect(ratings.getByTestId('criterion-strip')).toHaveCount(0)
    await ratings.getByRole('button', { name: 'Taste' }).click()
    await expect(ratings.getByTestId('criterion-strip')).toHaveCount(1)
    await expect(ratings.getByTestId('criterion-strip')).toContainText('Taste4.0 from 4 ratings')
    await ratings.getByRole('button', { name: 'Taste' }).click()
    await expect(ratings.getByTestId('criterion-strip')).toHaveCount(0)

    const criteria = chart(page, 'criteria')
    await expect(criteria.getByTestId('radar-legend')).toHaveText('All dishes')
    await criteria.getByRole('button', { name: 'Compare two dishes' }).click()
    // The dish eaten most often comes first, the one eaten last after it.
    await expect(criteria.getByTestId('radar-legend').getByRole('listitem')).toHaveText(['All dishes', 'Rösti', 'Green curry'])
    await expect(criteria.getByRole('row', { name: /^Taste/ })).toHaveText('Taste4.0 44.5 22.0 1')

    await criteria.getByRole('button', { name: 'Compare with: Green curry' }).click()
    await page.getByRole('dialog', { name: 'Pick a dish' }).getByRole('radio', { name: /Carrot cake/ }).click()
    await expect(criteria.getByTestId('radar-legend').getByRole('listitem')).toHaveText(['All dishes', 'Rösti', 'Carrot cake'])
  })
})

for (const motion of ['no-preference', 'reduce'] as const) {
  test(`a long stretch scrolls sideways and starts at the newest end (motion: ${motion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: motion })
    await openCockpit(page)
    const ids = await seed(page)
    // One more curry, a hundred days ago, so that the days with known calories span months.
    await page.evaluate(
      async ([dishId, eatenAt]) => {
        const { db, actions } = (window as unknown as { __foodwishus: Kit }).__foodwishus
        const serving = await actions.proposeServing({ dishId })
        await db.servings.update(serving.id, { status: 'eaten', eatenAt })
      },
      [ids.curry, `${addDays(today(), -100)}T18:00:00.000Z`] as const,
    )
    await expect(tile(page, 'meals')).toHaveText('5meals eaten')
    const atEnd = (scroller: Locator) => scroller.evaluate((el) => ({ scrolled: el.scrollLeft > 0, gap: el.scrollWidth - el.clientWidth - el.scrollLeft }))

    // Four months of days do not fit across a phone: the calendar scrolls, newest week in view.
    const calendar = chart(page, 'calendar')
    await calendar.scrollIntoViewIfNeeded()
    await expect(calendar).toHaveAttribute('data-grow', 'in')
    const weeks = calendar.locator('[data-scrolls]')
    await expect(weeks).toHaveCount(1)
    await expect.poll(() => atEnd(weeks)).toEqual({ scrolled: true, gap: 0 })
    // Today is in the last column: a tap near the right edge lands in this week.
    await tapAt(calendar.locator('[data-scrolls] svg'), 0.99, 0.2)
    await expect(calendar.getByTestId('readout')).toContainText(/: (no meal|1 meal)$/)

    // The same for the bars per day; per week they fit and nothing scrolls.
    const calories = chart(page, 'calories')
    await expect(calories.locator('[data-scrolls]')).toHaveCount(0)
    await calories.getByRole('radio', { name: 'Per day' }).click()
    await expect(calories.getByRole('heading', { level: 3 })).toHaveText('Calories eaten per day')
    await expect.poll(() => atEnd(calories.locator('[data-scrolls]'))).toEqual({ scrolled: true, gap: 0 })
  })
}

// --------------------------------------------------------------- calories --

test.describe('calories', () => {
  test('are told plainly, and unknown ones are left out, never counted as zero', async ({ page }) => {
    await openCockpit(page)
    await seed(page)

    await expect(page.getByRole('heading', { level: 2, name: 'Calories' })).toBeVisible()
    // 800 + 400 + 800 from three meals; the cake has no calories.
    await expect(chart(page, 'calories')).toContainText('From 3 meals. 1 meal without calories is left out.')
    await expect(chart(page, 'calories-slot').getByTestId('bar-row')).toHaveText(['Lunch800 kcal, 1 meal', 'Dinner600 kcal, 2 meals'])
    await expect(chart(page, 'taste')).toContainText('2 dishes, one dot each. 1 dish without calories is left out.')

    await filterButton(page).click()
    await expect(panel(page).getByRole('group', { name: 'Calories per serving' })).toBeVisible()
  })

  test('disappear everywhere when the setting is off', async ({ page }) => {
    await openCockpit(page, { prefs: { showCalories: false } })
    const ids = await seed(page)
    await expect(tile(page, 'meals')).toHaveText('4meals eaten')

    await expect(tile(page, 'calories-week')).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 2, name: 'Calories' })).toHaveCount(0)
    for (const id of ['calories', 'calories-slot', 'taste']) await expect(chart(page, id)).toHaveCount(0)
    await expect(page.getByTestId('cockpit')).not.toContainText(/kcal|calorie/i)

    await filterButton(page).click()
    await expect(panel(page).getByRole('group', { name: 'Rating' })).toBeVisible()
    await expect(panel(page).getByRole('group', { name: 'Calories per serving' })).toHaveCount(0)
    await expect(panel(page)).not.toContainText(/kcal|calorie/i)

    await page.goto(`/#/cockpit/dish/${ids.rosti}`)
    await expect(page.getByTestId('dish-name')).toHaveText('Rösti')
    await expect(page.getByTestId('dish-calories')).toHaveCount(0)
    await expect(page.getByTestId('dish-numbers')).not.toContainText(/kcal|calorie/i)
  })
})

// -------------------------------------------------------------- drill-down --

test.describe('the dish in numbers', () => {
  test('opens from a tile, shows the whole history and leads back to the same place', async ({ page }) => {
    await openCockpit(page)
    const ids = await seed(page)
    await choose(page, 'Last 3 months')

    await tile(page, 'best').getByRole('button').click()
    await expect(page).toHaveURL(new RegExp(`#/cockpit/dish/${ids.rosti}$`))
    await expect(page.getByRole('heading', { level: 1, name: 'Dish in numbers' })).toBeVisible()
    await expect(page.getByTestId('dish-name')).toHaveText('Rösti')
    // The page is about the dish's whole life, and says so while a filter is on.
    await expect(page.getByText('All time. The Cockpit filter does not apply here.')).toBeVisible()

    const stats = page.getByTestId('dish-stats')
    await expect(stats).toContainText('2times eaten')
    await expect(stats).toContainText('4.5average rating2 ratings')
    await expect(stats).toContainText('2 of 2would eat it again')

    // Both reviews, newest first, with what was said.
    const reviews = page.getByTestId('reviews').getByRole('listitem')
    await expect(reviews).toHaveCount(2)
    await expect(reviews.first()).toContainText('5 of 5')
    await expect(reviews.first()).toContainText("Chef's kiss")
    await expect(reviews.first()).toContainText('Crisp like a postcard from Bern.')
    await expect(reviews.first()).toContainText('2 portions. Would eat it again.')
    await expect(reviews.first()).toContainText('Cooked by Mia')
    await expect(reviews.nth(1)).toContainText('4 of 5')

    await expect(chart(page, 'dish-criteria').getByTestId('bar-row').first()).toHaveText('Taste4.5 from 2 ratings')
    await expect(chart(page, 'dish-reactions')).toContainText('5.5 of 6 on average, from 2 reactions')
    // 400 kcal a serving; two portions and one portion eaten: 600 on average.
    await expect(page.getByTestId('dish-calories')).toContainText('400kcalper serving')
    await expect(page.getByTestId('dish-calories')).toContainText('600 kcal eaten per meal on average over 2 meals')
    await expect(page.getByText('Recipe time: 30 min')).toBeVisible()

    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page).toHaveURL(/#\/cockpit$/)
    await expect(chips(page)).toHaveText(['Last 3 months'])
    await expect(tile(page, 'meals')).toHaveText('3meals eaten')
  })

  test('opens from a bar, from a point and from the Hall of Fame, and links to the recipe', async ({ page }) => {
    await openCockpit(page)
    const ids = await seed(page)

    // A bar.
    await chart(page, 'top-dishes').getByRole('button', { name: /Green curry/ }).click()
    await expect(page).toHaveURL(new RegExp(`#/cockpit/dish/${ids.curry}$`))
    await expect(page.getByTestId('dish-name')).toHaveText('Green curry')
    await expect(page.getByTestId('reviews').getByRole('listitem')).toContainText(['Cooked by Leo'])
    // The new page starts at its top; going back lands on the chart that was left.
    await expect(page.getByRole('heading', { level: 1, name: 'Dish in numbers' })).toBeInViewport()
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(chart(page, 'top-dishes').getByRole('button', { name: /Green curry/ })).toBeInViewport()

    // A point: the dot nearest to the tap is picked, and its line leads to the dish.
    const craving = chart(page, 'craving')
    await tapAt(craving.locator('[role="group"] svg'), 0.5, 0.2)
    await expect(craving.getByTestId('readout')).toContainText('Carrot cake')
    await expect(craving.getByTestId('readout')).toContainText('Craving 3, rated 5')
    await craving.getByRole('button', { name: 'See dish' }).click()
    await expect(page).toHaveURL(new RegExp(`#/cockpit/dish/${ids.cake}$`))
    // No calories were written down for the cake: unknown, not zero.
    await expect(page.getByTestId('dish-calories')).toContainText('Unknown')
    await page.getByRole('button', { name: 'Back' }).click()

    // The Hall of Fame: the dish rated twice comes first.
    const fame = page.getByTestId('fame-dish')
    await expect(fame).toHaveCount(3)
    await expect(fame.first()).toContainText('No. 1')
    await expect(fame.first()).toContainText('Rösti')
    await fame.first().click()
    await expect(page).toHaveURL(new RegExp(`#/cockpit/dish/${ids.rosti}$`))

    await page.getByRole('button', { name: 'Open the recipe' }).click()
    await expect(page).toHaveURL(new RegExp(`#/recipes/${ids.rosti}$`))
  })

  test('a dish that does not exist gets a kind page and a way back', async ({ page }) => {
    await openCockpit(page)
    await page.goto('/#/cockpit/dish/nothing-here')
    await expect(page.getByRole('heading', { name: 'No numbers for this dish' })).toBeVisible()
    await page.getByRole('button', { name: 'Back to the Cockpit' }).click()
    await expect(page).toHaveURL(/#\/cockpit$/)
  })
})

// ------------------------------------------------------- menus, lost dishes --

test.describe('special meals', () => {
  test('a menu counts as one meal with a plate for each course', async ({ page }) => {
    await openCockpit(page)
    const now = today()
    const ids = await page.evaluate(
      async ([day, proposed]) => {
        const { db, actions } = (window as unknown as { __foodwishus: Kit }).__foodwishus
        const leo: string = await db.getMeta('me.memberId')
        const householdId: string = await db.getMeta('me.householdId')
        const mia: string = (await db.members.toArray()).find((m: { id: string }) => m.id !== leo).id
        const soup = (await actions.createDish({ name: 'Pumpkin soup', course: 'starter', nutrition: { kcalPerServing: 250 } })).id
        const roast = (await actions.createDish({ name: 'Roast chicken', course: 'main', nutrition: { kcalPerServing: 700 } })).id
        const menu = (await actions.createMenu({ name: 'Sunday roast', courses: [{ dishId: soup, order: 0 }, { dishId: roast, order: 1 }] })).id
        const serving = await actions.proposeServing({ menuId: menu, cookedBy: mia })
        await db.servings.update(serving.id, { status: 'eaten', craving: 4, plannedDate: day, plannedSlot: 'lunch', proposedAt: `${proposed}T09:00:00.000Z`, eatenAt: `${day}T11:00:00.000Z` })
        for (const [dishId, overall] of [[soup, 3], [roast, 5]] as const) {
          await db.reviews.put({
            id: crypto.randomUUID(), householdId, createdAt: `${day}T11:30:00.000Z`, updatedAt: `${day}T11:30:00.000Z`, deletedAt: null,
            servingId: serving.id, dishId, reviewerId: leo, reaction: overall === 5 ? 6 : 4, extraReactions: [], overall, scores: {}, portionsEaten: 1,
            wouldEatAgain: true, comment: null, chips: [], chefSelfRating: null, chefReaction: null, chefExtraReactions: [], chefReply: null, sealedAt: null,
          })
        }
        return { soup, roast, menu }
      },
      [now, addDays(now, -1)] as const,
    )

    // One meal, two ratings (3 and 5), and both courses in the mix.
    await expect(tile(page, 'meals')).toHaveText('1meal eaten')
    await expect(tile(page, 'average')).toHaveText('4.0average ratingfrom 2 ratings')
    await expect(chart(page, 'mix').getByTestId('slice-row')).toHaveText(['Main1, 50%', 'Starter1, 50%'])
    // The whole menu is one calorie figure: 250 + 700.
    await expect(tile(page, 'calories-week')).toContainText('950kcal')

    // Craving 4 against the meal's mean of 4: spot on. A menu is not one dish, so the point names the menu.
    const craving = chart(page, 'craving')
    await expect(craving.getByTestId('craving-accuracy')).toContainText('100%')
    await craving.getByRole('group').focus()
    await page.keyboard.press('ArrowRight')
    await expect(craving.getByTestId('readout')).toContainText('Sunday roast')
    await expect(craving.getByTestId('readout')).toContainText('Craving 4, rated 4')
    await expect(craving.getByRole('button', { name: 'See dish' })).toHaveCount(0)

    // Menus that were eaten can be filtered by.
    await filterButton(page).click()
    await panel(page).getByRole('button', { name: 'Menu: Any menu' }).click()
    await page.getByRole('dialog', { name: 'Pick a menu' }).getByRole('radio', { name: 'Sunday roast' }).click()
    await page.getByTestId('filter-done').click()
    await expect(chips(page)).toHaveText(['Sunday roast'])
    await expect(tile(page, 'meals')).toHaveText('1meal eaten')

    // On the dish's own page the meal says where it came from.
    await page.goto(`/#/cockpit/dish/${ids.roast}`)
    await expect(page.getByTestId('reviews').getByRole('listitem')).toContainText(['Cooked by Mia, Part of Sunday roast'])
    await expect(page.getByTestId('dish-stats')).toContainText('1time eaten')
  })

  test('a dish that left the recipe book keeps its numbers', async ({ page }) => {
    await openCockpit(page)
    const ids = await seed(page)
    await page.evaluate((id) => (window as unknown as { __foodwishus: Kit }).__foodwishus.actions.deleteDish(id), ids.curry)

    await expect(tile(page, 'meals')).toHaveText('4meals eaten')
    const gone = chart(page, 'top-dishes').getByRole('button', { name: /A dish that left the recipe book/ })
    await expect(gone).toContainText('once')
    await gone.click()
    await expect(page.getByTestId('dish-name')).toHaveText('A dish that left the recipe book')
    await expect(page.getByTestId('dish-stats')).toContainText('2.0average rating1 rating')
    await expect(page.getByRole('button', { name: 'Open the recipe' })).toHaveCount(0)
  })
})

// ------------------------------------------------------------ empty, German --

test('an empty kitchen gets an invitation instead of empty charts', async ({ page }) => {
  await openCockpit(page)
  await expect(page.getByTestId('cockpit-empty')).toContainText('Nothing eaten yet')
  await expect(page.getByTestId('cockpit-empty')).toContainText('First we eat, then we count.')
  await expect(page.getByTestId('filter-bar')).toHaveCount(0)
  await expect(page.locator('[data-chart]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Open the wishlist' }).click()
  await expect(page).toHaveURL(/#\/wishlist$/)
})

test('fun facts appear once there is something to tell', async ({ page }) => {
  await openCockpit(page)
  await seed(page)
  const facts = page.getByTestId('fun-facts')
  await expect(facts.locator('[data-fact="streak"]')).toHaveText('3 days in a row with a proper meal. The stove is on a roll.')
  await expect(facts.locator('[data-fact="perfectScores"]')).toHaveText('2 plates got 5 out of 5. The kitchen is showing off.')
  await expect(facts.locator('[data-fact="seconds"]')).toHaveText('Seconds, once. No regrets.')
  // Rösti was eaten twice: not yet enough for a love story.
  await expect(facts.locator('[data-fact="mostEaten"]')).toHaveCount(0)
})

test('speaks German too', async ({ page }) => {
  await openCockpit(page, { lang: 'de' })
  await seed(page)

  await expect(tile(page, 'meals')).toHaveText('4Mahlzeiten gegessen')
  await expect(tile(page, 'average')).toHaveText('4.0Bewertung im Schnittaus 4 Bewertungen')
  await expect(tile(page, 'best')).toContainText('Am besten bewertet')
  await expect(tile(page, 'most')).toContainText('2-mal')
  await expect(tile(page, 'skip')).toHaveText('20%übersprungen1 von 5 Mahlzeiten')
  await expect(tile(page, 'streak')).toHaveText('3Tageam StückLängste Serie: 3 Tage')
  await expect(tile(page, 'reaction')).toContainText('Mega fein')
  await expect(page.getByRole('heading', { level: 2, name: 'Ruhmeshalle' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Wie es geschmeckt hat' })).toBeVisible()
  await expect(chart(page, 'craving').getByRole('heading')).toHaveText('Lust vorher, Bewertung nachher')
  await expect(page.getByTestId('fun-facts').locator('[data-fact="streak"]')).toHaveText('3 Tage am Stück richtig gegessen. Der Herd läuft heiss.')

  await page.getByRole('button', { name: /^Filter/ }).click()
  await panel(page).getByRole('button', { name: 'Letzte 3 Monate' }).click()
  await expect(page.getByTestId('filter-done')).toHaveText('3 Mahlzeiten zeigen')
  await page.getByTestId('filter-done').click()
  await expect(page.getByRole('button', { name: 'Filter entfernen: Letzte 3 Monate' })).toBeVisible()
  await expect(tile(page, 'meals')).toHaveText('3Mahlzeiten gegessen')

  await tile(page, 'best').getByRole('button').click()
  await expect(page.getByRole('heading', { level: 1, name: 'Gericht in Zahlen' })).toBeVisible()
  await expect(page.getByTestId('dish-stats')).toContainText('2mal gegessen')
  await expect(page.getByTestId('reviews').getByRole('listitem').first()).toContainText('2 Portionen. Würde es wieder essen.')
})

// -------------------------------------------------------- the full kitchen --

test.describe('the full demo kitchen on a narrow phone', () => {
  test.use({ viewport: { width: 360, height: 780 } })

  test('every chart draws something and nothing sticks out sideways', async ({ page }) => {
    await openCockpit(page, { full: true })
    await expect(tile(page, 'meals')).toContainText('meals eaten')

    const ids = ['ratings', 'criteria', 'craving', 'reactions', 'reaction-trend', 'top-dishes', 'mix', 'recipes', 'effort', 'calendar', 'slots', 'hours', 'planned-hours', 'calories', 'calories-slot', 'taste']
    await expect(page.locator('[data-chart]')).toHaveCount(ids.length)

    for (const id of ids) {
      const card = chart(page, id)
      await card.scrollIntoViewIfNeeded()
      // Charts grow in the first time they are seen.
      await expect(card, id).toHaveAttribute('data-grow', 'in')
      await expect(card, id).not.toHaveAttribute('data-empty', 'true')
      await expect(card.getByRole('heading', { level: 3 }), id).not.toBeEmpty()
      // Something is drawn: marks in a drawing, or rows of bars.
      const marks = await card.locator('svg circle, svg path, svg rect, svg text, [data-testid="bar-row"]').count()
      expect(marks, `${id} draws something`).toBeGreaterThan(3)
      // The card stays inside the screen.
      const box = await card.boundingBox()
      expect(box, id).not.toBeNull()
      expect(box!.x, `${id} starts on screen`).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width, `${id} ends on screen`).toBeLessThanOrEqual(360)
    }

    // Nothing inside a card pokes out of it. Rows and plots that are meant to scroll sideways
    // clip their own content, so what is inside them does not count.
    const escapes = await page.evaluate(() => {
      const out: string[] = []
      const clipped = (node: Element, card: Element): boolean => {
        for (let parent = node.parentElement; parent && parent !== card; parent = parent.parentElement) {
          if (getComputedStyle(parent).overflowX !== 'visible') return true
        }
        return false
      }
      for (const card of document.querySelectorAll<HTMLElement>('[data-chart]')) {
        const edge = card.getBoundingClientRect()
        for (const node of card.querySelectorAll<HTMLElement | SVGElement>('*')) {
          if (clipped(node, card)) continue
          const box = node.getBoundingClientRect()
          if (box.width === 0 || box.height === 0) continue
          if (box.right > edge.right + 1 || box.left < edge.left - 1) out.push(`${card.dataset.chart}: <${node.tagName.toLowerCase()}> ${(node.textContent ?? '').trim().slice(0, 30)}`)
        }
      }
      return out
    })
    expect(escapes).toEqual([])

    // And the page itself never scrolls sideways.
    const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, screen: window.innerWidth }))
    expect(widths.page).toBeLessThanOrEqual(widths.screen)

    // The stories of the demo kitchen are told: a clear favourite at the top.
    await expect(tile(page, 'best')).toContainText('Älplermagronen')
    await expect(page.getByTestId('fame-dish').first()).toContainText('Älplermagronen')
    await expect(page.getByTestId('fun-facts')).toContainText("That's love.")
  })
})
