import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { kit, tabs, toast, useDemo } from './ship.helpers'

// "Ask Fork": one phone in a kitchen in the pretend cloud, talking with the kitchen
// assistant. The cloud runs the real helper function; behind it the stand-in for the AI
// answers a handful of questions by their words (src/data/fake/pretendWeb.ts). Nothing
// here leaves the machine.

const MIA = { name: 'Mia', pin: '271828', kitchen: 'Casa Mia' }

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' })
const today = () => dayFormat.format(new Date())
function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

/** One person opens a kitchen and lands on Today. */
async function openKitchen(browser: Browser, contexts: BrowserContext[]): Promise<Page> {
  const context = await browser.newContext()
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
  await page.goto('/#/')
  await expect(tabs(page)).toBeVisible()
  return page
}

const addDish = async (page: Page, dish: Record<string, unknown>): Promise<string> => {
  const k = await kit(page)
  return k.evaluate(async (app, input) => (await app.actions.createDish(input)).id as string, dish)
}
const servings = async (page: Page) => {
  const k = await kit(page)
  return k.evaluate(async (app) => (await app.db.servings.toArray()).filter((row: { deletedAt: string | null }) => !row.deletedAt))
}

const said = (page: Page, who: 'me' | 'fork') => page.getByTestId(`said-${who}`)
const offers = (page: Page) => page.getByTestId('offers').last()
const trouble = (page: Page) => page.getByTestId('fork-problem')

