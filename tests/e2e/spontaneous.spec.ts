import { expect, test, type Page } from '@playwright/test'

// Plans change. These are the short ways for a meal nobody planned ahead: picked for
// today from the plus button, served early, cooked by the other one after all, skipped
// from the table, or taken out again because it was logged by mistake.
// Demo kitchen, one phone: Mia is the Chef, Leo is the Taster. Nothing touches a cloud.

type Kit = { db: any; actions: any }
declare global {
  interface Window {
    __foodwishus: Kit
  }
}

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' })
const today = () => dayFormat.format(new Date())

function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

interface People {
  mia: string
  leo: string
}

/** Open the demo kitchen with its two people and nothing else, as Leo. */
async function openKitchen(page: Page, lang: 'en' | 'de' = 'en'): Promise<People> {
  await page.addInitScript((language) => {
    localStorage.setItem('foodwishus.prefs', '{"demoData":true,"demoEmpty":true}')
    localStorage.setItem('foodwishus.lang', language)
  }, lang)
  await page.goto('/#/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Leo')
  await page.waitForFunction(() => Boolean(window.__foodwishus))
  return page.evaluate(async () => {
    const { db } = window.__foodwishus
    const leo: string = await db.getMeta('me.memberId')
    const members: { id: string; name: string }[] = await db.members.toArray()
    return { leo, mia: members.find((m) => m.id !== leo)!.id }
  })
}

/** Hand the phone to the other person (the demo database only knows who "me" is). */
async function become(page: Page, memberId: string, name: string): Promise<void> {
  await page.evaluate((id) => window.__foodwishus.db.setMeta('me.memberId', id), memberId)
  await page.goto('/#/')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
  await page.waitForFunction(() => Boolean(window.__foodwishus))
}

const act = (page: Page, action: string, ...args: unknown[]) => page.evaluate(([name, list]) => window.__foodwishus.actions[name as string](...(list as unknown[])), [action, args] as const)
const addDish = async (page: Page, name: string, extra: Record<string, unknown> = {}): Promise<string> => ((await act(page, 'createDish', { name, ...extra })) as { id: string }).id
const propose = async (page: Page, input: Record<string, unknown>): Promise<string> => ((await act(page, 'proposeServing', input)) as { id: string }).id
const serving = (page: Page, id: string) => page.evaluate((servingId) => window.__foodwishus.db.servings.get(servingId), id)
const servings = (page: Page): Promise<any[]> => page.evaluate(async () => (await window.__foodwishus.db.servings.toArray()).filter((s: { deletedAt: string | null }) => !s.deletedAt))
const toast = (page: Page, text: string | RegExp) => page.getByRole('status').filter({ hasText: text }).last()
const sheet = (page: Page) => page.getByRole('dialog')
const status = (page: Page) => page.getByTestId('serving-status')

/** A photo of the plate, a face and "Hand in", all through the app's own actions. */
async function eat(page: Page, servingId: string, reaction = 5): Promise<void> {
  await page.evaluate(
    async ([id, face]) => {
      const { actions } = window.__foodwishus
      const canvas = document.createElement('canvas')
      canvas.width = 320
      canvas.height = 240
      canvas.getContext('2d')!.fillRect(0, 0, 320, 240)
      const blob: Blob = await new Promise((done) => canvas.toBlob((b) => done(b as Blob), 'image/jpeg', 0.8))
      await actions.addProofPhoto(id, { image: { full: blob, thumb: blob, width: 320, height: 240 }, source: 'camera' })
      await actions.reactToMeal(id, face)
      await actions.finishMeal(id)
    },
    [servingId, reaction] as const,
  )
}

// ------------------------------------------------------- a meal for today --

