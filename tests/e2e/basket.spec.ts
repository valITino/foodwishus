import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { kit, makeCouple, settle, tabs, useDemo, type Kit } from './ship.helpers'

// The basket (the shared shopping list), the pantry, and Fork between them. Two phones
// in one kitchen in the pretend cloud, which runs the real helper function with a
// stand-in for the AI (src/data/fake/pretendWeb.ts).

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' })
const dayFrom = (offset: number) => dayFormat.format(new Date(Date.now() + offset * 86_400_000))
const weekdayOf = (day: string, locale = 'en-GB') => new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))

const SOUP = { name: 'Rüeblisuppe', recipe: { servings: 4, ingredients: [{ quantity: 500, unit: 'g', name: 'Rüebli' }, { quantity: 1, name: 'Zwiebel' }, { quantity: 1, unit: 'dl', name: 'Rahm' }, { name: 'Salz' }] } }

const rows = (page: Page) => page.getByTestId('basket-row')
const boughtRows = (page: Page) => page.getByTestId('bought-row')
const suggestions = (page: Page) => page.getByTestId('suggestion')
const pantryRows = (page: Page) => page.getByTestId('pantry-row')
const outcome = (page: Page) => page.getByTestId('fork-outcome')
const toast = (page: Page, text: string) => page.getByRole('status').getByText(text, { exact: true }).last()

/** Do something through the app's own actions on this phone, and send it to the cloud. */
async function act<T>(page: Page, run: (app: Kit, arg: any) => Promise<T>, arg?: unknown): Promise<T> {
  const k = await kit(page)
  const result = await k.evaluate(run, arg)
  await settle(page)
  return result
}

/** Fetch from the cloud until the page shows what is expected. */
async function pullUntil(page: Page, check: () => Promise<void>): Promise<void> {
  const k = await kit(page)
  await expect(async () => {
    await k.evaluate((app) => app.sync.sync())
    await check()
  }).toPass({ timeout: 20_000 })
}

const openBasket = async (page: Page, view: 'basket' | 'pantry' = 'basket') => {
  await page.goto(view === 'pantry' ? '/#/basket?view=pantry' : '/#/basket')
  await expect(page.getByRole('heading', { level: 1, name: 'Basket' })).toBeVisible()
}

const addLine = async (page: Page, label: string, text: string) => {
  await page.getByLabel(label).fill(text)
  await page.getByLabel(label).press('Enter')
}

/** A soup planned for tomorrow, put into the kitchen through the app's own actions. */
const planSoup = (page: Page, day = dayFrom(1)) =>
  act(
    page,
    async (app, [dish, date]) => {
      const made = await app.actions.createDish(dish)
      await app.actions.proposeServing({ dishId: made.id, plan: { date, slot: 'dinner' } })
      return made.id as string
    },
    [SOUP, day],
  )

const setHelper = (page: Page, query: string) => page.request.post(`/__cloud/helper-setup?${query}`)

let contexts: BrowserContext[] = []
test.beforeEach(async ({ request }) => {
  contexts = []
  await request.post('/__cloud/reset')
})
test.afterEach(async () => {
  for (const context of contexts) await context.close()
})

