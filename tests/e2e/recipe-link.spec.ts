import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { kit, tabs, useDemo } from './ship.helpers'

// "Recipe from a link": one phone in a kitchen in the pretend cloud. The cloud runs the
// real helper function with a pretend web behind it (src/data/fake/pretendWeb.ts), so
// nothing here leaves the machine.

const SOUP = 'https://www.lecker-kochen.ch/rezepte/rueeblisuppe'
const CORNBREAD = 'https://sunnykitchen.com/cornbread'
const PIN = 'https://pin.it/AbC'
const SHOP = 'https://sunnykitchen.com/shop'

const MIA = { name: 'Mia', pin: '271828', kitchen: 'Casa Mia' }

/** One person opens a kitchen and lands in the app. */
async function openKitchen(browser: Browser, contexts: BrowserContext[]): Promise<Page> {
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
  contexts.push(context)
  await context.addInitScript(() => {
    if (!localStorage.getItem('foodwishus.lang')) localStorage.setItem('foodwishus.lang', 'en')
    if (!localStorage.getItem('foodwishus.theme')) localStorage.setItem('foodwishus.theme', 'light')
  })
  const page = await context.newPage()
  const next = () => page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.goto('/#/')
  await page.getByRole('button', { name: 'Start from scratch' }).click()
  await page.getByRole('radio', { name: /I hold the fork/ }).click()
  await page.getByLabel('Kitchen name').fill(MIA.kitchen)
  await next()
  await page.getByLabel('Your name').fill(MIA.name)
  await next()
  await next()
  await page.getByLabel('PIN', { exact: true }).fill(MIA.pin)
  await page.getByLabel('Repeat PIN', { exact: true }).fill(MIA.pin)
  await page.getByRole('button', { name: 'Open the kitchen' }).click()
  await expect(page.getByRole('heading', { name: 'Your kitchen is open' })).toBeVisible()
  await page.goto('/#/recipes')
  await expect(tabs(page)).toBeVisible()
  return page
}

