import { expect, test, type Locator, type Page } from '@playwright/test'

// The meal nobody entered. Two ways to put that right, in the demo kitchen (Mia is the
// Chef, Leo is the Taster, and the phone changes hands):
//   - "Log a meal": behind the plus button, on the days that are over in Our Week, and on
//     a planned meal whose day slipped by. The meal lands on its own day and waits for proof.
//   - "Take a photo and rate": the camera first, then "What is on the plate?".
// Nothing touches a cloud, and the "camera" is a picture painted on a canvas.
//
// None of this may depend on the day or the hour the test runs: for today the meal of the
// day is always picked by hand, and a day in the calendar is looked for, not assumed.

type Kit = { db: any; actions: any }
declare global {
  interface Window {
    __foodwishus: Kit
  }
}

// ----------------------------------------------------------------- helpers --

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' })
const today = () => dayFormat.format(new Date())

function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

/** The moment at which clocks in Zurich show the given day and time ("19:00:00"). Right in summer and in winter. */
function zurichMoment(day: string, time: string): Date {
  const wall = Date.parse(`${day}T${time}Z`)
  const ahead = (at: number): number => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(at))
    const part = Object.fromEntries(parts.map((p) => [p.type, Number(p.value)]))
    return Date.UTC(part.year, part.month - 1, part.day, part.hour, part.minute, part.second) - Math.floor(at / 1000) * 1000
  }
  return new Date(wall - ahead(wall - ahead(wall)))
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
const addDish = async (page: Page, name: string): Promise<string> => ((await act(page, 'createDish', { name })) as { id: string }).id
const propose = async (page: Page, input: Record<string, unknown>): Promise<string> => ((await act(page, 'proposeServing', input)) as { id: string }).id
const serving = (page: Page, id: string) => page.evaluate((servingId) => window.__foodwishus.db.servings.get(servingId), id)
const servings = (page: Page): Promise<any[]> => page.evaluate(async () => (await window.__foodwishus.db.servings.toArray()).filter((s: { deletedAt: string | null }) => !s.deletedAt))
const toast = (page: Page, text: string | RegExp) => page.getByRole('status').filter({ hasText: text }).last()
const sheet = (page: Page) => page.getByRole('dialog')
const status = (page: Page) => page.getByTestId('serving-status')
const faces = (page: Page) => page.getByTestId('faces')
const handIn = (page: Page) => page.getByRole('button', { name: 'Hand in the verdict' })
const celebration = (page: Page) => page.getByTestId('celebration')

/** A photo of a plate, painted on a canvas: the bytes of a JPEG. */
async function plateJpeg(page: Page, width = 1200, height = 900): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ([w, h]) => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const c = canvas.getContext('2d')!
      c.fillStyle = '#f6d5dc'
      c.fillRect(0, 0, w, h)
      for (const [radius, fill] of [[0.42, '#fffdf9'], [0.3, '#f2cf7a'], [0.08, '#c8414b']] as const) {
        c.fillStyle = fill
        c.beginPath()
        c.arc(w / 2, h / 2, h * radius, 0, Math.PI * 2)
        c.fill()
      }
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.85))
      let text = ''
      for (const byte of new Uint8Array(await blob.arrayBuffer())) text += String.fromCharCode(byte)
      return btoa(text)
    },
    [width, height] as const,
  )
  return Buffer.from(base64, 'base64')
}