test('the two of them share one basket: written by one, ticked off by the other, cleared into the pantry', async ({ browser }) => {
  test.setTimeout(120_000)
  const { leo, mia } = await makeCouple(browser, contexts)

  await test.step('she adds two things from the plus, in one line', async () => {
    await tabs(mia).getByRole('button', { name: 'Add something' }).click()
    await mia.getByRole('button', { name: /^Something for the basket/ }).click()
    await expect(mia.getByRole('heading', { level: 1, name: 'Basket' })).toBeVisible()
    await expect(mia.getByRole('heading', { name: 'Nothing to buy' })).toBeVisible()
    await expect(mia.getByLabel('Add to the basket')).toBeFocused()
    await mia.getByLabel('Add to the basket').fill('Milk 2 l, eggs')
    await mia.getByLabel('Add to the basket').press('Enter')
    await expect(toast(mia, '2 added')).toBeVisible()
    await expect(rows(mia)).toHaveText(['Milk2 l', 'Eggs'])
    // The field is empty and ready for the next thing.
    await expect(mia.getByLabel('Add to the basket')).toHaveValue('')
    await expect(mia.getByLabel('Add to the basket')).toBeFocused()
  })

  await test.step('the same thing is never there twice: a new amount replaces the old one', async () => {
    await addLine(mia, 'Add to the basket', '6 Eggs')
    await expect(toast(mia, 'Eggs is on the list already.')).toBeVisible()
    await expect(rows(mia)).toHaveText(['Milk2 l', 'Eggs6'])
    await settle(mia)
  })

  await test.step('his Today shows the basket and the bell says what is new', async () => {
    await leo.goto('/#/')
    await pullUntil(leo, () => expect(leo.getByTestId('basket-button')).toHaveAccessibleName('Basket, 2 things to buy', { timeout: 500 }))
    await leo.getByTestId('bell').click()
    await expect(leo.getByTestId('news-line').filter({ hasText: 'on the basket' })).toHaveText(/Mia put 2 things on the basket\./)
    await leo.getByTestId('news-line').filter({ hasText: 'on the basket' }).getByRole('button').click()
    await expect(leo.getByRole('heading', { level: 1, name: 'Basket' })).toBeVisible()
    await expect(rows(leo)).toHaveText(['Milk2 l', 'Eggs6'])
  })

  await test.step('he ticks the milk off in the shop, and she sees it', async () => {
    await leo.getByRole('button', { name: 'Bought: Milk' }).click()
    await expect(boughtRows(leo)).toHaveText(['Milk2 l'])
    await expect(rows(leo)).toHaveText(['Eggs6'])
    await settle(leo)
    await pullUntil(mia, () => expect(boughtRows(mia)).toHaveText(['Milk2 l'], { timeout: 500 }))
  })

  await test.step('a thing can be changed or taken off', async () => {
    await mia.getByRole('button', { name: 'Change Eggs' }).click()
    const sheet = mia.getByRole('dialog', { name: 'On the basket' })
    await sheet.getByLabel('How much').fill('12')
    await sheet.getByLabel('Note').fill('The free-range ones')
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(rows(mia)).toHaveText(['Eggs12The free-range ones'])
  })

  await test.step('at home she clears what was bought into the pantry', async () => {
    await mia.getByRole('button', { name: 'Clear' }).click()
    const sheet = mia.getByRole('dialog', { name: 'Clear what was bought?' })
    await expect(sheet).toContainText('1 thing leaves the list.')
    await sheet.getByRole('button', { name: 'Clear and note in the pantry' }).click()
    await expect(toast(mia, 'Cleared and noted in the pantry')).toBeVisible()
    await expect(boughtRows(mia)).toHaveCount(0)
    await mia.getByRole('radio', { name: 'Pantry' }).click()
    await expect(pantryRows(mia)).toHaveText(['Milk2 lNoted today'])
    await settle(mia)
    await leo.getByRole('radio', { name: 'Pantry' }).click()
    await pullUntil(leo, () => expect(pantryRows(leo)).toHaveText(['Milk2 lNoted today'], { timeout: 500 }))
  })
})

test('the pantry: note what is there, change it, and what is used up goes onto the basket', async ({ browser }) => {
  const { mia } = await makeCouple(browser, contexts)
  await openBasket(mia, 'pantry')
  await expect(mia.getByRole('heading', { name: 'Nothing noted yet' })).toBeVisible()

  await addLine(mia, 'Note what is at home', 'Flour 1 kg, Butter, Milk almost empty')
  await expect(toast(mia, '3 noted')).toBeVisible()
  await expect(mia.getByRole('heading', { name: '3 things at home' })).toBeVisible()
  await expect(pantryRows(mia)).toHaveText(['ButterThereNoted today', 'Flour1 kgNoted today', 'Milk almost emptyThereNoted today'])

  await test.step('writing a thing down again is how much is there now', async () => {
    await addLine(mia, 'Note what is at home', 'Flour 300 g')
    await expect(toast(mia, 'Noted')).toBeVisible()
    await expect(pantryRows(mia).nth(1)).toHaveText('Flour300 gNoted today')
    await expect(pantryRows(mia)).toHaveCount(3)
  })

  await test.step('change a line by hand', async () => {
    await mia.getByRole('button', { name: 'Change Milk almost empty' }).click()
    const sheet = mia.getByRole('dialog', { name: 'In the pantry' })
    await sheet.getByLabel('What').fill('Milk')
    await sheet.getByLabel('How much is left').fill('almost empty')
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(pantryRows(mia).nth(2)).toHaveText('Milkalmost emptyNoted today')
  })

  await test.step('used up: out of the pantry, onto the basket, in one tap', async () => {
    await mia.getByRole('button', { name: 'Change Butter' }).click()
    await mia.getByRole('dialog', { name: 'In the pantry' }).getByRole('button', { name: 'Used up, put it on the basket' }).click()
    await expect(toast(mia, 'Butter is on the basket')).toBeVisible()
    await expect(pantryRows(mia)).toHaveCount(2)
    await mia.getByRole('radio', { name: 'Basket' }).click()
    await expect(rows(mia)).toHaveText(['Butter'])
  })
})