test.describe('a meal for today', () => {
  test('the cook picks a dish behind the plus button, lands on the meal and serves it', async ({ page }) => {
    const people = await openKitchen(page)
    await addDish(page, 'Rösti')
    await addDish(page, 'Fondue')
    await become(page, people.mia, 'Mia')

    await page.getByRole('button', { name: 'Add something' }).click()
    await sheet(page).getByRole('button', { name: /A meal for today/ }).click()
    await expect(sheet(page).getByRole('heading', { name: 'What shall it be?' })).toBeVisible()
    await expect(sheet(page).getByTestId('pick-when')).toHaveText('Today')
    // The meal of the day is a guess that can be corrected with one tap.
    await sheet(page).getByRole('button', { name: 'Lunch', exact: true }).click()
    await expect(sheet(page).getByText('From the recipe book')).toBeVisible()
    await sheet(page).getByTestId('book-option').filter({ hasText: 'Rösti' }).click()

    await expect(toast(page, 'Planned for today, lunch')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Rösti' })).toBeVisible()
    await expect(status(page)).toHaveText('Planned for today, lunch')
    await expect(page.getByText('Your idea, and you cook. Leo gets to eat.')).toBeVisible()

    await page.getByRole('button', { name: 'Served', exact: true }).click()
    await expect(status(page)).toHaveText('On the table. Waiting for proof.')
    const [meal] = await servings(page)
    expect(meal).toMatchObject({ status: 'served', plannedDate: today(), plannedSlot: 'lunch', cookedBy: people.mia, proposedBy: people.mia })

    // Two sheets were opened on the way here. The phone's back button goes to Today,
    // not back into a sheet, and the app still moves on after that.
    await page.goBack()
    await expect(page.getByTestId('served-card')).toBeVisible()
    await expect(sheet(page)).toHaveCount(0)
    await page.getByRole('navigation', { name: /^(Main|Hauptnavigation)$/ }).getByRole('button', { name: 'Wishlist' }).click()
    await expect(page).toHaveURL(/#\/wishlist$/)

    // His phone: proof, please.
    await become(page, people.leo, 'Leo')
    await expect(page.getByTestId('served-card')).toContainText('Rösti is on the table. Proof, please.')
  })

  test('a name nobody knows yet becomes a dish and a meal with one tap; the Taster can prove it right away', async ({ page }) => {
    const people = await openKitchen(page)
    await addDish(page, 'Rösti')

    // The empty table on Today offers the same choice.
    await expect(page.getByTestId('today-empty')).toBeVisible()
    await page.getByRole('button', { name: "Pick today's meal" }).click()
    await sheet(page).getByRole('searchbox', { name: 'Search' }).fill('  ramen   with egg ')
    await expect(sheet(page).getByText('Nothing called "ramen with egg" yet.')).toBeVisible()
    await sheet(page).getByRole('button', { name: 'Dinner', exact: true }).click()
    await sheet(page).getByRole('button', { name: 'Add "ramen with egg" as a new dish' }).click()

    await expect(toast(page, 'Planned for today, dinner')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'ramen with egg' })).toBeVisible()
    // Leo is the Taster of the two, so Mia cooks unless told otherwise.
    await expect(page.getByText('Your wish. Mia cooks, you eat.')).toBeVisible()
    const [meal] = await servings(page)
    expect(meal).toMatchObject({ status: 'planned', plannedDate: today(), plannedSlot: 'dinner', cookedBy: people.mia, proposedBy: people.leo })

    // It is in the recipe book now, and not offered a second time.
    await page.getByRole('button', { name: 'Already on the table? Take the proof photo' }).click()
    await expect(page.getByText('Not marked as served yet. No problem: your photo says it all.')).toBeVisible()
    await page.goto('/#/recipes')
    await expect(page.getByTestId('dish-card').filter({ hasText: 'ramen with egg' })).toBeVisible()
  })

  test('a known name is found, not made twice; an empty recipe book says what to do', async ({ page }) => {
    await openKitchen(page)
    await page.getByRole('button', { name: "Pick today's meal" }).click()
    await expect(sheet(page).getByText('The recipe book is still empty')).toBeVisible()
    await sheet(page).getByRole('button', { name: 'Add the first dish' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'New dish' })).toBeVisible()

    await addDish(page, 'Älplermagronen')
    await page.goto('/#/')
    await page.getByRole('button', { name: "Pick today's meal" }).click()
    await sheet(page).getByRole('searchbox', { name: 'Search' }).fill('alplermagronen')
    await expect(sheet(page).getByTestId('book-option')).toHaveCount(1)
    await expect(sheet(page).getByRole('button', { name: /as a new dish/ })).toHaveCount(0)
    await sheet(page).getByRole('searchbox', { name: 'Search' }).fill('alpler')
    await expect(sheet(page).getByRole('button', { name: 'Add "alpler" as a new dish' })).toBeVisible()
    await sheet(page).getByRole('button', { name: 'Clear search' }).click()
    await expect(sheet(page).getByRole('button', { name: /as a new dish/ })).toHaveCount(0)
  })
})