/** Press something that opens the camera, and hand over a file. */
async function shoot(page: Page, button: Locator, file: Buffer | { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
  const chooser = page.waitForEvent('filechooser')
  await button.click()
  await (await chooser).setFiles(Buffer.isBuffer(file) ? { name: 'plate.jpg', mimeType: 'image/jpeg', buffer: file } : file)
}

/** "Log a meal" behind the plus button. */
async function openLog(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add something' }).click()
  await sheet(page).getByRole('button', { name: /Log a meal/ }).click()
  await expect(sheet(page).getByRole('heading', { name: 'What was on the table?' })).toBeVisible()
}

/** "Take a photo and rate" behind the plus button, with a photo of a plate. */
async function shootPlate(page: Page, file?: Buffer | { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
  await page.getByRole('button', { name: 'Add something' }).click()
  await shoot(page, sheet(page).getByRole('button', { name: /Take a photo and rate/ }), file ?? (await plateJpeg(page)))
}

const days = (page: Page) => sheet(page).getByRole('group', { name: 'When was it?' })
const meals = (page: Page) => sheet(page).getByRole('group', { name: 'Meal' })
const cooks = (page: Page) => sheet(page).getByRole('radiogroup', { name: 'Who cooked?' })

/** Our Week, turned to the week that holds the given day (today, or one of the seven days before it). */
async function dayCard(page: Page, day: string): Promise<Locator> {
  await page.goto('/#/week')
  await expect(page.getByTestId('week')).toBeVisible()
  // The week remembers where it was looking: start from today's.
  const home = page.getByRole('button', { name: 'Jump to today' })
  if (await home.isEnabled()) await home.click()
  await expect(page.locator(`[data-testid="day"][data-day="${today()}"]`)).toBeVisible()
  const card = page.locator(`[data-testid="day"][data-day="${day}"]`)
  if ((await card.count()) === 0) await page.getByRole('button', { name: 'Previous week' }).click()
  await expect(card).toBeVisible()
  return card
}

// -------------------------------------------------------------- log a meal --

test.describe('log a meal', () => {
  test("the cook logs yesterday's dinner behind the plus button; the Taster proves it the day after, and it counts for yesterday", async ({ page }) => {
    const people = await openKitchen(page)
    await addDish(page, 'Lasagne')
    await addDish(page, 'Rösti')
    const yesterday = addDays(today(), -1)
    await become(page, people.mia, 'Mia')

    await openLog(page)
    // Today is the first guess, and two weeks back are one tap away, the newest first.
    await expect(days(page).getByRole('button')).toHaveCount(14)
    await expect(days(page).getByRole('button').first()).toHaveAttribute('data-day', today())
    await expect(days(page).getByRole('button').first()).toHaveAttribute('aria-pressed', 'true')
    await expect(days(page).getByRole('button').last()).toHaveAttribute('data-day', addDays(today(), -13))

    await days(page).locator(`[data-day="${yesterday}"]`).click()
    await expect(days(page).locator('[aria-pressed="true"]')).toHaveAttribute('data-day', yesterday)
    // For a day that is over, dinner is the usual suspect. Mia is the Chef of the two.
    await expect(meals(page).getByRole('button', { name: 'Dinner', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(cooks(page).getByRole('radio', { name: 'Me' })).toBeChecked()
    await sheet(page).getByTestId('book-option').filter({ hasText: 'Lasagne' }).click()
    await expect(toast(page, 'Logged for yesterday, dinner')).toBeVisible()

    // The meal's own page: on the table, on its own day.
    await expect(page).toHaveURL(/#\/serving\//)
    await expect(page.getByRole('heading', { name: 'Lasagne' })).toBeVisible()
    await expect(status(page)).toHaveText('Was on the table: yesterday, dinner. Waiting for proof.')
    const [meal] = await servings(page)
    expect(meal).toMatchObject({ status: 'served', plannedDate: yesterday, plannedSlot: 'dinner', cookedBy: people.mia, proposedBy: people.mia, servedAt: zurichMoment(yesterday, '19:00:00').toISOString(), eatenAt: null })

    // In the calendar it sits on yesterday.
    const card = await dayCard(page, yesterday)
    await expect(card.getByTestId('week-meal')).toHaveCount(1)
    await expect(card.getByTestId('week-meal')).toContainText('Lasagne')
    await expect(card.getByTestId('week-meal')).toContainText('Served')

    // Today says what is still missing, without pretending that dinner is being served right now.
    await page.goto('/#/')
    await expect(page.getByTestId('served-card')).toContainText('Yesterday, dinner')
    await expect(page.getByTestId('served-card').getByRole('heading')).toHaveText('The proof is still missing')
    await expect(page.getByTestId('served-card')).toContainText('Lasagne waits for a photo and a verdict from Leo.')

    // Leo, the day after: his photo is from today, the meal stays yesterday's.
    await become(page, people.leo, 'Leo')
    await expect(page.getByTestId('served-card')).toContainText('Lasagne waits for a photo and your verdict.')
    await page.getByTestId('served-card').getByRole('button', { name: 'Take the proof photo' }).click()
    await expect(page).toHaveURL(new RegExp(`#/review/${meal.id}$`))
    await shoot(page, page.getByRole('button', { name: 'Take the proof photo' }), await plateJpeg(page))
    await expect(page.getByTestId('proof-photo')).toHaveCount(1)
    await expect(page.getByTestId('eaten-at')).toHaveText('Eaten yesterday at 19:00')
    await faces(page).getByRole('radio', { name: 'Yummy' }).click()
    await handIn(page).click()
    await celebration(page).getByRole('button', { name: 'Done' }).click()

    // Back on Today nothing waits any more, and nothing was eaten today either.
    await expect(page.getByTestId('served-card')).toHaveCount(0)
    await expect(page.getByTestId('eaten-today')).toHaveCount(0)
    expect(await serving(page, meal.id)).toMatchObject({ status: 'eaten', servedAt: meal.servedAt, eatenAt: meal.servedAt })
    await page.goto(`/#/serving/${meal.id}`)
    await expect(status(page)).toContainText('Eaten on')
    const after = await dayCard(page, yesterday)
    await expect(after.getByTestId('week-meal').getByRole('img', { name: 'Eaten' })).toBeVisible()
  })

  test('any earlier day through the date field, another meal of the day, another cook, and a dish nobody wrote down yet', async ({ page }) => {
    const people = await openKitchen(page)
    await addDish(page, 'Rösti')
    const longAgo = addDays(today(), -40)

    await openLog(page)
    // The date field is put away until somebody asks for it.
    const field = sheet(page).locator('input[type="date"]')
    await expect(field).toHaveCount(0)
    await sheet(page).getByRole('button', { name: 'An earlier day' }).click()
    await expect(sheet(page).getByLabel('An earlier day')).toBeVisible()

    // A day that is still ahead is not taken: nothing can have been eaten then.
    await field.fill(addDays(today(), 1))
    await expect(field).toHaveValue('')
    await expect(days(page).locator('[aria-pressed="true"]')).toHaveAttribute('data-day', today())

    await field.fill(longAgo)
    await expect(field).toHaveValue(longAgo)
    await expect(days(page).locator('[aria-pressed="true"]')).toHaveCount(0)
    await meals(page).getByRole('button', { name: 'Lunch', exact: true }).click()
    // Leo is the Taster of the two, so Mia is the first guess. This once he cooked himself.
    await expect(cooks(page).getByRole('radio', { name: 'Mia' })).toBeChecked()
    await cooks(page).getByRole('radio', { name: 'Me' }).click()

    await sheet(page).getByRole('searchbox', { name: 'Search' }).fill('  leftover   curry ')
    await expect(sheet(page).getByText('Nothing called "leftover curry" yet.')).toBeVisible()
    await sheet(page).getByRole('button', { name: 'Add "leftover curry" as a new dish' }).click()
    await expect(toast(page, /Logged for .+, lunch/)).toBeVisible()

    await expect(page.getByRole('heading', { name: 'leftover curry' })).toBeVisible()
    const [meal] = await servings(page)
    expect(meal).toMatchObject({ status: 'served', plannedDate: longAgo, plannedSlot: 'lunch', cookedBy: people.leo, proposedBy: people.leo, servedAt: zurichMoment(longAgo, '12:30:00').toISOString() })
    // He cooked it, so the verdict is hers.
    await expect(status(page)).toContainText('Waiting for proof.')
    await expect(page.getByTestId('proof-card')).toHaveCount(0)
    // The dish is in the recipe book now.
    await page.goto('/#/recipes')
    await expect(page.getByTestId('dish-card').filter({ hasText: 'leftover curry' })).toBeVisible()
  })

  test('a wish or a planned meal is taken along instead of being made twice; for today the hour is now', async ({ page }) => {
    const people = await openKitchen(page)
    const rösti = await propose(page, { dishId: await addDish(page, 'Rösti'), cookedBy: people.mia })
    await act(page, 'setCraving', rösti, 4)
    const pizza = await propose(page, { dishId: await addDish(page, 'Pizza'), cookedBy: people.mia, plan: { date: addDays(today(), 3), slot: 'dinner' } })
    await addDish(page, 'Soup')
    const yesterday = addDays(today(), -1)

    await openLog(page)
    await days(page).locator(`[data-day="${yesterday}"]`).click()
    // What is on its way comes first. Pizza is planned for another day: it can also have been yesterday's, as a meal of its own.
    await expect(sheet(page).getByTestId('wish-option')).toHaveText([/Rösti/, /Pizza/])
    await expect(sheet(page).getByTestId('book-option')).toHaveText([/Pizza/, /Soup/])
    await sheet(page).getByTestId('wish-option').filter({ hasText: 'Rösti' }).click()
    await expect(toast(page, 'Logged for yesterday, dinner')).toBeVisible()

    expect(await servings(page)).toHaveLength(2)
    // Her meal stays hers, and his hearts stay with it.
    expect(await serving(page, rösti)).toMatchObject({ status: 'served', plannedDate: yesterday, plannedSlot: 'dinner', cookedBy: people.mia, craving: 4 })
    // He eats, so the proof is his.
    await expect(status(page)).toHaveText('Was on the table: yesterday, dinner. Your proof is needed.')
    await expect(page.getByTestId('proof-card')).toBeVisible()

    // The planned one, for today: it comes off its day and is on the table from this moment.
    await page.goto('/#/')
    const before = Date.now()
    await openLog(page)
    await meals(page).getByRole('button', { name: 'Dessert', exact: false }).click()
    await sheet(page).getByTestId('wish-option').filter({ hasText: 'Pizza' }).click()
    await expect(toast(page, 'Logged for today, dessert')).toBeVisible()
    const moved = await serving(page, pizza)
    expect(moved).toMatchObject({ status: 'served', plannedDate: today(), plannedSlot: 'dessert' })
    // Dessert is at four, and never later than now.
    expect(Date.parse(moved.servedAt)).toBeLessThanOrEqual(Date.now())
    expect(Date.parse(moved.servedAt)).toBeGreaterThanOrEqual(Math.min(before, zurichMoment(today(), '16:00:00').getTime()))
    await expect(status(page)).toHaveText('On the table. Your proof is needed.')
    expect(await servings(page)).toHaveLength(2)
  })

  test('a day that is over takes a forgotten meal in Our Week, and in the month', async ({ page }) => {
    await openKitchen(page)
    await addDish(page, 'Fondue')
    const yesterday = addDays(today(), -1)

    // Only days that are over have the button.
    await dayCard(page, today())
    await expect(page.locator(`[data-testid="day"][data-day="${today()}"]`).getByTestId('log-day')).toHaveCount(0)

    const card = await dayCard(page, yesterday)
    await card.getByTestId('log-day').click()
    await expect(sheet(page).getByRole('heading', { name: 'What was on the table?' })).toBeVisible()
    // The day is settled: it is named, and there is nothing to pick.
    await expect(sheet(page).getByTestId('log-when')).toBeVisible()
    await expect(days(page)).toHaveCount(0)
    await meals(page).getByRole('button', { name: 'Lunch', exact: true }).click()
    await sheet(page).getByTestId('book-option').filter({ hasText: 'Fondue' }).click()
    await expect(toast(page, 'Logged for yesterday, lunch')).toBeVisible()

    // The week stays open, with the meal on its day.
    await expect(page).toHaveURL(/#\/week$/)
    await expect(card.getByTestId('week-meal')).toContainText('Fondue')
    await expect(card.getByTestId('week-meal')).toContainText('Lunch')
    await expect(card.getByTestId('week-meal')).toContainText('Served')
    const [meal] = await servings(page)
    expect(meal).toMatchObject({ status: 'served', plannedDate: yesterday, plannedSlot: 'lunch', servedAt: zurichMoment(yesterday, '12:30:00').toISOString() })

    // The month opens one day at a time: a day that is over has the same button there.
    await page.getByRole('radio', { name: 'Month' }).click()
    const month = page.getByTestId('month')
    await expect(month).toBeVisible()
    if ((await month.locator(`[data-day="${yesterday}"]`).count()) === 0) await page.getByRole('button', { name: 'Previous month' }).click()
    await month.locator(`[data-day="${yesterday}"]`).click()
    await expect(page.getByTestId('month-day').getByTestId('week-meal')).toContainText('Fondue')
    await page.getByTestId('month-day').getByTestId('log-day').click()
    await expect(sheet(page).getByTestId('log-when')).toBeVisible()
  })

  test('a planned meal whose day slipped by can be logged for that day, by either of them', async ({ page }) => {
    const people = await openKitchen(page)
    const twoAgo = addDays(today(), -2)
    const fondue = await propose(page, { dishId: await addDish(page, 'Fondue'), cookedBy: people.mia, plan: { date: twoAgo, slot: 'lunch' } })
    const tonight = await propose(page, { dishId: await addDish(page, 'Pizza'), cookedBy: people.mia, plan: { date: today(), slot: 'dinner' } })

    // A meal whose day has not passed has no such offer.
    await page.goto(`/#/serving/${tonight}`)
    await expect(status(page)).toHaveText('Planned for today, dinner')
    await expect(page.getByTestId('log-slipped')).toHaveCount(0)

    // The cook finds it next to "Served" ...
    await become(page, people.mia, 'Mia')
    await page.goto(`/#/serving/${fondue}`)
    await expect(status(page)).toContainText('Was planned for')
    await expect(page.getByRole('button', { name: 'Served', exact: true })).toBeVisible()
    await expect(page.getByTestId('log-slipped')).toContainText('Eaten on that day after all?')
    await expect(page.getByTestId('log-slipped').getByRole('button')).toHaveText(/^Log it for /)

    // ... and the Taster next to the camera.
    await become(page, people.leo, 'Leo')
    await page.goto(`/#/serving/${fondue}`)
    await expect(page.getByRole('button', { name: 'Take a photo and rate' })).toBeVisible()
    await page.getByTestId('log-slipped').getByRole('button').click()
    await expect(toast(page, /Logged for .+, lunch/)).toBeVisible()

    await expect(status(page)).toContainText('Was on the table:')
    await expect(status(page)).toContainText('Your proof is needed.')
    await expect(page.getByTestId('log-slipped')).toHaveCount(0)
    await expect(page.getByTestId('proof-card')).toBeVisible()
    expect(await serving(page, fondue)).toMatchObject({ status: 'served', plannedDate: twoAgo, plannedSlot: 'lunch', cookedBy: people.mia, servedAt: zurichMoment(twoAgo, '12:30:00').toISOString() })
  })

  test('logged by mistake: a meal that waits on the table can be removed', async ({ page }) => {
    const people = await openKitchen(page)
    const dishId = await addDish(page, 'Lasagne')
    const yesterday = addDays(today(), -1)
    const meal = (await act(page, 'logMeal', { dishId, servedAt: zurichMoment(yesterday, '19:00:00').toISOString(), slot: 'dinner', cookedBy: people.mia })) as { id: string }

    await page.goto(`/#/serving/${meal.id}`)
    await expect(status(page)).toContainText('Was on the table: yesterday, dinner.')
    await page.getByRole('button', { name: 'Remove', exact: true }).click()
    await expect(sheet(page).getByRole('heading', { name: 'Remove Lasagne?' })).toBeVisible()
    await sheet(page).getByRole('button', { name: 'Remove', exact: true }).click()
    await expect(toast(page, 'Removed')).toBeVisible()
    expect(await servings(page)).toEqual([])
    // The recipe stays.
    await page.goto('/#/recipes')
    await expect(page.getByTestId('dish-card').filter({ hasText: 'Lasagne' })).toBeVisible()
  })
})

// ---------------------------------------------------------- the photo first --

test.describe('take a photo and rate', () => {
  test('from the plus button to the verdict, for a dish nobody planned', async ({ page }) => {
    const people = await openKitchen(page)
    await addDish(page, 'Rösti')
    await addDish(page, 'Soup')

    await shootPlate(page)
    // The sheet that follows asks what it is, with the photo in sight.
    await expect(sheet(page).getByRole('heading', { name: 'What is on the plate?' })).toBeVisible()
    await expect(sheet(page).getByTestId('plate-photo').getByRole('img', { name: 'Your photo of the plate' })).toBeVisible()
    await expect(sheet(page).getByText('You eat, Mia cooked.')).toBeVisible()
    await expect(sheet(page).getByText(/^Taken at \d\d:\d\d$/)).toBeVisible()
    await expect(sheet(page).getByTestId('book-option')).toHaveText([/Rösti/, /Soup/])
    await meals(page).getByRole('button', { name: 'Lunch', exact: true }).click()
    await sheet(page).getByTestId('book-option').filter({ hasText: 'Rösti' }).click()

    // Straight into the verdict, with the photo already in. Nothing is missing but the face.
    await expect(page).toHaveURL(/#\/review\//)
    await expect(page.getByRole('heading', { name: 'Rösti' })).toBeVisible()
    await expect(page.getByText('Mia cooked. You judge.')).toBeVisible()
    await expect(page.getByTestId('proof-photo')).toHaveCount(1)
    await expect(page.getByText(/Not marked as served yet/)).toHaveCount(0)
    const [meal] = await servings(page)
    expect(meal).toMatchObject({ status: 'served', plannedDate: today(), plannedSlot: 'lunch', cookedBy: people.mia, proposedBy: people.leo })
    expect(meal.proofPhotos).toHaveLength(1)
    expect(meal.proofPhotos[0]).toMatchObject({ source: 'camera', takenAt: meal.servedAt })

    await faces(page).getByRole('radio', { name: 'Yummy' }).click()
    await handIn(page).click()
    await celebration(page).getByRole('button', { name: 'Done' }).click()
    expect(await serving(page, meal.id)).toMatchObject({ status: 'eaten', eatenAt: meal.servedAt })
    await page.goto('/#/')
    await expect(page.getByTestId('eaten-today')).toContainText('Rösti')
  })

  test('a meal that is on the plan gets the photo; what you cook yourself is not offered; a new name works too', async ({ page }) => {
    const people = await openKitchen(page)
    const tonight = await propose(page, { dishId: await addDish(page, 'Pizza'), cookedBy: people.mia, plan: { date: today(), slot: 'dinner' } })
    await propose(page, { dishId: await addDish(page, 'Fondue'), cookedBy: people.leo, plan: { date: today(), slot: 'lunch' } })
    await page.goto('/#/')
    await expect(page.getByTestId('today-meal')).toHaveCount(2)

    await shootPlate(page)
    await expect(sheet(page).getByText('On the table or on the plan')).toBeVisible()
    await expect(sheet(page).getByTestId('wish-option')).toHaveText([/Pizza/])
    // Fondue is his own to cook. From the recipe book it would be a meal Mia made.
    await expect(sheet(page).getByTestId('book-option')).toHaveText([/Fondue/])
    await sheet(page).getByTestId('wish-option').click()

    await expect(page).toHaveURL(new RegExp(`#/review/${tonight}$`))
    await expect(page.getByText('Not marked as served yet. No problem: your photo says it all.')).toBeVisible()
    await expect(page.getByTestId('proof-photo')).toHaveCount(1)
    expect(await serving(page, tonight)).toMatchObject({ status: 'planned', proofPhotos: [{ source: 'camera' }] })
    expect(await servings(page)).toHaveLength(2)

    // Something that is in nobody's book yet.
    await page.goto('/#/')
    await shootPlate(page)
    await sheet(page).getByRole('searchbox', { name: 'Search' }).fill('kebab')
    await sheet(page).getByRole('button', { name: 'Add "kebab" as a new dish' }).click()
    await expect(page).toHaveURL(/#\/review\//)
    await expect(page.getByRole('heading', { name: 'kebab' })).toBeVisible()
    await expect(page.getByTestId('proof-photo')).toHaveCount(1)
    const all = await servings(page)
    expect(all).toHaveLength(3)
    expect(all.find((s) => s.status === 'served')).toMatchObject({ plannedDate: today(), cookedBy: people.mia, proposedBy: people.leo })
  })

  test('a meal that is on the table already is the first guess', async ({ page }) => {
    const people = await openKitchen(page)
    const soup = await propose(page, { dishId: await addDish(page, 'Soup'), cookedBy: people.mia, plan: { date: today(), slot: 'dinner' } })
    await propose(page, { dishId: await addDish(page, 'Pizza'), cookedBy: people.mia })
    await act(page, 'markServed', soup)

    await shootPlate(page)
    await expect(sheet(page).getByTestId('wish-option')).toHaveText([/Soup/, /Pizza/])
    await expect(sheet(page).getByTestId('wish-option').first()).toContainText('Served')
    await sheet(page).getByTestId('wish-option').first().click()
    await expect(page).toHaveURL(new RegExp(`#/review/${soup}$`))
    await expect(page.getByTestId('proof-photo')).toHaveCount(1)
    expect(await serving(page, soup)).toMatchObject({ status: 'served', proofPhotos: [{ source: 'camera' }] })
  })

  test('a file that is no picture says so, and a sheet that is closed leaves nothing behind', async ({ page }) => {
    await openKitchen(page)
    await addDish(page, 'Rösti')

    await shootPlate(page, { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a picture at all') })
    await expect(toast(page, 'That photo could not be read. Take a new one or pick another.')).toBeVisible()
    await expect(sheet(page)).toHaveCount(0)

    // Changed his mind after the photo.
    await shootPlate(page)
    await expect(sheet(page).getByTestId('plate-photo').getByRole('img')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(sheet(page)).toHaveCount(0)
    expect(await servings(page)).toEqual([])
    expect(await page.evaluate(() => window.__foodwishus.db.photos.count())).toBe(0)
  })

  test('the empty table on Today offers the camera as well', async ({ page }) => {
    await openKitchen(page)
    await addDish(page, 'Rösti')
    await expect(page.getByTestId('today-empty')).toBeVisible()
    await shoot(page, page.getByTestId('today-empty').getByRole('button', { name: 'Take a photo and rate' }), await plateJpeg(page))
    await expect(sheet(page).getByRole('heading', { name: 'What is on the plate?' })).toBeVisible()
    await sheet(page).getByTestId('book-option').click()
    await expect(page).toHaveURL(/#\/review\//)
    await expect(page.getByTestId('proof-photo')).toHaveCount(1)
  })

  test('the card of a planned meal opens the camera for that meal', async ({ page }) => {
    const people = await openKitchen(page)
    const tonight = await propose(page, { dishId: await addDish(page, 'Pizza'), cookedBy: people.mia, plan: { date: today(), slot: 'dinner' } })
    await page.goto('/#/')
    await shoot(page, page.getByTestId('today-meal').getByRole('button', { name: 'Take a photo and rate' }), await plateJpeg(page))
    await expect(page).toHaveURL(new RegExp(`#/review/${tonight}$`))
    await expect(page.getByTestId('proof-photo')).toHaveCount(1)

    // Back on Today the same place leads on to the verdict.
    await page.goto('/#/')
    await expect(page.getByTestId('today-meal').getByRole('button', { name: 'Take a photo and rate' })).toHaveCount(0)
    await page.getByTestId('today-meal').getByRole('button', { name: 'Finish the verdict' }).click()
    await expect(page).toHaveURL(new RegExp(`#/review/${tonight}$`))

    // A file that is no picture: said so, and nothing is attached.
    const tomorrow = await propose(page, { dishId: await addDish(page, 'Soup'), cookedBy: people.mia, plan: { date: addDays(today(), 1), slot: 'dinner' } })
    await page.goto(`/#/serving/${tomorrow}`)
    await shoot(page, page.getByRole('button', { name: 'Take a photo and rate' }), { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a picture at all') })
    await expect(toast(page, 'That photo could not be read. Take a new one or pick another.')).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`#/serving/${tomorrow}$`))
    expect((await serving(page, tomorrow)).proofPhotos).toEqual([])
    await expect(page.getByRole('button', { name: 'Take a photo and rate' })).toBeEnabled()
  })
})

// ------------------------------------------------------------------ German --

test('both ways in German', async ({ page }) => {
  await openKitchen(page, 'de')
  await addDish(page, 'Rösti')
  await addDish(page, 'Suppe')
  const yesterday = addDays(today(), -1)

  await page.getByRole('button', { name: 'Etwas hinzufügen' }).click()
  await expect(sheet(page).getByRole('button', { name: /Essen nachtragen/ })).toContainText('Schon gegessen, aber nie eingetragen')
  await expect(sheet(page).getByRole('button', { name: /Foto machen und bewerten/ })).toContainText('Es steht gerade auf dem Tisch')
  await sheet(page).getByRole('button', { name: /Essen nachtragen/ }).click()
  await expect(sheet(page).getByRole('heading', { name: 'Was gab es?' })).toBeVisible()
  await expect(sheet(page).getByRole('button', { name: 'Ein früherer Tag' })).toBeVisible()
  await expect(sheet(page).getByRole('radiogroup', { name: 'Wer hat gekocht?' }).getByRole('radio', { name: 'Mia' })).toBeChecked()
  await sheet(page).getByRole('group', { name: 'Wann war es?' }).locator(`[data-day="${yesterday}"]`).click()
  await sheet(page).getByTestId('book-option').filter({ hasText: 'Rösti' }).click()
  await expect(toast(page, 'Nachgetragen für gestern, Abendessen')).toBeVisible()
  await expect(status(page)).toHaveText('Stand auf dem Tisch: gestern, Abendessen. Dein Beweisfoto fehlt noch.')

  await page.goto('/#/')
  await expect(page.getByTestId('served-card')).toContainText('Gestern, Abendessen')
  await expect(page.getByTestId('served-card').getByRole('heading')).toHaveText('Der Beweis fehlt noch')
  await expect(page.getByTestId('served-card')).toContainText('Rösti wartet auf ein Foto und dein Urteil.')

  await page.getByRole('button', { name: 'Etwas hinzufügen' }).click()
  await shoot(page, sheet(page).getByRole('button', { name: /Foto machen und bewerten/ }), await plateJpeg(page))
  await expect(sheet(page).getByRole('heading', { name: 'Was ist auf dem Teller?' })).toBeVisible()
  await expect(sheet(page).getByText('Du isst, Mia hat gekocht.')).toBeVisible()
  await expect(sheet(page).getByText(/^Aufgenommen um \d\d:\d\d$/)).toBeVisible()
  await expect(sheet(page).getByText('Auf dem Tisch oder auf dem Plan')).toBeVisible()
  await sheet(page).getByTestId('book-option').filter({ hasText: 'Suppe' }).click()
  await expect(page).toHaveURL(/#\/review\//)
  await expect(page.getByTestId('proof-photo')).toHaveCount(1)

  // A planned meal whose day is over, and a day that is over in the week.
  const slipped = await propose(page, { dishId: await addDish(page, 'Fondue'), plan: { date: addDays(today(), -2), slot: 'dinner' } })
  await page.goto(`/#/serving/${slipped}`)
  await expect(page.getByTestId('log-slipped')).toContainText('Doch an dem Tag gegessen?')
  await expect(page.getByTestId('log-slipped').getByRole('button')).toHaveText(/^Nachtragen für /)
  await page.goto('/#/week')
  await expect(page.getByTestId('week')).toBeVisible()
  if ((await page.getByTestId('log-day').count()) === 0) await page.getByRole('button', { name: 'Vorherige Woche' }).click()
  await expect(page.getByTestId('log-day').first()).toHaveText('Essen nachtragen')
  await expect(page.getByTestId('log-day').first()).toHaveAccessibleName(/^Essen nachtragen für /)
})