test("a dish's ingredients go into the basket, without what is at home", async ({ browser }) => {
  const { mia } = await makeCouple(browser, contexts)
  const dishId = await act(mia, async (app, dish) => {
    await app.actions.notePantry([{ name: 'Rahm', amount: '2 dl' }])
    return (await app.actions.createDish(dish)).id as string
  }, SOUP)
  await mia.goto(`/#/recipes/${dishId}`)
  await mia.getByRole('button', { name: 'Ingredients into the basket' }).click()
  const sheet = mia.getByRole('dialog', { name: 'What do you need to buy?' })
  const lines = sheet.getByTestId('to-basket-line')
  await expect(lines).toHaveText(['Rüebli500 g', 'Zwiebel1', 'Rahm1 dlin the pantry', 'Salz'])
  await expect(lines.nth(0)).toBeChecked()
  await expect(lines.nth(2)).not.toBeChecked()
  // No salt either, thanks.
  await lines.nth(3).click()
  await sheet.getByRole('button', { name: 'Put 2 things on the basket' }).click()
  await expect(toast(mia, '2 added')).toBeVisible()

  await openBasket(mia)
  await expect(rows(mia)).toHaveText(['Rüebli500 gRüeblisuppe', 'Zwiebel1Rüeblisuppe'])

  // A second look at the same dish knows what is on the basket already.
  await mia.goto(`/#/recipes/${dishId}`)
  await mia.getByRole('button', { name: 'Ingredients into the basket' }).click()
  await expect(lines.nth(0)).toHaveText('Rüebli500 gon the basket')
  await expect(lines.nth(0)).not.toBeChecked()
})

test('Fork checks the plan against the pantry and suggests; she decides', async ({ browser }) => {
  test.setTimeout(120_000)
  const { mia } = await makeCouple(browser, contexts)
  const tomorrow = dayFrom(1)
  await openBasket(mia)

  await test.step('nothing planned: nothing to check', async () => {
    await mia.getByRole('button', { name: 'Check the plan' }).click()
    await expect(outcome(mia)).toHaveText('Nothing is planned for the next 7 days. Plan a meal, then check again.')
  })

  await planSoup(mia, tomorrow)

  await test.step('an empty pantry: every ingredient of the plan, and a word on why', async () => {
    await mia.getByRole('button', { name: 'Check the plan' }).click()
    await expect(outcome(mia)).toContainText('3 ingredients of the planned meals are not in the pantry. They are above.')
    await expect(outcome(mia)).toContainText('The pantry is empty, so this is every ingredient of the planned meals.')
    await expect(suggestions(mia)).toHaveText([`Rüebli500 gFor Rüeblisuppe on ${weekdayOf(tomorrow)}.`, `Zwiebel1For Rüeblisuppe on ${weekdayOf(tomorrow)}.`, `Rahm1 dlFor Rüeblisuppe on ${weekdayOf(tomorrow)}.`])
    await mia.getByRole('button', { name: 'None of them' }).click()
    await expect(suggestions(mia)).toHaveCount(0)
  })

  await act(mia, (app) => app.actions.notePantry([{ name: 'Zwiebel', amount: '4' }, { name: 'Rahm', amount: 'fast leer' }]))

  await test.step('with a pantry the helper compares: what is almost gone is missing too', async () => {
    await mia.getByRole('button', { name: 'Check the plan' }).click()
    await expect(outcome(mia)).toHaveText('Fork found 2 things. They are above, for you to decide.')
    await expect(mia.getByRole('heading', { name: 'Fork suggests 2 things' })).toBeInViewport()
    await expect(suggestions(mia)).toHaveText([`Rüebli500 gFor Rüeblisuppe on ${weekdayOf(tomorrow)}: none in the pantry.`, `Rahm1 dlFor Rüeblisuppe on ${weekdayOf(tomorrow)}: the pantry says "fast leer".`])
  })

  await test.step('asking again before deciding brings the same suggestions, not none', async () => {
    await mia.getByRole('button', { name: 'Check the plan' }).click()
    await expect(outcome(mia)).toHaveText('Fork found 2 things. They are above, for you to decide.')
    await expect(suggestions(mia)).toHaveText([/^Rüebli500 g/, /^Rahm1 dl/])
  })

  await test.step('one goes on the list, one does not', async () => {
    await mia.getByRole('button', { name: 'Put Rüebli on the list' }).click()
    await mia.getByRole('button', { name: 'Not needed: Rahm' }).click()
    await expect(suggestions(mia)).toHaveCount(0)
    await expect(rows(mia)).toHaveText(['Rüebli500 g'])
  })

  await test.step('checking again never suggests what is on the list', async () => {
    await mia.getByRole('button', { name: 'Check the plan' }).click()
    await expect(outcome(mia)).toHaveText('Fork found 1 thing. It is above, for you to decide.')
    await expect(suggestions(mia)).toHaveText([/^Rahm1 dl/])
    await mia.getByRole('button', { name: 'Add all' }).click()
    await expect(rows(mia)).toHaveText(['Rahm1 dl', 'Rüebli500 g'])
  })

  await test.step('without the helper Fork compares names, and says so', async () => {
    await act(mia, async (app) => app.actions.removeFromBasket((await app.db.basket.toArray()).map((item: { id: string }) => item.id)))
    await setHelper(mia, 'key=')
    await mia.getByRole('button', { name: 'Check the plan' }).click()
    await expect(outcome(mia)).toContainText('1 ingredient of the planned meals is not in the pantry. It is above.')
    await expect(outcome(mia)).toContainText('The AI helper is not set up for this kitchen yet, so Fork only compared names.')
    await expect(suggestions(mia)).toHaveText([`Rüebli500 gFor Rüeblisuppe on ${weekdayOf(tomorrow)}.`])
  })
})