// ------------------------------------------------------------- our week --

test('an empty slot in Our Week takes a wish, a meal planned for another day, or anything from the recipe book', async ({ page }) => {
  const people = await openKitchen(page)
  const tomorrow = addDays(today(), 1)
  const rösti = await addDish(page, 'Rösti')
  await addDish(page, 'Fondue')
  await addDish(page, 'Zopf')
  await act(page, 'createMenu', { name: 'Brunch', courses: [{ dishId: rösti, order: 0 }] })
  await propose(page, { dishId: rösti, cookedBy: people.mia })
  const pizza = await propose(page, { dishId: await addDish(page, 'Pizza'), cookedBy: people.mia, plan: { date: tomorrow, slot: 'dinner' } })

  await page.goto('/#/week')
  const day = page.locator(`[data-testid="day"][data-day="${today()}"]`)
  await day.locator('[data-slot=lunch]').click()
  await expect(sheet(page).getByTestId('pick-when')).toHaveText('Today, lunch')

  // What is on its way already comes first, each once: the wish, and tomorrow's pizza.
  await expect(sheet(page).getByTestId('wish-option')).toHaveText([/Rösti/, /Pizza.*Planned for tomorrow, dinner/])
  // The rest of the recipe book: menus, then dishes by name. Rösti and Pizza are not repeated.
  await expect(sheet(page).getByTestId('book-option')).toHaveText([/Brunch.*Menu with 1 course/, /Fondue/, /Zopf/])

  await sheet(page).getByTestId('book-option').filter({ hasText: 'Fondue' }).click()
  await expect(toast(page, 'Planned for today, lunch')).toBeVisible()
  await expect(day.getByTestId('week-meal')).toHaveText(/Lunch.*Fondue/)

  // Tomorrow's pizza moves to tonight.
  await day.locator('[data-slot=dinner]').click()
  await sheet(page).getByTestId('wish-option').filter({ hasText: 'Pizza' }).click()
  await expect(toast(page, 'Moved to today, dinner')).toBeVisible()
  expect(await serving(page, pizza)).toMatchObject({ status: 'planned', plannedDate: today(), plannedSlot: 'dinner' })
  await expect(day.getByTestId('week-meal')).toHaveCount(2)
})

// ------------------------------------------------------------ on the meal --

