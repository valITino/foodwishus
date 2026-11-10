import { expect, test, type Page } from '@playwright/test'
import sharp from 'sharp'

// The Recipe Book, end to end, in the demo kitchen: a paired phone with no cloud.

interface DishSeed {
  name: string
  course?: string
  tags?: string[]
  recipe?: object
  nutrition?: object
}

async function openBook(page: Page, prefs: object = {}): Promise<void> {
  await page.addInitScript((extra) => {
    localStorage.setItem('foodwishus.prefs', JSON.stringify({ demoData: true, demoEmpty: true, ...extra }))
    localStorage.setItem('foodwishus.lang', 'en')
    localStorage.setItem('foodwishus.theme', 'light')
  }, prefs)
  await page.goto('/#/recipes')
  await expect(page.getByRole('heading', { name: 'Recipe book' })).toBeVisible()
  await page.waitForFunction(() => Boolean((window as unknown as { __foodwishus?: object }).__foodwishus))
}

/** Put dishes straight into the kitchen. Returns their ids by name. */
async function addDishes(page: Page, dishes: DishSeed[]): Promise<Record<string, string>> {
  return page.evaluate(async (list) => {
    const { actions } = (window as unknown as { __foodwishus: { actions: any } }).__foodwishus
    const ids: Record<string, string> = {}
    for (const dish of list) ids[dish.name] = (await actions.createDish(dish)).id
    return ids
  }, dishes)
}

async function addMenu(page: Page, name: string, dishIds: string[]): Promise<string> {
  return page.evaluate(
    async ([menuName, ids]) => {
      const { actions } = (window as unknown as { __foodwishus: { actions: any } }).__foodwishus
      return (await actions.createMenu({ name: menuName, courses: (ids as string[]).map((dishId, order) => ({ dishId, order })) })).id as string
    },
    [name, dishIds] as const,
  )
}

const storedDish = (page: Page, name: string) =>
  page.evaluate(async (n) => {
    const { db } = (window as unknown as { __foodwishus: { db: any } }).__foodwishus
    return (await db.dishes.toArray()).find((d: { name: string; deletedAt: string | null }) => d.name === n && !d.deletedAt) ?? null
  }, name)

const cards = (page: Page) => page.getByTestId('dish-card')
// Two toasts with the same words can overlap for a moment: the newest one is the one meant.
const toast = (page: Page, text: string) => page.getByRole('status').getByText(text, { exact: true }).last()
const ingredientLines = (page: Page) => page.getByTestId('ingredients').getByRole('listitem')

const ROSTI: DishSeed = {
  name: 'Rösti with fried egg',
  course: 'main',
  tags: ['Swiss', 'Quick'],
  recipe: {
    servings: 2,
    prepMinutes: 10,
    cookMinutes: 25,
    ingredients: [{ quantity: 250, unit: 'g', name: 'potatoes' }, { quantity: 1, unit: 'tbsp', name: 'butter' }, { quantity: 3, name: 'eggs' }, { name: 'salt' }],
    steps: [{ text: 'Grate the potatoes and fry them in the butter.', timerSeconds: 60 }, { text: 'Flip and fry the other side.' }, { text: 'Fry the eggs and set them on top.' }],
  },
  nutrition: { kcalPerServing: 480 },
}
const LASAGNE: DishSeed = {
  name: 'Lasagne al forno',
  course: 'main',
  tags: ['Italian'],
  recipe: { servings: 4, prepMinutes: 30, cookMinutes: 45, ingredients: [{ quantity: 80, unit: 'g', name: 'Parmesan' }], steps: [{ text: 'Layer and bake.' }] },
  nutrition: { kcalPerServing: 640 },
}
const SOUP: DishSeed = { name: 'Tomato soup', course: 'starter', tags: ['Quick'], recipe: { servings: 2, prepMinutes: 5, cookMinutes: 20 }, nutrition: { kcalPerServing: 180 } }
const STRUDEL: DishSeed = { name: 'Apple strudel', course: 'dessert', tags: ['Sweet'], recipe: { servings: 6, prepMinutes: 35, cookMinutes: 40 }, nutrition: {} }