async function ask(page: Page, question: string): Promise<void> {
  await page.getByLabel('Your question').fill(question)
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
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

test('ask Fork from Today: an answer in a talk that is kept, and wiped when asked', async ({ browser }) => {
  const page = await openKitchen(browser, contexts)

  await test.step('Fork sits next to the basket and the bell, and says what he is', async () => {
    await page.getByRole('button', { name: 'Ask Fork, the kitchen assistant' }).click()
    await expect(page).toHaveURL(/#\/fork$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Ask Fork' })).toBeVisible()
    await expect(page.getByText('I am Fork. Ask me about cooking, about your kitchen, or about this app.')).toBeVisible()
    await expect(page.getByText('Fork gets help from an AI (Claude).')).toContainText('No names, no notes, no photos. Nothing changes unless you tap a button.')
    // Nothing to send yet, nothing to wipe yet.
    await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Start over' })).toHaveCount(0)
  })

  await test.step('an idea is one tap: the question and the answer stand in the talk', async () => {
    await page.getByRole('button', { name: 'How long does an egg take?' }).click()
    await expect(said(page, 'fork')).toHaveText('Fork: An egg from the fridge: 6 minutes for soft, 8 for jammy, 10 for hard, counted from boiling water.')
    await expect(said(page, 'me')).toHaveText('You: How long does an egg take?')
    // A plain question gets a plain answer: no buttons.
    await expect(page.getByTestId('offers')).toHaveCount(0)
    await expect(page.getByText('For example')).toHaveCount(0)
  })

  await test.step('a typed question follows, and Fork knows the talk goes on', async () => {
    await ask(page, 'And what is in my kitchen?')
    await expect(said(page, 'fork')).toHaveCount(2)
    await expect(said(page, 'fork').last()).toContainText('In the recipe book: 0 dishes. Planned: 0 meals. We have been talking for a bit.')
    await expect(page.getByLabel('Your question')).toHaveValue('')
  })

  await test.step('the talk is still there after leaving and coming back', async () => {
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(tabs(page)).toBeVisible()
    await page.reload()
    await tabs(page).getByRole('button', { name: 'Add something' }).click()
    await page.getByRole('dialog', { name: 'What are we adding?' }).getByRole('button', { name: /^Ask Fork/ }).click()
    await expect(said(page, 'me')).toHaveText(['You: How long does an egg take?', 'You: And what is in my kitchen?'])
    await expect(said(page, 'fork')).toHaveCount(2)
  })

  await test.step('"Start over" asks first, then wipes the talk from this phone', async () => {
    await page.locator('header').getByRole('button', { name: 'Start over' }).click()
    const sheet = page.getByRole('dialog', { name: 'Start over?' })
    await expect(sheet).toContainText('The talk is wiped from this phone. Your kitchen stays as it is.')
    await sheet.getByRole('button', { name: 'Cancel' }).click()
    await expect(said(page, 'fork')).toHaveCount(2)
    await page.locator('header').getByRole('button', { name: 'Start over' }).click()
    await page.getByRole('dialog', { name: 'Start over?' }).getByRole('button', { name: 'Start over' }).click()
    await expect(toast(page, 'Started over')).toBeVisible()
    await expect(page.getByTestId('talk')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'How long does an egg take?' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Ask Fork' })).toBeVisible()
    await expect(page.getByTestId('talk')).toHaveCount(0)
  })
})

test('Fork knows the kitchen: he offers, a tap does it', async ({ browser }) => {
  const page = await openKitchen(browser, contexts)
  const roesti = await addDish(page, { name: 'Rösti' })
  await addDish(page, { name: 'Rüeblisuppe', recipe: { servings: 4, ingredients: [{ quantity: 500, unit: 'g', name: 'Rüebli' }, { quantity: 1, unit: 'dl', name: 'Rahm' }, { name: 'Zwiebel', quantity: 1 }], steps: [{ text: 'Alles weich kochen und pürieren.' }] } })
  const tomorrow = addDays(today(), 1)
  await page.goto('/#/fork')

  await test.step('planning: the button says what it will do, and nothing happens before the tap', async () => {
    await ask(page, 'Plan Rösti for tomorrow')
    await expect(said(page, 'fork')).toContainText('I can put Rösti on')
    const button = offers(page).getByRole('button', { name: 'Plan Rösti for tomorrow, dinner' })
    await expect(button).toBeVisible()
    expect(await servings(page)).toHaveLength(0)
    await button.click()
    await expect(toast(page, 'Planned for tomorrow, dinner')).toBeVisible()
    await expect(offers(page).getByTestId('offer-done')).toHaveText('Planned for tomorrow, dinner')
    await expect(button).toHaveCount(0)
    expect(await servings(page)).toMatchObject([{ dishId: roesti, status: 'planned', plannedDate: tomorrow, plannedSlot: 'dinner' }])
  })

  await test.step('what was done stays done in the talk', async () => {
    await page.reload()
    await expect(page.getByTestId('offer-done')).toHaveText('Planned for tomorrow, dinner')
    await expect(page.getByRole('button', { name: /^Plan Rösti/ })).toHaveCount(0)
  })

  await test.step('a dish he is asked about by name: its recipe goes along at once', async () => {
    const asked: string[] = []
    page.on('request', (request) => request.url().includes('/__cloud/helper') && request.method() === 'POST' && !request.url().includes('setup') && asked.push(request.postData() ?? ''))
    await ask(page, 'What is in the Rüeblisuppe?')
    await expect(said(page, 'fork').last()).toHaveText('Fork: Rüeblisuppe takes: 500 g Rüebli, 1 dl Rahm, 1 Zwiebel.')
    await offers(page).getByRole('button', { name: 'Open Rüeblisuppe' }).click()
    await expect(page.getByTestId('dish-name')).toHaveText('Rüeblisuppe')
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Ask Fork' })).toBeVisible()
    expect(asked).toHaveLength(1)
    // What goes along is the kitchen in lines: the plan is in it, a name of a person is not.
    const sent = JSON.parse(asked[0])
    expect(sent.kitchen.plan).toEqual([expect.stringMatching(/^\d{4}-\d{2}-\d{2} \(\w+\), dinner: D1 Rösti, you cook$/)])
    expect(sent.recipes).toHaveLength(1)
    expect(asked[0]).not.toContain(MIA.name)

    await test.step('a dish he has to work out himself: he asks for the recipe, the app sends it, he answers', async () => {
      asked.length = 0
      await ask(page, 'How many calories does the first dish in my book have?')
      // Rösti has no ingredients written down: he says so instead of guessing.
      await expect(said(page, 'fork').last()).toHaveText('Fork: Too few amounts are written down for Rösti to estimate that.')
      expect(asked).toHaveLength(2)
      expect(JSON.parse(asked[0]).recipes).toEqual([])
      expect(JSON.parse(asked[1]).recipes).toEqual([expect.stringMatching(/^D1 \| Rösti \| 0 servings\n/)])
    })
  })

  await test.step('things for the basket, listed before the tap', async () => {
    await ask(page, 'Put 500 g Rüebli, Rahm and 2 Zwiebeln on the basket')
    await expect(offers(page)).toContainText('Rüebli 500 g, Rahm, Zwiebeln 2')
    await offers(page).getByRole('button', { name: 'Put 3 things on the basket' }).click()
    await expect(offers(page).getByTestId('offer-done')).toHaveText('3 things are on the basket')
    const k = await kit(page)
    expect(await k.evaluate(async (app) => (await app.db.basket.toArray()).map((row: { name: string; amount: string | null; state: string }) => `${row.name}/${row.amount}/${row.state}`).sort())).toEqual(['Rahm/null/open', 'Rüebli/500 g/open', 'Zwiebeln/2/open'])
  })

  await test.step('what was bought, noted in the pantry', async () => {
    await ask(page, 'I bought 1 kg Mehl and Eier')
    await offers(page).getByRole('button', { name: 'Note 2 things in the pantry' }).click()
    await expect(offers(page).getByTestId('offer-done')).toHaveText('Noted in the pantry')
    const k = await kit(page)
    expect(await k.evaluate(async (app) => (await app.db.pantry.toArray()).map((row: { name: string; amount: string | null }) => `${row.name}/${row.amount}`).sort())).toEqual(['Eier/null', 'Mehl/1 kg'])
  })

  await test.step('a wish for the dish is the meal that gets its day: no second one', async () => {
    const k = await kit(page)
    const soup = await k.evaluate(async (app) => (await app.db.dishes.toArray()).find((dish: { name: string }) => dish.name === 'Rüeblisuppe').id as string)
    const wish = await k.evaluate(async (app, dishId) => (await app.actions.proposeServing({ dishId })).id as string, soup)
    await ask(page, 'Plan Rüeblisuppe for today lunch')
    await offers(page).getByRole('button', { name: 'Plan Rüeblisuppe for today, lunch' }).click()
    await expect(offers(page).getByTestId('offer-done')).toHaveText('Planned for today, lunch')
    const soups = (await servings(page)).filter((row: { dishId: string }) => row.dishId === soup)
    expect(soups).toMatchObject([{ id: wish, status: 'planned', plannedDate: today(), plannedSlot: 'lunch' }])
  })
})

test('a recipe from the talk goes into the dish form, and a "how do I" gets a way there', async ({ browser }) => {
  const page = await openKitchen(browser, contexts)
  await page.goto('/#/fork')

  await test.step('Fork writes a recipe out, with a button under it', async () => {
    await page.getByRole('button', { name: 'Give me a recipe for carbonara' }).click()
    await expect(said(page, 'fork')).toContainText('Carbonara, for 2 servings')
    await expect(said(page, 'fork')).toContainText('- 200 g spaghetti')
    await offers(page).getByRole('button', { name: 'Put it in the recipe book' }).click()
  })

  await test.step('the dish form opens filled in, to look over: nothing is saved yet', async () => {
    await expect(page.getByRole('heading', { level: 1, name: 'New dish' })).toBeVisible()
    await expect(page.getByTestId('read-note')).toContainText('Read from Fork')
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Carbonara')
    await expect(page.getByTestId('ingredient-row')).toHaveCount(4)
    const steps = page.getByTestId('step').getByRole('textbox', { name: /^Step \d+$/ })
    await expect(steps).toHaveCount(3)
    await expect(steps.first()).toHaveValue('Boil the spaghetti in salted water for 9 minutes.')
    await expect(steps.last()).toHaveValue('Drain the spaghetti and toss with the egg mixture right away.')
    const k = await kit(page)
    expect(await k.evaluate(async (app) => (await app.db.dishes.toArray()).length)).toBe(0)
    await page.getByRole('button', { name: 'Save dish' }).click()
    await expect(page.getByTestId('dish-name')).toHaveText('Carbonara')
  })

  await test.step('now it is in the book, and Fork can plan it', async () => {
    await page.goto('/#/fork')
    await ask(page, 'Plan Carbonara for today')
    await expect(offers(page).getByRole('button', { name: 'Plan Carbonara for today, dinner' })).toBeVisible()
  })

  await test.step('"how do I": the answer names the buttons, and one tap leads there', async () => {
    await ask(page, 'How do I add a recipe from Pinterest?')
    await expect(said(page, 'fork').last()).toContainText('Tap the plus, then "A recipe from a link".')
    await offers(page).getByRole('button', { name: 'Open "A recipe from a link"' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Recipe from a link' })).toBeVisible()
  })
})

test('when Fork cannot answer he says why, and the question is not lost', async ({ browser }) => {
  const page = await openKitchen(browser, contexts)
  await page.goto('/#/fork')

  await test.step('no key yet: said in plain words, with nothing to try again', async () => {
    await setHelper(page, 'key=')
    await ask(page, 'How long does an egg take?')
    await expect(trouble(page)).toContainText('Fork has no AI to ask yet. Whoever runs the kitchen sets it up once: a key for the helper, in the cloud.')
    await expect(trouble(page)).toContainText('How long does an egg take?')
    await expect(trouble(page).getByRole('button', { name: 'Ask again' })).toHaveCount(0)
    // A question without an answer is not part of the talk.
    await expect(page.getByTestId('talk')).toHaveCount(0)
  })

  await test.step('the AI is down: "Ask again" asks the same question once it is back', async () => {
    await setHelper(page, 'key=pretend-key&down=true')
    await ask(page, 'How long does an egg take?')
    await expect(trouble(page)).toContainText('The AI is not answering right now. Ask again in a moment.')
    await setHelper(page, 'down=false')
    await trouble(page).getByRole('button', { name: 'Ask again' }).click()
    await expect(said(page, 'fork')).toContainText('6 minutes for soft')
    await expect(trouble(page)).toHaveCount(0)
  })

  await test.step('offline: he needs the internet, and says so', async () => {
    await page.context().setOffline(true)
    await ask(page, 'And a duck egg?')
    await expect(trouble(page)).toContainText('No connection. Fork needs the internet to answer.')
    await page.context().setOffline(false)
    await trouble(page).getByRole('button', { name: 'Ask again' }).click()
    await expect(said(page, 'me').last()).toHaveText('You: And a duck egg?')
    await expect(said(page, 'fork')).toHaveCount(2)
  })

  await test.step('the last questions of the day are counted down, then it is enough for today', async () => {
    await setHelper(page, 'used=37')
    await ask(page, 'How long does an egg take?')
    await expect(page.getByText('Fork can be asked 2 more times today.')).toBeVisible()
    await setHelper(page, 'used=40')
    await ask(page, 'How long does an egg take?')
    await expect(trouble(page)).toContainText('Fork has been asked often enough for today. Tomorrow there is room again.')
    await expect(trouble(page).getByRole('button', { name: 'Ask again' })).toHaveCount(0)
  })
})

test('auf Deutsch: Fork antwortet deutsch und plant mit einem Tipp', async ({ browser }) => {
  const page = await openKitchen(browser, contexts)
  await addDish(page, { name: 'Älplermagronen' })
  await page.goto('/#/settings')
  await page.getByRole('radio', { name: 'Deutsch' }).click()
  await page.goto('/#/fork')
  await expect(page.getByRole('heading', { level: 1, name: 'Fork fragen' })).toBeVisible()
  await expect(page.getByText('Ich bin Fork. Frag mich etwas zum Kochen, zu eurer Küche oder zu dieser App.')).toBeVisible()
  await page.getByRole('button', { name: 'Wie lange braucht ein Ei?' }).click()
  await expect(said(page, 'fork')).toHaveText('Fork: Ein Ei aus dem Kühlschrank: 6 Minuten für weich, 8 für wachsweich, 10 für hart, ab kochendem Wasser.')
  await expect(said(page, 'me')).toHaveText('Du: Wie lange braucht ein Ei?')

  await page.getByLabel('Deine Frage').fill('Bitte Älplermagronen einplanen für heute zum Mittag')
  await page.getByRole('button', { name: 'Fragen', exact: true }).click()
  await offers(page).getByRole('button', { name: 'Älplermagronen einplanen für heute, Mittagessen' }).click()
  await expect(offers(page).getByTestId('offer-done')).toHaveText('Geplant für heute, Mittagessen')
  expect(await servings(page)).toMatchObject([{ status: 'planned', plannedDate: today(), plannedSlot: 'lunch' }])
})

test('the demo kitchen says that Fork cannot answer there', async ({ page }) => {
  await useDemo(page)
  await page.goto('/#/fork')
  await expect(page.getByRole('heading', { level: 1, name: 'Ask Fork' })).toBeVisible()
  await page.getByRole('button', { name: 'How long does an egg take?' }).click()
  await expect(trouble(page)).toContainText('Fork cannot answer in the demo kitchen. Leave the demo and ask in your own kitchen.')
  await expect(trouble(page).getByRole('button', { name: 'Ask again' })).toHaveCount(0)
})