test.describe('plans change on the meal page', () => {
  test('the cook serves a meal that was planned for another day, and one that was only a wish', async ({ page }) => {
    const people = await openKitchen(page)
    const pizza = await propose(page, { dishId: await addDish(page, 'Pizza'), cookedBy: people.mia, plan: { date: addDays(today(), 2), slot: 'dinner' } })
    const soup = await propose(page, { dishId: await addDish(page, 'Soup'), cookedBy: people.mia })

    // The Taster has no "Served", only the quiet way to the camera.
    await page.goto(`/#/serving/${pizza}`)
    await expect(page.getByRole('button', { name: 'Serve it now' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Already on the table? Take the proof photo' })).toBeVisible()

    await become(page, people.mia, 'Mia')
    await page.goto(`/#/serving/${pizza}`)
    await expect(page.getByText('Plans changed? Tap when it is on the table.')).toBeVisible()
    await page.getByRole('button', { name: 'Serve it now' }).click()
    await expect(toast(page, 'Served')).toBeVisible()
    await expect(status(page)).toHaveText('On the table. Waiting for proof.')
    await expect(page.getByRole('button', { name: 'Serve it now' })).toHaveCount(0)

    await page.goto(`/#/serving/${soup}`)
    await page.getByRole('button', { name: 'Serve it now' }).click()
    await expect(status(page)).toHaveText('On the table. Waiting for proof.')
    expect(await serving(page, soup)).toMatchObject({ status: 'served', plannedDate: null })

    // Both count for today: on Today and in the calendar.
    await page.goto('/#/')
    await expect(page.getByTestId('served-card')).toHaveCount(2)
    await page.goto('/#/week')
    await expect(page.locator(`[data-testid="day"][data-day="${today()}"]`).getByTestId('week-meal')).toHaveCount(2)

    // A mis-tap on the wish: it is not on the table yet. It stays a meal for today.
    await page.goto(`/#/serving/${soup}`)
    await page.getByRole('button', { name: 'Undo served' }).click()
    await expect(status(page)).toHaveText('Planned for today, dinner')
  })

  test('the other one cooks after all: the roles swap and the hearts start over', async ({ page }) => {
    const people = await openKitchen(page)
    const id = await propose(page, { dishId: await addDish(page, 'Pizza'), cookedBy: people.mia })
    await act(page, 'setCraving', id, 5)

    await page.goto(`/#/serving/${id}`)
    await expect(page.getByText('Your wish. Mia cooks, you eat.')).toBeVisible()
    await page.getByRole('button', { name: 'Change who cooks' }).click()
    await page.getByRole('radiogroup', { name: 'Who cooks?' }).getByRole('radio', { name: 'Me' }).click()
    await expect(toast(page, 'Saved')).toBeVisible()
    await expect(page.getByText('Your idea, and you cook. Mia gets to eat.')).toBeVisible()
    // His five hearts were the eater's. Now she eats, and has not said yet.
    await expect(page.getByText('Mia has not given hearts yet')).toBeVisible()
    expect(await serving(page, id)).toMatchObject({ cookedBy: people.leo, craving: null })
    // And now he is the one who can serve it.
    await expect(page.getByRole('button', { name: 'Serve it now' })).toBeVisible()

    // Once a verdict has been started, the roles stay.
    await act(page, 'setCook', id, people.mia)
    await act(page, 'reactToMeal', id, 5)
    await expect(page.getByText('Your wish. Mia cooks, you eat.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Change who cooks' })).toHaveCount(0)
  })

  test('a meal on the table can still be skipped by either of them, and comes back clean', async ({ page }) => {
    const people = await openKitchen(page)
    const id = await propose(page, { dishId: await addDish(page, 'Soufflé'), cookedBy: people.mia, plan: { date: today(), slot: 'dinner' } })
    await act(page, 'markServed', id)

    await page.goto(`/#/serving/${id}`)
    await expect(status(page)).toHaveText('On the table. Your proof is needed.')
    await page.getByRole('button', { name: 'Skip this one' }).click()
    await sheet(page).getByRole('button', { name: 'Something else' }).click()
    await sheet(page).getByLabel('What happened?').fill('It collapsed')
    await sheet(page).getByRole('button', { name: 'Skip it' }).click()
    await expect(toast(page, 'Skipped')).toBeVisible()
    expect(await serving(page, id)).toMatchObject({ status: 'skipped', skippedReason: 'It collapsed' })

    await page.goto('/#/')
    await expect(page.getByTestId('served-card')).toHaveCount(0)

    await page.goto(`/#/serving/${id}`)
    await page.getByRole('button', { name: 'Put back on the wishlist' }).click()
    await expect(status(page)).toContainText('On the wishlist since')
    expect(await serving(page, id)).toMatchObject({ status: 'wishlist', servedAt: null })
  })

  test('a meal logged by mistake can be removed while its verdict is still open, and not after the seal', async ({ page }) => {
    const people = await openKitchen(page)
    const wrong = await propose(page, { dishId: await addDish(page, 'Wrong dish'), cookedBy: people.mia, plan: { date: today(), slot: 'lunch' } })
    const old = await propose(page, { dishId: await addDish(page, 'Old favourite'), cookedBy: people.mia, plan: { date: today(), slot: 'dinner' } })
    await eat(page, wrong)
    await eat(page, old)
    // The second verdict was sealed long ago.
    await page.evaluate(async (servingId) => {
      const { db } = window.__foodwishus
      for (const review of await db.reviews.where('servingId').equals(servingId).toArray()) await db.reviews.put({ ...review, sealedAt: '2026-01-01T00:00:00.000Z' })
    }, old)

    await page.goto(`/#/serving/${old}`)
    await expect(page.getByTestId('sealed-note')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove this meal' })).toHaveCount(0)

    await page.goto(`/#/serving/${wrong}`)
    await page.getByRole('button', { name: 'Remove this meal' }).click()
    await expect(sheet(page).getByRole('heading', { name: 'Remove Wrong dish?' })).toBeVisible()
    await expect(sheet(page).getByText('The meal disappears on both phones, with its photos and the verdict. The recipe stays in the recipe book.')).toBeVisible()
    await sheet(page).getByRole('button', { name: 'Remove', exact: true }).click()
    await expect(toast(page, 'Removed')).toBeVisible()

    // Gone from Today, the photo wall and the numbers. The recipe is still there.
    await page.goto('/#/')
    await expect(page.getByTestId('eaten-today')).toContainText('Old favourite')
    await expect(page.getByTestId('eaten-today')).not.toContainText('Wrong dish')
    await expect(page.getByTestId('wall-link')).toContainText('1 proof photo')
    await expect(page.getByTestId('today-stats')).toHaveText(/1\s*meal this week/)
    await page.goto('/#/recipes')
    await expect(page.getByTestId('dish-card').filter({ hasText: 'Wrong dish' })).toBeVisible()
  })
})

// -------------------------------------------------------------- cook mode --

test('done cooking: "Served" is one tap away, and the Taster is asked for proof', async ({ page }) => {
  const people = await openKitchen(page)
  const steps = [{ text: 'Grate the potatoes.' }, { text: 'Fry until golden.' }]
  const rösti = await addDish(page, 'Rösti', { recipe: { steps } })
  const hisTurn = await addDish(page, 'Burger', { recipe: { steps } })
  await propose(page, { dishId: hisTurn, cookedBy: people.leo })
  await become(page, people.mia, 'Mia')

  await page.goto(`/#/recipes/${rösti}/cook`)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Finished', exact: true }).click()
  await expect(page.getByTestId('celebration')).toContainText('En Guete!')
  await expect(page.getByText('Tap when it is on the table. Leo will be asked for proof.')).toBeVisible()
  await page.getByRole('button', { name: 'Served', exact: true }).click()

  await expect(toast(page, 'Served')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Rösti' })).toBeVisible()
  await expect(status(page)).toHaveText('On the table. Waiting for proof.')
  const meal = (await servings(page)).find((s) => s.dishId === rösti)
  expect(meal).toMatchObject({ status: 'served', cookedBy: people.mia, proposedBy: people.mia })

  // The burger is on the list as something Leo cooks: serving that is his to tap.
  await page.goto(`/#/recipes/${hisTurn}/cook`)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Finished', exact: true }).click()
  await expect(page.getByTestId('celebration')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Served', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Back to the recipe' }).click()
  await expect(page.getByTestId('dish-name')).toHaveText('Burger')
})

// ----------------------------------------------------------------- German --

test('the short ways in German', async ({ page }) => {
  const people = await openKitchen(page, 'de')
  await addDish(page, 'Rösti')
  const pizza = await propose(page, { dishId: await addDish(page, 'Pizza'), cookedBy: people.mia, plan: { date: addDays(today(), 1), slot: 'dinner' } })

  await page.getByRole('button', { name: 'Etwas hinzufügen' }).click()
  await sheet(page).getByRole('button', { name: /Ein Essen für heute/ }).click()
  await expect(sheet(page).getByRole('heading', { name: 'Was soll es sein?' })).toBeVisible()
  await expect(sheet(page).getByRole('heading', { name: 'Von der Wunschliste' })).toBeVisible()
  await expect(sheet(page).getByRole('heading', { name: 'Aus dem Rezeptbuch' })).toBeVisible()
  await sheet(page).getByRole('searchbox', { name: 'Suchen' }).fill('Ramen')
  await expect(sheet(page).getByText('Noch nichts namens «Ramen».')).toBeVisible()
  await expect(sheet(page).getByRole('button', { name: '«Ramen» als neues Gericht anlegen' })).toBeVisible()
  await page.keyboard.press('Escape')

  await become(page, people.mia, 'Mia')
  await page.goto(`/#/serving/${pizza}`)
  await expect(page.getByText('Planänderung? Tippe, sobald es auf dem Tisch steht.')).toBeVisible()
  await page.getByRole('button', { name: 'Ändern, wer kocht' }).click()
  await expect(page.getByRole('radiogroup', { name: 'Wer kocht?' })).toBeVisible()
  await page.getByRole('button', { name: 'Jetzt servieren' }).click()
  await expect(toast(page, 'Serviert')).toBeVisible()
})