test('create a dish with a picture, ingredients, steps, a timer and calories', async ({ page }) => {
  await openBook(page)
  await expect(page.getByRole('heading', { name: 'The book is still blank' })).toBeVisible()
  await page.getByRole('button', { name: 'Add the first dish' }).click()
  await expect(page.getByRole('heading', { name: 'New dish' })).toBeVisible()

  await test.step('saving without a name says what is missing', async () => {
    await page.getByRole('button', { name: 'Save dish' }).click()
    await expect(page.getByRole('alert')).toHaveText('Give the dish a name, then save again.')
  })

  await test.step('basics and tags', async () => {
    await page.getByLabel('Name', { exact: true }).fill('Älplermagronen')
    await expect(page.getByRole('alert')).toHaveCount(0)
    await page.getByLabel('Short description').fill('Creamy, cheesy, gone in minutes')
    await page.getByRole('group', { name: 'Effort' }).getByRole('button', { name: 'Easy' }).click()
    const tags = page.getByLabel('Tags', { exact: true })
    await tags.fill('Swiss')
    await tags.press('Enter')
    await tags.fill('Comfort')
    await tags.press('Enter')
    await tags.fill('Oops')
    await tags.press('Enter')
    await page.getByRole('button', { name: 'Remove tag Oops' }).click()
    await expect(page.getByTestId('tags').getByRole('listitem')).toHaveText(['Swiss', 'Comfort'])
  })

  await test.step('picture: an icon first, then a photo from the gallery', async () => {
    await page.getByRole('radio', { name: 'Whisk' }).click()
    await expect(page.getByRole('radio', { name: 'Whisk' })).toBeChecked()
    const photo = await sharp({ create: { width: 1800, height: 1350, channels: 3, background: '#e8b04a' } })
      .jpeg()
      .toBuffer()
    await page.getByTestId('photo-gallery').setInputFiles({ name: 'magronen.jpg', mimeType: 'image/jpeg', buffer: photo })
    await expect(page.getByTestId('cover-preview')).toBeVisible()
  })

  await test.step('servings and time', async () => {
    await page.getByRole('button', { name: 'Servings: +1' }).click()
    await page.getByRole('button', { name: 'Servings: +1' }).click()
    await page.getByLabel('Prep, minutes').fill('10')
    await page.getByLabel('Cooking, minutes').fill('25')
    await expect(page.getByTestId('total-time')).toHaveText('35 min in total')
  })

  await test.step('ingredients are typed as one line each', async () => {
    const quick = page.getByLabel('Add an ingredient')
    await quick.fill('250 g macaroni')
    await quick.press('Enter')
    await quick.fill('2 onions')
    await quick.press('Enter')
    await quick.fill('1.5 dl cream')
    await page.getByRole('button', { name: 'Add ingredient' }).click()
    await quick.fill('1 tbsp oops')
    await quick.press('Enter')
    await expect(page.getByTestId('ingredient-row')).toHaveText(['250 gmacaroni', '2onions', '1.5 dlcream', '1 tbspoops'])

    await page.getByRole('button', { name: 'Remove ingredient: oops' }).click()
    await expect(page.getByTestId('ingredient-row')).toHaveCount(3)

    await page.getByRole('button', { name: 'Edit onions' }).click()
    const sheet = page.getByRole('dialog', { name: 'Ingredient' })
    await sheet.getByLabel('Amount', { exact: true }).fill('3')
    await sheet.getByLabel('Ingredient', { exact: true }).fill('red onions')
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByTestId('ingredient-row').nth(1)).toHaveText('3red onions')
  })

  await test.step('steps, with a timer offered from the text', async () => {
    await page.getByLabel('Step 1', { exact: true }).fill('Boil the macaroni for 8 minutes.')
    await page.getByRole('button', { name: 'Set a timer: 8 min' }).click()
    await expect(page.getByLabel('Timer for step 1, minutes')).toHaveValue('8')
    await page.getByRole('button', { name: 'Add a step' }).click()
    await page.getByLabel('Step 2', { exact: true }).fill('Fry the onions until golden.')
    await page.getByRole('button', { name: 'Add a step' }).click()
    await page.getByLabel('Step 3', { exact: true }).fill('Stir in the cream and serve.')
    await page.getByRole('button', { name: 'Move step 3 up' }).click()
    await expect(page.getByLabel('Step 2', { exact: true })).toHaveValue('Stir in the cream and serve.')
    await page.getByRole('button', { name: 'Move step 2 down' }).click()
    await expect(page.getByLabel('Step 3', { exact: true })).toHaveValue('Stir in the cream and serve.')
  })

  await test.step('a photo for a step', async () => {
    const photo = await sharp({ create: { width: 900, height: 700, channels: 3, background: '#d9a066' } })
      .jpeg()
      .toBuffer()
    await page.getByTestId('step-photo-2').setInputFiles({ name: 'onions.jpg', mimeType: 'image/jpeg', buffer: photo })
    await expect(page.getByRole('img', { name: 'Photo of step 2' })).toBeVisible()
  })

  await test.step('calories', async () => {
    await page.getByLabel('Calories per serving, kcal').fill('720')
    await page.getByLabel('Protein, g').fill('28')
    await page.getByRole('switch', { name: 'This is an estimate' }).click()
  })

  await page.getByRole('button', { name: 'Save dish' }).click()
  await expect(toast(page, 'Saved')).toBeVisible()

  await test.step('the dish page shows it all', async () => {
    await expect(page.getByTestId('dish-name')).toHaveText('Älplermagronen')
    await expect(page.getByText('Creamy, cheesy, gone in minutes')).toBeVisible()
    await expect(page.getByRole('img', { name: 'Älplermagronen', exact: true })).toBeVisible()
    const facts = page.getByTestId('facts')
    await expect(facts).toContainText('720')
    await expect(facts).toContainText('Estimate')
    await expect(facts).toContainText('Protein 28 g')
    await expect(ingredientLines(page)).toHaveText(['250 gmacaroni', '3red onions', '1.5 dlcream'])
    await expect(page.getByText('Timer: 8 min')).toBeVisible()
    await expect(page.getByRole('img', { name: 'Älplermagronen, step 2' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Servings: +1' })).toBeVisible()
  })

  const saved = await storedDish(page, 'Älplermagronen')
  expect(saved).toMatchObject({
    course: 'main',
    effort: 'easy',
    tags: ['Swiss', 'Comfort'],
    icon: 'whisk',
    recipe: { servings: 4, prepMinutes: 10, cookMinutes: 25 },
    nutrition: { kcalPerServing: 720, proteinG: 28, isEstimate: true },
  })
  expect(saved.coverPhotoId).toBeTruthy()
  expect(saved.recipe.ingredients).toEqual([{ quantity: 250, unit: 'g', name: 'macaroni' }, { quantity: 3, name: 'red onions' }, { quantity: 1.5, unit: 'dl', name: 'cream' }])
  expect(saved.recipe.steps).toEqual([
    { text: 'Boil the macaroni for 8 minutes.', timerSeconds: 480 },
    { text: 'Fry the onions until golden.', photoId: expect.any(String) },
    { text: 'Stir in the cream and serve.' },
  ])
})

test('a dish needs only a name, and empty calories stay unknown, never 0', async ({ page }) => {
  await openBook(page)
  await page.goto('/#/recipes/new')
  await page.getByLabel('Name', { exact: true }).fill('Mystery stew')
  await page.getByRole('button', { name: 'Save dish' }).click()
  await expect(page.getByTestId('dish-name')).toHaveText('Mystery stew')
  await expect(page.getByRole('heading', { name: 'No recipe yet' })).toBeVisible()
  await expect(page.getByText('kcal')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Start cooking' })).toHaveCount(0)

  const saved = await storedDish(page, 'Mystery stew')
  expect(saved.nutrition).toEqual({})
  expect('kcalPerServing' in saved.nutrition).toBe(false)

  await page.getByRole('button', { name: 'Back' }).click()
  await expect(cards(page)).toHaveText(['Mystery stewMain'])
})

test('find a dish by search, course filter and sort', async ({ page }) => {
  await openBook(page)
  await addDishes(page, [ROSTI, LASAGNE, SOUP, STRUDEL])
  await expect(cards(page)).toHaveCount(4)
  await expect(page.getByTestId('result-count')).toHaveText('4 dishes')
  await expect(cards(page).first()).toContainText('Apple strudel')
  await expect(cards(page).filter({ hasText: 'Rösti' })).toContainText('35 min')
  await expect(cards(page).filter({ hasText: 'Rösti' })).toContainText('480 kcal')
  await expect(cards(page).filter({ hasText: 'Lasagne' })).toContainText('1 h 15 min')

  const search = page.getByRole('searchbox', { name: 'Search the recipe book' })
  await test.step('by name, without minding accents', async () => {
    await search.fill('rosti')
    await expect(cards(page)).toHaveCount(1)
    await expect(cards(page)).toContainText('Rösti with fried egg')
  })
  await test.step('by tag', async () => {
    await search.fill('quick')
    await expect(cards(page)).toHaveCount(2)
    await expect(page.getByTestId('result-count')).toHaveText('2 dishes')
  })
  await test.step('by ingredient, and the card says why it matched', async () => {
    await search.fill('parmes')
    await expect(cards(page)).toHaveCount(1)
    await expect(cards(page)).toContainText('Lasagne al forno')
    await expect(cards(page)).toContainText('With Parmesan')
  })
  await test.step('nothing found offers a way out', async () => {
    await search.fill('sushi')
    await expect(page.getByRole('heading', { name: 'Nothing on the shelf' })).toBeVisible()
    await page.getByRole('button', { name: 'Show everything' }).click()
    await expect(cards(page)).toHaveCount(4)
  })
  await test.step('by course', async () => {
    const filters = page.getByRole('group', { name: 'Filter by course' })
    await expect(filters.getByRole('button')).toHaveText(['All', 'Starter', 'Main', 'Dessert'])
    await filters.getByRole('button', { name: 'Main' }).click()
    await expect(cards(page)).toHaveCount(2)
    await search.fill('swiss')
    await expect(cards(page)).toHaveCount(1)
    await search.fill('')
    await filters.getByRole('button', { name: 'All' }).click()
    await expect(cards(page)).toHaveCount(4)
  })
  await test.step('sorted quickest first, then by fewest calories with unknown last', async () => {
    await page.getByRole('button', { name: 'Sorted: A to Z' }).click()
    await page.getByRole('radio', { name: 'Quickest' }).click()
    await expect(cards(page)).toContainText(['Tomato soup', 'Rösti with fried egg', 'Apple strudel', 'Lasagne al forno'])
    await page.getByRole('button', { name: 'Sorted: Quickest' }).click()
    await page.getByRole('radio', { name: 'Fewest calories' }).click()
    await expect(cards(page).nth(0)).toContainText('Tomato soup')
    await expect(cards(page).nth(1)).toContainText('Rösti')
    await expect(cards(page).nth(3)).toContainText('Apple strudel')
  })
  await test.step('the book remembers the search after a visit to a dish', async () => {
    await search.fill('lasagne')
    await cards(page).first().click()
    await expect(page.getByTestId('dish-name')).toHaveText('Lasagne al forno')
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(search).toHaveValue('lasagne')
    await expect(cards(page)).toHaveCount(1)
  })
})

test('open a dish and rescale its servings', async ({ page }) => {
  await openBook(page)
  await addDishes(page, [ROSTI])
  await cards(page).first().click()
  await expect(page.getByTestId('dish-name')).toHaveText('Rösti with fried egg')
  await expect(ingredientLines(page)).toHaveText(['250 gpotatoes', '1 tbspbutter', '3eggs', 'salt'])

  await page.getByRole('button', { name: 'Servings: +1' }).click()
  await expect(ingredientLines(page)).toHaveText(['375 gpotatoes', '1½ tbspbutter', '4½eggs', 'salt'])
  await expect(page.getByText('Scaled from 2 servings.')).toBeVisible()

  await page.getByRole('button', { name: 'Servings: +1' }).click()
  await expect(ingredientLines(page)).toHaveText(['500 gpotatoes', '2 tbspbutter', '6eggs', 'salt'])

  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(ingredientLines(page)).toHaveText(['250 gpotatoes', '1 tbspbutter', '3eggs', 'salt'])

  await page.getByRole('button', { name: 'Servings: −1' }).click()
  await expect(ingredientLines(page)).toHaveText(['125 gpotatoes', '½ tbspbutter', '1½eggs', 'salt'])
  await expect(page.getByRole('button', { name: 'Servings: −1' })).toBeDisabled()
})

test('edit a dish, and be asked before unsaved changes are thrown away', async ({ page }) => {
  await openBook(page)
  const ids = await addDishes(page, [ROSTI])
  await cards(page).first().click()
  await page.getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByRole('heading', { name: 'Edit dish' })).toBeVisible()
  const name = page.getByLabel('Name', { exact: true })
  await expect(name).toHaveValue('Rösti with fried egg')

  await test.step('the back arrow asks first', async () => {
    await name.fill('Rösti deluxe')
    await page.getByRole('button', { name: 'Back' }).click()
    const question = page.getByRole('dialog', { name: 'Discard your changes?' })
    await expect(question).toBeVisible()
    await question.getByRole('button', { name: 'Keep editing' }).click()
    await expect(question).toBeHidden()
    await expect(name).toHaveValue('Rösti deluxe')
  })

  await test.step("so does the phone's own back button, without losing what was typed", async () => {
    await page.goBack()
    const question = page.getByRole('dialog', { name: 'Discard your changes?' })
    await expect(question).toBeVisible()
    await expect(name).toHaveValue('Rösti deluxe')
    await question.getByRole('button', { name: 'Discard changes' }).click()
    await expect(page.getByTestId('dish-name')).toHaveText('Rösti with fried egg')
  })

  await test.step('change it for real and save', async () => {
    await page.getByRole('button', { name: 'Edit' }).click()
    await page.getByLabel('Name', { exact: true }).fill('Rösti deluxe')
    await page.getByRole('button', { name: 'Remove ingredient: salt' }).click()
    await page.getByLabel('Add an ingredient').fill('50 g bacon')
    await page.getByLabel('Timer for step 2, minutes').fill('5')
    // The row of section names jumps down the long form and follows along.
    const rail = page.getByRole('navigation', { name: 'Jump to a section' })
    await expect(rail.getByRole('button', { name: 'Calories' })).toHaveAttribute('aria-pressed', 'false')
    await rail.getByRole('button', { name: 'Calories' }).click()
    await expect(rail.getByRole('button', { name: 'Calories' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByLabel('Calories per serving, kcal')).toBeInViewport()
    await page.getByLabel('Calories per serving, kcal').fill('')
    await page.getByRole('button', { name: 'Save dish' }).click()
    await expect(toast(page, 'Saved')).toBeVisible()
    await expect(page.getByTestId('dish-name')).toHaveText('Rösti deluxe')
    await expect(ingredientLines(page)).toHaveText(['250 gpotatoes', '1 tbspbutter', '3eggs', '50 gbacon'])
    await expect(page.getByText('Timer: 5 min')).toBeVisible()
    await expect(page.getByTestId('facts')).not.toContainText('kcal')
  })

  const saved = await storedDish(page, 'Rösti deluxe')
  expect(saved.id).toBe(ids['Rösti with fried egg'])
  expect(saved.nutrition).toEqual({})
  expect(saved.tags).toEqual(['Swiss', 'Quick'])
  expect(saved.recipe.steps[1]).toEqual({ text: 'Flip and fry the other side.', timerSeconds: 300 })

  await test.step('back leads to the book, not into the form again', async () => {
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByRole('heading', { name: 'Recipe book' })).toBeVisible()
    await expect(cards(page)).toContainText(['Rösti deluxe'])
  })
})

test('cook mode: steps, scaled ingredients, a timer that keeps running, and the screen kept awake', async ({ page }) => {
  // The test owns the phone's clock, so a kitchen timer can run out without anyone waiting.
  await page.clock.install()
  let ahead = 0
  const letTimePass = async (seconds: number) => {
    ahead += seconds * 1000
    await page.clock.setSystemTime(Date.now() + ahead)
  }
  // A stand-in wake lock, so we can see that cook mode asks for one and asks again.
  await page.addInitScript(() => {
    const state = { requests: [] as string[], releases: 0, drop: () => {} }
    const buzzes: unknown[] = []
    Object.assign(window, { __wake: state, __buzzes: buzzes })
    navigator.vibrate = (pattern) => {
      buzzes.push(pattern)
      return true
    }
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async (type: string) => {
          state.requests.push(type)
          const listeners: (() => void)[] = []
          const sentinel = {
            released: false,
            release: async () => {
              state.releases += 1
              sentinel.released = true
              listeners.forEach((fn) => fn())
            },
            addEventListener: (_: string, fn: () => void) => listeners.push(fn),
          }
          state.drop = () => void sentinel.release()
          return sentinel
        },
      },
    })
  })
  await openBook(page)
  await addDishes(page, [ROSTI])
  await cards(page).first().click()
  await page.getByRole('button', { name: 'Servings: +1' }).click()
  await page.getByRole('button', { name: 'Servings: +1' }).click()
  await page.getByRole('button', { name: 'Start cooking' }).click()

  const cook = page.getByTestId('cook-mode')
  await expect(cook).toBeVisible()
  // For a moment two steps are on screen, one sliding out. Only one is the current step.
  const step = page.getByTestId('current-step')
  await expect(page.getByTestId('cook-progress')).toHaveText('Step 1 of 3')
  await expect(step.getByTestId('cook-step')).toHaveText('Grate the potatoes and fry them in the butter.')

  await test.step('the screen is kept awake, and again after the phone was locked', async () => {
    await expect(page.getByTestId('awake')).toHaveText('Screen stays on')
    const requests = () => page.evaluate(() => (window as any).__wake.requests as string[])
    // Development builds mount every screen twice, so there may be two requests by now.
    const before = await requests()
    expect(before.length).toBeGreaterThan(0)
    expect(new Set(before)).toEqual(new Set(['screen']))
    // The browser drops the lock when the app goes to the background...
    await page.evaluate(() => (window as any).__wake.drop())
    await expect(page.getByTestId('awake')).toBeHidden()
    // ...and cook mode asks for it again when the app comes back.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await expect(page.getByTestId('awake')).toBeVisible()
    expect(await requests()).toHaveLength(before.length + 1)
  })

  await test.step('the step shows its own ingredients, scaled to 4 servings', async () => {
    await expect(step.getByTestId('step-ingredients').getByRole('listitem')).toHaveText(['500 g potatoes', '2 tbsp butter'])
  })

  await test.step('the ingredient checklist slides up and keeps its ticks', async () => {
    await page.getByRole('button', { name: 'Ingredients, 0 of 4 ready' }).click()
    const list = page.getByRole('dialog', { name: 'Ingredients' })
    await expect(list.getByText('For 4 servings')).toBeVisible()
    await expect(list.getByRole('checkbox')).toHaveText(['500 g potatoes', '2 tbsp butter', '6 eggs', 'salt'])
    await list.getByRole('checkbox', { name: '500 g potatoes' }).click()
    await list.getByRole('checkbox', { name: 'salt' }).click()
    await expect(list.getByRole('checkbox', { name: 'salt' })).toBeChecked()
    await list.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByRole('button', { name: 'Ingredients, 2 of 4 ready' })).toBeVisible()
  })

  await test.step('tap to start the timer', async () => {
    const timer = step.getByTestId('timer')
    await expect(timer).toHaveAttribute('data-state', 'idle')
    await expect(step.getByTestId('timer-time')).toHaveText('1:00')
    await page.getByRole('button', { name: 'Start the 1 min timer' }).click()
    await expect(timer).toHaveAttribute('data-state', 'running')
    await letTimePass(20)
    // The clock keeps ticking for real around the jump, so allow a few seconds either way.
    await expect(step.getByTestId('timer-time')).toHaveText(/^0:(40|3\d)$/)
  })

  await test.step('it keeps running on the next step, and announces itself when done', async () => {
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByTestId('cook-progress')).toHaveText('Step 2 of 3')
    await expect(step.getByTestId('cook-step')).toHaveText('Flip and fry the other side.')
    const others = page.getByTestId('other-timers')
    await expect(others).toContainText('Step 1')
    await expect(others).toContainText(/0:(40|3\d)/)
    await letTimePass(41)
    await expect(others).toContainText('Time is up')
    // The phone buzzed: a long pattern, not the short tick of a button.
    const buzzes = await page.evaluate(() => (window as any).__buzzes as unknown[])
    expect(buzzes.some((pattern) => Array.isArray(pattern) && pattern.length === 5)).toBe(true)
    await others.getByRole('button', { name: 'Go to step 1: Time is up' }).click()
    await expect(page.getByTestId('cook-progress')).toHaveText('Step 1 of 3')
    await expect(step.getByTestId('timer')).toHaveAttribute('data-state', 'done')
    await page.getByRole('button', { name: 'Reset', exact: true }).click()
    await expect(step.getByTestId('timer')).toHaveAttribute('data-state', 'idle')
  })

  await test.step('leaving and coming back picks up where you were, and a timer still speaks up', async () => {
    await page.getByRole('button', { name: 'Start the 1 min timer' }).click()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByTestId('cook-progress')).toHaveText('Step 2 of 3')
    await page.getByRole('button', { name: 'Leave cook mode' }).click()
    await expect(page.getByTestId('dish-name')).toBeVisible()
    await letTimePass(61)
    await expect(toast(page, 'The timer for step 1 is done')).toBeVisible()
    await page.getByRole('button', { name: 'Continue cooking' }).click()
    await expect(page.getByTestId('cook-progress')).toHaveText('Step 2 of 3')
    await expect(page.getByRole('button', { name: 'Ingredients, 2 of 4 ready' })).toBeVisible()
    await expect(page.getByTestId('other-timers')).toContainText('Time is up')
  })

  await test.step('a small celebration at the end', async () => {
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(page.getByTestId('cook-progress')).toHaveText('Step 1 of 3')
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByTestId('cook-progress')).toHaveText('Step 3 of 3')
    await expect(step.getByTestId('step-ingredients').getByRole('listitem')).toHaveText(['6 eggs'])
    await page.getByRole('button', { name: 'Finished' }).click()
    await expect(page.getByTestId('celebration')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'En Guete!' })).toBeVisible()
    await page.getByRole('button', { name: 'Back to the recipe' }).click()
    await expect(page.getByTestId('dish-name')).toHaveText('Rösti with fried egg')
    await expect(page.getByRole('button', { name: 'Start cooking' })).toBeVisible()
  })
})