test('Fork keeps an eye on the plan by himself and rings both bells', async ({ browser }) => {
  test.setTimeout(120_000)
  const { leo, mia } = await makeCouple(browser, contexts)
  // Half a second of quiet instead of half a minute.
  for (const page of [leo, mia]) await page.evaluate(() => localStorage.setItem('foodwishus.forkQuietMs', '500'))
  await act(mia, (app) => app.actions.notePantry([{ name: 'Rahm', amount: 'fast leer' }]))
  await mia.goto('/#/')
  await expect(tabs(mia)).toBeVisible()
  // One question to the helper is left for today. If both phones asked, the second would
  // be turned away and overwrite the suggestions with a list of names.
  await setHelper(mia, 'used=39')

  await planSoup(mia)

  await test.step('on her phone: the bell, and the suggestions on the basket', async () => {
    await expect(mia.getByTestId('bell')).toHaveAccessibleName(/1 new/, { timeout: 20_000 })
    await mia.getByTestId('bell').click()
    await expect(mia.getByTestId('news-line').first()).toHaveText(/Fork thinks 3 things are running low\./)
    await mia.getByTestId('news-line').first().getByRole('button').click()
    await expect(suggestions(mia)).toHaveCount(3)
    await settle(mia)
  })

  await test.step('on his phone: the same suggestions and one line, without asking again', async () => {
    await leo.goto('/#/')
    await pullUntil(leo, () => expect(leo.getByTestId('bell')).toHaveAccessibleName(/new/, { timeout: 500 }))
    await leo.getByTestId('bell').click()
    await expect(leo.getByTestId('news-line').filter({ hasText: 'Fork' })).toHaveText(/Fork thinks 3 things are running low\./)
    await openBasket(leo)
    await expect(suggestions(leo)).toHaveCount(3)
    // Still the helper's own words: his phone did not ask again.
    await expect(suggestions(leo).last()).toContainText('the pantry says "fast leer".')
    // The kitchen remembers which plan was checked.
    const k = await kit(leo)
    expect(await k.evaluate(async (app) => (await app.db.households.toArray())[0].settings.forkChecked)).toContain('/')
  })

  await test.step('switched off, he leaves the plan alone', async () => {
    await openBasket(mia)
    await mia.getByRole('switch', { name: 'Check by himself when the plan changes' }).click()
    await expect(mia.getByRole('switch', { name: 'Check by himself when the plan changes' })).not.toBeChecked()
  })
})