/** From any tab: the plus, then "A recipe from a link". */
async function openReader(page: Page): Promise<void> {
  await tabs(page).getByRole('button', { name: 'Add something' }).click()
  await page.getByRole('button', { name: /^A recipe from a link/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Recipe from a link' })).toBeVisible()
}

async function read(page: Page, link: string): Promise<void> {
  await page.getByLabel('Link to the recipe').fill(link)
  await page.getByRole('button', { name: 'Read recipe' }).click()
}

const note = (page: Page) => page.getByTestId('read-note')
const problem = (page: Page) => page.getByTestId('link-problem')
const ingredients = (page: Page) => page.getByTestId('ingredient-row')
const steps = (page: Page) => page.getByTestId('step').getByRole('textbox', { name: /^Step \d+$/ })

const storedDishes = async (page: Page) => {
  const k = await kit(page)
  return k.evaluate(async (app) => (await app.db.dishes.toArray()).filter((dish: { deletedAt: string | null }) => !dish.deletedAt))
}

/** What the kitchen's owner does in the dashboard, and what a busy day does. */
const setHelper = (page: Page, query: string) => page.request.post(`/__cloud/helper-setup?${query}`)

let contexts: BrowserContext[] = []
test.beforeEach(async ({ request }) => {
  contexts = []
  await request.post('/__cloud/reset')
})
test.afterEach(async () => {
  for (const context of contexts) await context.close()
})

test('a pasted link becomes a dish: read, look over, save', async ({ browser }) => {
  const page = await openKitchen(browser, contexts)
  await openReader(page)

  await test.step('the three switches start switched on', async () => {
    for (const name of ['Write it in English', 'Convert cups, ounces and Fahrenheit', 'Bring the picture along']) await expect(page.getByRole('switch', { name })).toBeChecked()
  })

  await read(page, SOUP)

  await test.step('the dish form opens, filled in, with where it is from', async () => {
    await expect(page.getByRole('heading', { level: 1, name: 'New dish' })).toBeVisible()
    await expect(note(page)).toContainText('Read from Lecker Kochen')
    await expect(note(page)).toContainText('Look it over, change what is off, then save.')
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Rüeblisuppe mit Ingwer')
    await expect(page.getByLabel('Short description')).toHaveValue('Eine cremige Suppe für kalte Tage.')
    await expect(page.getByTestId('cover-preview')).toBeVisible()
    await expect(page.getByTestId('total-time')).toHaveText('40 min in total')
    await expect(ingredients(page)).toHaveText(['500 gRüebli', '1Zwiebel', '20 gIngwer', '8 dlGemüsebouillon', '1 dlRahm', 'Salz, Pfeffer'])
    await expect(steps(page)).toHaveCount(4)
    await expect(page.getByLabel('Source')).toHaveValue(SOUP)
  })

  await test.step('steps that name a time have their timer set', async () => {
    await expect(page.getByLabel('Timer for step 1, minutes')).toHaveValue('')
    await expect(page.getByLabel('Timer for step 2, minutes')).toHaveValue('5')
    await expect(page.getByLabel('Timer for step 3, minutes')).toHaveValue('20')
  })

  await test.step('saving puts it into the recipe book, picture and all', async () => {
    await page.getByRole('button', { name: 'Save dish' }).click()
    await expect(page.getByTestId('dish-name')).toHaveText('Rüeblisuppe mit Ingwer')
    const [dish] = await storedDishes(page)
    expect(dish).toMatchObject({ name: 'Rüeblisuppe mit Ingwer', course: 'starter' })
    expect(dish.coverPhotoId).toBeTruthy()
    expect(dish.recipe).toMatchObject({ servings: 4, prepMinutes: 15, cookMinutes: 25, sourceUrl: SOUP })
    expect(dish.nutrition).toMatchObject({ kcalPerServing: 210, isEstimate: true })
  })

  await test.step('back leads to the recipe book, not into the reader again', async () => {
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Recipe book' })).toBeVisible()
    await expect(page.getByTestId('dish-card')).toHaveCount(1)
  })
})

test('an English blog with cups: converted, with a note that points to the ingredients', async ({ browser }) => {
  const page = await openKitchen(browser, contexts)
  await openReader(page)
  await read(page, CORNBREAD)

  await expect(page.getByLabel('Name', { exact: true })).toHaveValue("Grandma's skillet cornbread")
  await expect(ingredients(page)).toHaveText(['210 gcornmeal', '125 gall-purpose flour', '115 gbutter, melted', '2eggs', '300 mlbuttermilk', '1 tspsalt'])
  await expect(steps(page).first()).toHaveValue('Heat the oven to 200 degrees with the skillet inside.')
  await expect(page.getByRole('button', { name: 'Servings: +1' })).toBeVisible()

  await test.step('what the helper was not sure about is listed, and one tap leads there', async () => {
    await expect(note(page).getByRole('heading', { name: 'Please check' })).toBeVisible()
    await expect(note(page)).toContainText('The cups are roughly converted to grams.')
    await note(page).getByRole('button', { name: 'Go to Ingredients' }).click()
    await expect(page.getByRole('heading', { name: 'Ingredients' })).toBeInViewport()
  })

  await test.step('leaving without saving asks first', async () => {
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByRole('heading', { name: 'Discard your changes?' })).toBeVisible()
    await page.getByRole('button', { name: 'Discard changes' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Recipe book' })).toBeVisible()
    expect(await storedDishes(page)).toHaveLength(0)
  })
})

test('the switches decide how it is written, and are remembered', async ({ browser }) => {
  const page = await openKitchen(browser, contexts)
  await openReader(page)
  await page.getByRole('switch', { name: 'Convert cups, ounces and Fahrenheit' }).click()
  await page.getByRole('switch', { name: 'Bring the picture along' }).click()
  await read(page, CORNBREAD)

  await expect(ingredients(page).first()).toHaveText('1½ cupscornmeal')
  await expect(steps(page).first()).toHaveValue('Heat the oven to 400 °F with the skillet inside.')
  await expect(page.getByTestId('cover-preview')).toHaveCount(0)
  await expect(note(page).getByRole('heading', { name: 'Please check' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Back' }).click()
  await page.getByRole('button', { name: 'Discard changes' }).click()
  await openReader(page)
  await expect(page.getByRole('switch', { name: 'Convert cups, ounces and Fahrenheit' })).not.toBeChecked()
  await expect(page.getByRole('switch', { name: 'Bring the picture along' })).not.toBeChecked()
  await expect(page.getByRole('switch', { name: 'Write it in English' })).toBeChecked()
})

test('a page that is already in the recipe book is noticed, before and after reading', async ({ browser }) => {
  const page = await openKitchen(browser, contexts)
  await openReader(page)
  await read(page, SOUP)
  await page.getByRole('button', { name: 'Save dish' }).click()
  await expect(page.getByTestId('dish-name')).toHaveText('Rüeblisuppe mit Ingwer')

  await test.step('the same link again: said as soon as it is in the field', async () => {
    await page.getByRole('button', { name: 'Back' }).click()
    await openReader(page)
    await page.getByLabel('Link to the recipe').fill(`${SOUP}?utm_source=newsletter`)
    await expect(page.getByTestId('link-known')).toContainText('This page is where "Rüeblisuppe mit Ingwer" is from.')
  })

  await test.step('through a pin the address is only known after reading: the form says it', async () => {
    await read(page, PIN)
    await expect(page.getByTestId('read-known')).toContainText('This page is where "Rüeblisuppe mit Ingwer" is from.')
    await page.getByTestId('read-known').getByRole('button', { name: 'Open that dish' }).click()
    await expect(page.getByTestId('dish-name')).toHaveText('Rüeblisuppe mit Ingwer')
    expect(await storedDishes(page)).toHaveLength(1)
  })
})

test('a pin leads to the recipe behind it, pasted with one tap', async ({ browser }) => {
  const page = await openKitchen(browser, contexts)
  await openReader(page)
  // The way a pin is copied on a phone: a sentence with the link in it.
  await page.evaluate((text) => navigator.clipboard.writeText(text), `Schau dir diesen Pin an: ${PIN}`)
  await page.getByRole('button', { name: 'Paste from clipboard' }).click()
  await expect(page.getByLabel('Link to the recipe')).toHaveValue(PIN)
  await page.getByRole('button', { name: 'Read recipe' }).click()

  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Rüeblisuppe mit Ingwer')
  await expect(note(page)).toContainText('Read from Lecker Kochen')
  // The source is the recipe's own page, without the pin's tracking tail.
  await expect(page.getByLabel('Source')).toHaveValue(SOUP)
})

test('a link shared to the app from another one arrives in the reader', async ({ browser }) => {
  const page = await openKitchen(browser, contexts)
  // What Android opens when "FoodwishUs" is picked in another app's share sheet.
  await page.goto(`/?shared_text=${encodeURIComponent(`Look at this recipe: ${CORNBREAD}`)}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Recipe from a link' })).toBeVisible()
  await expect(page.getByLabel('Link to the recipe')).toHaveValue(CORNBREAD)
  // The address is tidy again: a reload does not share it a second time.
  expect(new URL(page.url()).search).toBe('')
  await page.getByRole('button', { name: 'Read recipe' }).click()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue("Grandma's skillet cornbread")
})

test('what cannot be read says why, and the dish can still be added by hand', async ({ browser }) => {
  const page = await openKitchen(browser, contexts)
  await openReader(page)

  await test.step('no link at all: said at once, nothing is sent', async () => {
    await read(page, 'Rüeblisuppe von Mama')
    await expect(problem(page)).toContainText('That does not look like a link. Paste the address of the recipe page.')
    await expect(problem(page).getByRole('button', { name: 'Add it by hand' })).toHaveCount(0)
  })

  await test.step('a page that does not answer', async () => {
    await read(page, 'https://www.lecker-kochen.ch/rezepte/gibt-es-nicht')
    await expect(problem(page)).toContainText('The page did not answer. Check the link, or try again in a moment.')
  })

  await test.step('typing a new link clears the message', async () => {
    await page.getByLabel('Link to the recipe').fill(SHOP)
    await expect(problem(page)).toHaveCount(0)
  })

  await test.step('a page without a recipe: add it by hand, with the link kept as the source', async () => {
    await page.getByRole('button', { name: 'Read recipe' }).click()
    await expect(problem(page)).toContainText('Fork found no recipe on that page.')
    await problem(page).getByRole('button', { name: 'Add it by hand' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'New dish' })).toBeVisible()
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('')
    await expect(page.getByLabel('Source')).toHaveValue(SHOP)
    await expect(note(page)).toHaveCount(0)
    // Nothing was typed yet, so leaving does not ask.
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Recipe book' })).toBeVisible()
  })
})

test('without a key the page’s own recipe data still works, and the limit is said plainly', async ({ browser }) => {
  const page = await openKitchen(browser, contexts)

  await test.step('no key yet: a page with recipe data is read as it is', async () => {
    await setHelper(page, 'key=')
    await openReader(page)
    await read(page, SOUP)
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Rüeblisuppe mit Ingwer')
    await expect(note(page)).toContainText('Read from the page as it is: nothing translated, no units converted.')
    await page.getByRole('button', { name: 'Back' }).click()
    await page.getByRole('button', { name: 'Discard changes' }).click()
  })

  await test.step('no key yet: a page that needs the helper says so', async () => {
    await openReader(page)
    await read(page, CORNBREAD)
    await expect(problem(page)).toContainText('This page needs the AI helper, and it is not set up for this kitchen yet.')
    await expect(problem(page).getByRole('button', { name: 'Add it by hand' })).toBeVisible()
  })

  await test.step('the helper is down: the same page says to try again', async () => {
    await setHelper(page, 'key=pretend-key&down=true')
    await page.getByRole('button', { name: 'Read recipe' }).click()
    await expect(problem(page)).toContainText('The AI helper is not answering right now.')
  })

  await test.step('the day’s pages are used up', async () => {
    await setHelper(page, 'down=false&used=40')
    await page.getByRole('button', { name: 'Read recipe' }).click()
    await expect(problem(page)).toContainText('Fork has read 40 pages today, and that is the limit. Tomorrow there is room again.')
  })
})

test('offline, the reader says so and nothing is lost', async ({ browser }) => {
  const page = await openKitchen(browser, contexts)
  await openReader(page)
  await page.context().setOffline(true)
  await read(page, SOUP)
  await expect(problem(page)).toContainText('No connection. Reading a link needs the internet.')
  await expect(page.getByLabel('Link to the recipe')).toHaveValue(SOUP)
  await page.context().setOffline(false)
  await page.getByRole('button', { name: 'Read recipe' }).click()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Rüeblisuppe mit Ingwer')
})

test('auf Deutsch: übersetzt, umgerechnet, mit Hinweis', async ({ browser }) => {
  const page = await openKitchen(browser, contexts)
  await page.goto('/#/settings')
  await page.getByRole('radio', { name: 'Deutsch' }).click()
  await page.goto('/#/recipes')
  await tabs(page).getByRole('button', { name: 'Etwas hinzufügen' }).click()
  await page.getByRole('button', { name: /^Ein Rezept aus einem Link/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Rezept aus einem Link' })).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Auf Deutsch schreiben' })).toBeChecked()

  await page.getByLabel('Link zum Rezept').fill(CORNBREAD)
  await page.getByRole('button', { name: 'Rezept lesen' }).click()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Maisbrot aus der Pfanne')
  await expect(ingredients(page).first()).toHaveText('210 gMaisgriess')
  await expect(note(page)).toContainText('Gelesen von sunnykitchen.com')
  await expect(note(page).getByRole('heading', { name: 'Bitte prüfen' })).toBeVisible()
  await expect(note(page)).toContainText('Die Tassen sind grob in Gramm umgerechnet.')
  await expect(note(page).getByRole('button', { name: 'Zu Zutaten' })).toBeVisible()
})

test('the demo kitchen says up front that it cannot read links', async ({ page }) => {
  await useDemo(page, { empty: true })
  await page.goto('/#/recipes/import')
  await expect(page.getByRole('heading', { level: 1, name: 'Recipe from a link' })).toBeVisible()
  await expect(problem(page)).toContainText('Not in the demo kitchen')
  await expect(problem(page)).toContainText('The demo kitchen cannot read links. Leave the demo and try it in your own kitchen.')
})