test('build a menu from two dishes and check its totals', async ({ page }) => {
  await openBook(page)
  await addDishes(page, [SOUP, LASAGNE, STRUDEL])
  await page.getByRole('button', { name: 'Add a dish or menu' }).click()
  await page.getByRole('button', { name: 'A new menu' }).click()
  await expect(page.getByRole('heading', { name: 'New menu' })).toBeVisible()

  await test.step('a menu needs a name and at least one dish', async () => {
    await page.getByRole('button', { name: 'Save menu' }).click()
    await expect(page.getByRole('alert')).toHaveText('Give the menu a name, then save again.')
    await page.getByLabel('Name', { exact: true }).fill('Sunday feast')
    await page.getByRole('button', { name: 'Save menu' }).click()
    await expect(page.getByRole('alert')).toHaveText('Add at least one dish, then save again.')
  })

  await test.step('pick two dishes from the searchable list', async () => {
    await page.getByRole('button', { name: 'Add a dish' }).click()
    const picker = page.getByRole('dialog', { name: 'Pick a dish' })
    await expect(picker.getByRole('checkbox')).toHaveCount(3)
    await picker.getByRole('checkbox', { name: 'Lasagne al forno' }).click()
    await picker.getByRole('searchbox').fill('soup')
    await expect(picker.getByRole('checkbox')).toHaveCount(1)
    await picker.getByRole('checkbox', { name: 'Tomato soup' }).click()
    await expect(picker.getByRole('checkbox', { name: 'Tomato soup' })).toBeChecked()
    await picker.getByRole('button', { name: 'Done' }).click()
    // The starter was picked second, and still goes first.
    await expect(page.getByTestId('menu-course')).toHaveText(['Tomato soupStarter', 'Lasagne al fornoMain'])
  })

  await page.getByRole('button', { name: 'Save menu' }).click()
  await expect(toast(page, 'Saved')).toBeVisible()

  await test.step('the menu page adds up time and calories', async () => {
    await expect(page.getByTestId('menu-name')).toHaveText('Sunday feast')
    await expect(page.getByTestId('menu-courses').getByRole('listitem')).toHaveCount(2)
    await expect(page.getByTestId('menu-courses').getByRole('listitem').first()).toContainText('Tomato soup')
    await expect(page.getByTestId('menu-time')).toHaveText('1 h 40 minin total')
    await expect(page.getByTestId('menu-calories')).toHaveText('820 kcalper person')
    await expect(page.getByTestId('menu-facts')).toContainText('2courses')
  })

  await test.step('add a dish with unknown calories, and a brand new one by name', async () => {
    await page.getByRole('button', { name: 'Edit' }).click()
    await page.getByRole('button', { name: 'Add a dish' }).click()
    const picker = page.getByRole('dialog', { name: 'Pick a dish' })
    await picker.getByRole('checkbox', { name: 'Apple strudel' }).click()
    await picker.getByRole('searchbox').fill('Cheese board')
    await picker.getByRole('button', { name: 'Create "Cheese board" as a new dish' }).click()
    await picker.getByRole('group', { name: 'What kind of dish is Cheese board?' }).getByRole('button', { name: 'Starter' }).click()
    await picker.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByTestId('menu-course')).toHaveText(['Tomato soupStarter', 'Cheese boardStarterNew', 'Lasagne al fornoMain', 'Apple strudelDessert'])
    await page.getByRole('button', { name: 'Remove Cheese board' }).click()
    await expect(page.getByTestId('menu-course')).toHaveCount(3)
    await page.getByRole('button', { name: 'Add a dish' }).click()
    await picker.getByRole('searchbox').fill('Espresso')
    await picker.getByRole('button', { name: 'Create "Espresso" as a new dish' }).click()
    await picker.getByRole('button', { name: 'Drink' }).click()
    await picker.getByRole('button', { name: 'Done' }).click()
    await page.getByRole('button', { name: 'Save menu' }).click()
    await expect(toast(page, 'Saved')).toBeVisible()
  })

  await test.step('with unknown courses it says "at least", not a wrong total', async () => {
    await expect(page.getByTestId('menu-courses').getByRole('listitem')).toHaveCount(4)
    await expect(page.getByTestId('menu-calories')).toHaveText('at least 820 kcalper person')
    await expect(page.getByTestId('menu-time')).toHaveText('at least 2 h 55 minin total')
    await expect(page.getByTestId('menu-facts')).toContainText('2 courses have no calories yet.')
    await expect(page.getByTestId('menu-facts')).toContainText('1 course has no time yet.')
  })

  await test.step('the new dish is in the recipe book, and the menu in the list', async () => {
    expect(await storedDish(page, 'Espresso')).toMatchObject({ course: 'drink', recipe: {}, nutrition: {} })
    expect(await storedDish(page, 'Cheese board')).toBeNull()
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByRole('radio', { name: 'Menus' })).toBeChecked()
    const card = page.getByTestId('menu-card')
    await expect(card).toHaveCount(1)
    await expect(card).toContainText('Sunday feast')
    await expect(card).toContainText('4 courses')
    await expect(card).toContainText('at least 820 kcal')
    await page.getByRole('radio', { name: 'Dishes' }).click()
    await expect(cards(page)).toHaveCount(4)
  })

  await test.step('archive the menu, bring it back, then delete it', async () => {
    await page.getByRole('radio', { name: 'Menus' }).click()
    await page.getByTestId('menu-card').click()
    await page.getByRole('button', { name: 'Archive' }).click()
    await expect(toast(page, 'Archived')).toBeVisible()
    await expect(page.getByTestId('menu-card')).toHaveCount(0)
    await page.getByRole('switch', { name: 'Show archived (1)' }).click()
    await page.getByTestId('menu-card').click()
    await page.getByRole('button', { name: 'Bring back' }).click()
    await expect(toast(page, 'Back in the book')).toBeVisible()
    await page.getByRole('button', { name: 'Delete' }).click()
    const question = page.getByRole('dialog', { name: 'Delete Sunday feast?' })
    await expect(question).toContainText('Its dishes stay in the recipe book.')
    await question.getByRole('button', { name: 'Delete menu' }).click()
    await expect(toast(page, 'Deleted')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'No menus yet' })).toBeVisible()
  })
})