test('tell Fork in a sentence what is at home', async ({ browser }) => {
  const { mia } = await makeCouple(browser, contexts)
  await openBasket(mia, 'pantry')
  await mia.getByRole('button', { name: 'Tell Fork what is there' }).click()
  const sheet = mia.getByRole('dialog', { name: 'What is at home?' })
  await expect(sheet.getByRole('button', { name: 'Sort it' })).toBeDisabled()
  await sheet.getByLabel('Write or dictate it the way you would say it').fill('We still have 2 onions, half a kilo of flour and the milk is almost gone')
  await sheet.getByRole('button', { name: 'Sort it' }).click()
  await expect(sheet.getByText('This is what Fork understood')).toBeVisible()
  await expect(sheet.getByTestId('told-line')).toHaveText(['Onions2', 'Flourhalf a kilo', 'Milkalmost gone'])

  // He got one wrong? Take it out before it lands in the pantry.
  await sheet.getByRole('button', { name: 'Not needed: Onions' }).click()
  await sheet.getByRole('button', { name: 'Put it into the pantry' }).click()
  await expect(toast(mia, '2 noted')).toBeVisible()
  await expect(pantryRows(mia)).toHaveText(['Flourhalf a kiloNoted today', 'Milkalmost goneNoted today'])

  await test.step('without the helper it says what works instead', async () => {
    await setHelper(mia, 'key=')
    await mia.getByRole('button', { name: 'Tell Fork what is there' }).click()
    await sheet.getByLabel('Write or dictate it the way you would say it').fill('6 eggs')
    await sheet.getByRole('button', { name: 'Sort it' }).click()
    await expect(sheet.getByTestId('tell-problem')).toHaveText('The AI helper is not set up for this kitchen yet. Add one thing at a time.')
    // What was typed is still there.
    await expect(sheet.getByLabel('Write or dictate it the way you would say it')).toHaveValue('6 eggs')
  })
})

test('a kitchen whose cloud has not been updated keeps the basket on the phone until it has', async ({ browser }) => {
  test.setTimeout(120_000)
  const { leo, mia } = await makeCouple(browser, contexts)
  await mia.request.post('/__cloud/later-tables?there=false')
  await openBasket(mia)
  await addLine(mia, 'Add to the basket', 'Milk')
  await expect(rows(mia)).toHaveText(['Milk'])
  const k = await kit(mia)
  await k.evaluate((app) => app.sync.sync())
  await expect(mia.getByTestId('later-note')).toHaveText('Saved on this phone. Your partner sees the basket and the pantry once the kitchen has been updated.')
  // Nothing was refused, and nothing is reported as stuck.
  expect(await k.evaluate(async (app) => [await app.db.deadLetters.count(), app.sync.status.state, app.sync.status.later])).toEqual([0, 'idle', 1])

  await mia.request.post('/__cloud/later-tables?there=true')
  await expect(async () => {
    await k.evaluate((app) => app.sync.sync())
    await expect(mia.getByTestId('later-note')).toHaveCount(0, { timeout: 500 })
  }).toPass({ timeout: 20_000 })
  // What waited goes out with the next pass.
  await settle(mia)
  await openBasket(leo)
  await pullUntil(leo, () => expect(rows(leo)).toHaveText(['Milk'], { timeout: 500 }))
})

test('Korb und Vorrat auf Deutsch, in der Demo-Küche', async ({ page }) => {
  await useDemo(page, { lang: 'de' })
  await page.goto('/#/')
  await expect(page.getByTestId('basket-button')).toHaveAccessibleName('Korb, 3 Sachen einzukaufen')
  await page.getByTestId('basket-button').click()
  await expect(page.getByRole('heading', { level: 1, name: 'Korb' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Einkaufen' })).toBeVisible()
  await expect(rows(page)).toHaveText(['Butter', 'Eier6', 'Milch1 l'])
  await expect(boughtRows(page)).toHaveText(['Brot'])

  await page.getByLabel('In den Korb legen').fill('Rahm 2 dl')
  await page.getByLabel('In den Korb legen').press('Enter')
  await expect(rows(page).first()).toHaveText('Rahm2 dl')

  await page.getByRole('button', { name: 'Plan prüfen' }).click()
  await expect(outcome(page)).toContainText('In der Demo-Küche vergleicht Fork nur die Namen.')
  await expect(page.getByRole('heading', { name: /^Fork schlägt \d+ Sachen vor$/ })).toBeVisible()
  await expect(suggestions(page)).toHaveCount(8)
  await page.getByRole('button', { name: /^Alle \d+ zeigen$/ }).click()
  expect(await suggestions(page).count()).toBeGreaterThan(8)

  await page.getByRole('radio', { name: 'Vorrat' }).click()
  await expect(page.getByRole('heading', { name: '5 Sachen im Haus' })).toBeVisible()
  await expect(pantryRows(page).first()).toHaveText('Mehl1 kgVor 6 Tagen notiert')
  await page.getByRole('button', { name: 'Fork sagen, was da ist' }).click()
  const sheet = page.getByRole('dialog', { name: 'Was ist im Haus?' })
  await sheet.getByLabel('Schreib oder diktiere es so, wie du es sagen würdest').fill('2 Zwiebeln')
  await sheet.getByRole('button', { name: 'Sortieren' }).click()
  await expect(sheet.getByTestId('tell-problem')).toHaveText('In der Demo-Küche kann Fork keine Sätze lesen. Füge eine Sache nach der anderen hinzu.')
})