test('archive a dish, find it behind the switch, and bring it back', async ({ page }) => {
  await openBook(page)
  await addDishes(page, [ROSTI, SOUP])
  await cards(page).filter({ hasText: 'Tomato soup' }).click()
  await page.getByRole('button', { name: 'Archive' }).click()
  await expect(toast(page, 'Archived')).toBeVisible()

  await expect(page.getByRole('heading', { name: 'Recipe book' })).toBeVisible()
  await expect(cards(page)).toHaveCount(1)
  await expect(cards(page)).toContainText('Rösti')
  await expect(page.getByTestId('result-count')).toHaveText('1 dish')

  await page.getByRole('switch', { name: 'Show archived (1)' }).click()
  await expect(cards(page)).toHaveCount(2)
  const archived = cards(page).filter({ hasText: 'Tomato soup' })
  await expect(archived).toContainText('Archived')

  await archived.click()
  await expect(page.getByRole('status').filter({ hasText: 'Archived. Hidden from the recipe book.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Propose' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Bring back' }).click()
  await expect(toast(page, 'Back in the book')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Propose' })).toBeVisible()

  await page.getByRole('button', { name: 'Back' }).click()
  await expect(cards(page)).toHaveCount(2)
  await expect(page.getByRole('switch', { name: /Show archived/ })).toHaveCount(0)
})

test('deleting a dish asks first and says what will happen', async ({ page }) => {
  await openBook(page)
  const ids = await addDishes(page, [ROSTI, SOUP])
  const menuId = await addMenu(page, 'Swiss evening', [ids['Tomato soup'], ids['Rösti with fried egg']])
  await cards(page).filter({ hasText: 'Tomato soup' }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  const question = page.getByRole('dialog', { name: 'Delete Tomato soup?' })
  await expect(question).toContainText('It disappears from the recipe book on both phones. This cannot be undone.')
  await expect(question).toContainText('It is also taken out of 1 menu.')

  await question.getByRole('button', { name: 'Cancel' }).click()
  await expect(question).toBeHidden()
  await expect(page.getByTestId('dish-name')).toHaveText('Tomato soup')

  await page.getByRole('button', { name: 'Delete' }).click()
  await question.getByRole('button', { name: 'Delete dish' }).click()
  await expect(toast(page, 'Deleted')).toBeVisible()
  await expect(cards(page)).toHaveCount(1)
  await expect(cards(page)).toContainText('Rösti')

  await page.goto(`/#/menus/${menuId}`)
  await expect(page.getByTestId('menu-courses').getByRole('listitem')).toHaveCount(1)
  await expect(page.getByTestId('menu-courses')).toContainText('Rösti with fried egg')
})

test('no calorie number anywhere when calories are switched off', async ({ page }) => {
  await openBook(page, { showCalories: false })
  const ids = await addDishes(page, [ROSTI, SOUP])
  await expect(cards(page)).toHaveCount(2)
  await expect(page.getByText('kcal')).toHaveCount(0)
  await page.getByRole('button', { name: 'Sorted: A to Z' }).click()
  const sorts = page.getByRole('dialog', { name: 'Sort by' })
  await expect(sorts.getByRole('radio')).toHaveText(['A to Z', 'Newest', 'Quickest'])
  await sorts.getByRole('radio', { name: 'Quickest' }).click()

  await cards(page).filter({ hasText: 'Rösti' }).click()
  await expect(page.getByTestId('facts')).toContainText('Total')
  await expect(page.getByText('kcal')).toHaveCount(0)

  await page.getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByRole('heading', { name: 'Steps' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Calories' })).toHaveCount(0)
  await page.getByLabel('Name', { exact: true }).fill('Rösti classic')
  await page.getByRole('button', { name: 'Save dish' }).click()
  await expect(page.getByTestId('dish-name')).toHaveText('Rösti classic')
  // Hiding calories must not erase them.
  expect((await storedDish(page, 'Rösti classic')).nutrition).toEqual({ kcalPerServing: 480 })

  const menuId = await addMenu(page, 'Solo', [ids['Tomato soup']])
  await page.goto(`/#/menus/${menuId}`)
  await expect(page.getByTestId('menu-name')).toHaveText('Solo')
  await expect(page.getByTestId('menu-time')).toBeVisible()
  await expect(page.getByText('kcal')).toHaveCount(0)
})

test('the Recipe Book speaks German too', async ({ page }) => {
  await openBook(page)
  await addDishes(page, [ROSTI])
  await page.addInitScript(() => localStorage.setItem('foodwishus.lang', 'de'))
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Rezeptbuch' })).toBeVisible()
  await expect(page.getByTestId('result-count')).toHaveText('1 Gericht')
  await cards(page).first().click()
  await page.getByRole('button', { name: 'Portionen: +1' }).click()
  await expect(page.getByText('Umgerechnet von 2 Portionen.')).toBeVisible()
  await expect(ingredientLines(page)).toHaveText(['375 gpotatoes', '1½ tbspbutter', '4½eggs', 'salt'])
  await expect(page.getByRole('button', { name: 'Loskochen' })).toBeVisible()
})
