import { expect, test, type Locator, type Page } from '@playwright/test'

// Planning flows, seen through the Taster's eyes in the demo kitchen: Mia is the Chef,
// Leo (this phone) is the Taster. Nothing here touches a cloud.

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

/** 0 = Monday … 6 = Sunday. */
const weekdayIndex = (day: string) => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7
const mondayOf = (day: string) => addDays(day, -weekdayIndex(day))
const weekdayName = (day: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long' }).format(new Date(`${day}T12:00:00Z`))

interface People {
  mia: string
  leo: string
}

/** Open the demo kitchen on Today and wait until it is ready. */
async function openKitchen(page: Page): Promise<People> {
  await page.addInitScript(() => {
    // The demo kitchen with its two people and nothing on the table.
    localStorage.setItem('foodwishus.prefs', '{"demoData":true,"demoEmpty":true}')
    localStorage.setItem('foodwishus.lang', 'en')
  })
  await page.goto('/#/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Leo')
  await page.waitForFunction(() => Boolean(window.__foodwishus))
  const people = await page.evaluate(async () => {
    const { db } = window.__foodwishus
    const leo: string = await db.getMeta('me.memberId')
    const members: { id: string; name: string }[] = await db.members.toArray()
    return { leo, mia: members.find((m) => m.id !== leo)!.id, names: members.map((m) => m.name).sort() }
  })
  expect(people.names).toEqual(['Leo', 'Mia'])
  return { mia: people.mia, leo: people.leo }
}

async function addDish(page: Page, name: string, extra: Record<string, unknown> = {}): Promise<string> {
  return page.evaluate(async ([n, e]) => (await window.__foodwishus.actions.createDish({ name: n, ...(e as object) })).id as string, [name, extra] as const)
}

/** Put a dish on the wishlist. Returns the serving's id. */
async function addWish(page: Page, dishId: string, input: Record<string, unknown> = {}): Promise<string> {
  return page.evaluate(async ([id, i]) => (await window.__foodwishus.actions.proposeServing({ dishId: id, ...(i as object) })).id as string, [dishId, input] as const)
}

/** A dish that Mia cooks, straight onto the wishlist. */
async function wish(page: Page, people: People, name: string, input: Record<string, unknown> = {}): Promise<string> {
  return addWish(page, await addDish(page, name), { cookedBy: people.mia, ...input })
}

const act = (page: Page, action: string, ...args: unknown[]) => page.evaluate(([name, list]) => window.__foodwishus.actions[name as string](...(list as unknown[])), [action, args] as const)

const serving = (page: Page, id: string) => page.evaluate((servingId) => window.__foodwishus.db.servings.get(servingId), id)

/** The names on the wishlist board, top to bottom. */
async function board(page: Page): Promise<string[]> {
  const labels = await page.getByTestId('wishlist').getByRole('button', { name: /^Open / }).evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label') ?? ''))
  return labels.map((label) => label.replace(/^Open /, ''))
}

/** The same order as stored: what the other phone will see. */
async function storedOrder(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const { db } = window.__foodwishus
    const dishes = new Map<string, string>((await db.dishes.toArray()).map((d: { id: string; name: string }) => [d.id, d.name]))
    const servings: { dishId: string; priority: string; id: string; status: string }[] = await db.servings.toArray()
    return servings
      .filter((s) => s.status === 'wishlist' || s.status === 'planned')
      .sort((a, b) => (a.priority === b.priority ? (a.id < b.id ? -1 : 1) : a.priority < b.priority ? -1 : 1))
      .map((s) => dishes.get(s.dishId) ?? '')
  })
}

const card = (page: Page, name: string) => page.getByTestId('wish-card').filter({ has: page.getByRole('button', { name: `Open ${name}` }) })
const dayCard = (page: Page, day: string) => page.locator(`[data-testid="day"][data-day="${day}"]`)
const toast = (page: Page, text: string | RegExp) => page.getByRole('status').filter({ hasText: text }).last()

/** The middle of something on screen. Scroll first: scrolling afterwards makes the point stale. */
async function centre(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Nothing to point at')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

// ----------------------------------------------------------------- propose --

test.describe('proposing', () => {
  test('propose a dish with a note and a suggested day', async ({ page }) => {
    const people = await openKitchen(page)
    const dishId = await addDish(page, 'Lasagne al forno')
    const tomorrow = addDays(today(), 1)

    await page.goto(`/#/propose/dish/${dishId}`)
    await expect(page.getByRole('heading', { name: 'Propose a dish' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Lasagne al forno' })).toBeVisible()

    // It goes on the wishlist unless told otherwise, and two weeks of days are there to tap.
    await expect(page.getByRole('radio', { name: 'On the wishlist' })).toBeChecked()
    await expect(page.getByTestId('where-hint')).toHaveText('It waits on the wishlist until one of you picks a day.')
    await expect(page.getByRole('group', { name: 'Good days for it' }).getByRole('button')).toHaveCount(14)

    await page.getByLabel('A note for Mia').fill('Extra cheese, just for you')
    await page.locator(`[data-day="${tomorrow}"]`).click()
    await expect(page.locator(`[data-day="${tomorrow}"]`)).toHaveAttribute('aria-pressed', 'true')
    // Leo is the Taster, Mia the Chef: she cooks unless he says otherwise.
    await expect(page.getByRole('radio', { name: 'Mia' })).toBeChecked()

    await page.getByRole('button', { name: 'Propose' }).click()
    await expect(toast(page, 'Proposed')).toBeVisible()
    await expect(page).toHaveURL(/#\/wishlist$/)

    const lasagne = card(page, 'Lasagne al forno')
    await expect(lasagne).toContainText('Your idea')
    await expect(lasagne).toContainText('Extra cheese, just for you')

    const stored = await page.evaluate(async () => (await window.__foodwishus.db.servings.toArray())[0])
    expect(stored).toMatchObject({ status: 'wishlist', note: 'Extra cheese, just for you', suggestedDays: [tomorrow], cookedBy: people.mia, proposedBy: people.leo })

    // The suggested day is waiting on the meal's page, already picked.
    await lasagne.getByRole('button', { name: 'Open Lasagne al forno' }).click()
    await expect(page.getByText('You suggested')).toBeVisible()
    await expect(page.getByTestId('planner').locator(`[data-day="${tomorrow}"]`)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('planner').locator(`[data-day="${tomorrow}"]`)).toHaveAccessibleName(/suggested/)
  })

  test('good days can be any day: a later one goes through the date field', async ({ page }) => {
    const people = await openKitchen(page)
    const dishId = await addDish(page, 'Fondue chinoise')
    const tomorrow = addDays(today(), 1)
    const christmas = addDays(today(), 43)
    const newYear = addDays(today(), 50)

    await page.goto(`/#/propose/dish/${dishId}`)
    const later = page.getByLabel('Add a later day')
    await page.locator(`[data-day="${tomorrow}"]`).click()
    await later.fill(christmas)
    const chips = page.getByTestId('later-days').getByRole('button')
    await expect(chips).toHaveCount(1)
    await expect(chips.first()).toHaveAttribute('aria-pressed', 'true')
    // The field is ready for the next day right away.
    await expect(later).toHaveValue('')
    await later.fill(newYear)
    await expect(chips).toHaveCount(2)
    // A day that is one of the fourteen is ticked there, not listed a second time.
    await later.fill(addDays(today(), 3))
    await expect(page.locator(`[data-day="${addDays(today(), 3)}"]`)).toHaveAttribute('aria-pressed', 'true')
    await expect(chips).toHaveCount(2)
    // A day that is over cannot be a good day.
    await later.fill(addDays(today(), -1))
    await expect(chips).toHaveCount(2)
    // Changed her mind about New Year: one tap takes it away.
    await chips.nth(1).click()
    await expect(chips).toHaveCount(1)

    await page.getByRole('button', { name: 'Propose' }).click()
    await expect(page).toHaveURL(/#\/wishlist$/)
    const stored = await page.evaluate(async () => (await window.__foodwishus.db.servings.toArray())[0])
    expect(stored).toMatchObject({ status: 'wishlist', suggestedDays: [tomorrow, addDays(today(), 3), christmas], cookedBy: people.mia })

    // On the meal's page the far day is in sight, with its heart, and one tap picks it.
    await card(page, 'Fondue chinoise').getByRole('button', { name: 'Open Fondue chinoise' }).click()
    const planner = page.getByTestId('planner')
    const far = planner.getByTestId('later-days').getByRole('button')
    await expect(far).toHaveCount(1)
    await expect(far).toHaveAccessibleName(/, suggested$/)
    await expect(far).toHaveAttribute('aria-pressed', 'false')
    await far.click()
    await expect(far).toHaveAttribute('aria-pressed', 'true')
    await expect(planner.getByLabel('Or a later day')).toHaveValue(christmas)
    await planner.getByRole('button', { name: 'Plan it' }).click()
    // "Proposed" may still be on screen next to it.
    await expect(toast(page, /Planned for .+, dinner$/)).toBeVisible()
    expect(await serving(page, stored.id)).toMatchObject({ status: 'planned', plannedDate: christmas, plannedSlot: 'dinner' })
  })

  test('from the recipe straight onto the calendar, on any day', async ({ page }) => {
    const people = await openKitchen(page)
    const dishId = await addDish(page, 'Birchermüesli', { course: 'breakfast' })
    const far = addDays(today(), 75)

    await page.goto(`/#/recipes/${dishId}`)
    await page.getByRole('button', { name: 'Propose' }).click()
    await expect(page.getByRole('heading', { name: 'Propose a dish' })).toBeVisible()
    await page.getByRole('radio', { name: 'On a day' }).click()
    await expect(page.getByTestId('where-hint')).toHaveText('It goes straight onto the calendar.')

    // No day, no plan: the button waits and says why.
    const plan = page.getByRole('button', { name: 'Plan it' })
    await expect(plan).toBeDisabled()
    await expect(page.getByText('Pick a day first.')).toBeVisible()
    // A breakfast dish is guessed to be breakfast.
    await expect(page.getByRole('group', { name: 'Meal' }).getByRole('button', { name: 'Breakfast' })).toHaveAttribute('aria-pressed', 'true')

    // One day only: the far one replaces the tapped one.
    await page.locator(`[data-day="${addDays(today(), 2)}"]`).click()
    await expect(plan).toBeEnabled()
    await page.getByLabel('Or a later day').fill(far)
    await expect(page.locator(`[data-day="${addDays(today(), 2)}"]`)).toHaveAttribute('aria-pressed', 'false')
    await page.getByLabel('A note for Mia').fill('For the long weekend')
    await page.getByRole('group', { name: 'Meal' }).getByRole('button', { name: 'Lunch' }).click()
    await plan.click()

    await expect(toast(page, /^Planned for .+, lunch$/)).toBeVisible()
    await expect(page).toHaveURL(/#\/serving\//)
    await expect(page.getByRole('heading', { level: 1, name: 'Planned' })).toBeVisible()
    await expect(page.getByTestId('serving-status')).toContainText('Planned for')
    const stored = await page.evaluate(async () => (await window.__foodwishus.db.servings.toArray())[0])
    expect(stored).toMatchObject({ status: 'planned', plannedDate: far, plannedSlot: 'lunch', suggestedDays: [], note: 'For the long weekend', cookedBy: people.mia, proposedBy: people.leo })

    // It is on the calendar, however far away.
    await page.goto('/#/week')
    await page.getByRole('radio', { name: 'Month' }).click()
    for (let month = 0; month < 4 && (await page.getByTestId('month').locator(`[data-day="${far}"]`).count()) === 0; month++) await page.getByRole('button', { name: 'Next month' }).click()
    await page.getByTestId('month').locator(`[data-day="${far}"]`).click()
    await expect(page.getByTestId('month-day').getByTestId('week-meal')).toContainText('Birchermüesli')
  })

  test('propose a menu, cooked by me', async ({ page }) => {
    const people = await openKitchen(page)
    const soup = await addDish(page, 'Pumpkin soup', { course: 'starter' })
    const strudel = await addDish(page, 'Apple strudel', { course: 'dessert' })
    const menuId = await page.evaluate(
      async ([a, b]) =>
        (
          await window.__foodwishus.actions.createMenu({
            name: 'Sunday feast',
            courses: [
              { dishId: a, order: 0 },
              { dishId: b, order: 1 },
            ],
          })
        ).id as string,
      [soup, strudel] as const,
    )

    await page.goto(`/#/propose/menu/${menuId}`)
    await expect(page.getByRole('heading', { name: 'Propose a menu' })).toBeVisible()
    await expect(page.getByText('Menu with 2 courses')).toBeVisible()
    await expect(page.getByText('Pumpkin soup, Apple strudel')).toBeVisible()
    await page.getByRole('radio', { name: 'Me' }).click()
    await page.getByRole('button', { name: 'Propose' }).click()

    await expect(page).toHaveURL(/#\/wishlist$/)
    await expect(card(page, 'Sunday feast')).toBeVisible()
    const stored = await page.evaluate(async () => (await window.__foodwishus.db.servings.toArray())[0])
    expect(stored).toMatchObject({ menuId, dishId: null, cookedBy: people.leo })
  })
})

// ---------------------------------------------------------------- wishlist --

test.describe('the wishlist', () => {
  test('starts empty and invites', async ({ page }) => {
    await openKitchen(page)
    await page.goto('/#/wishlist')
    await expect(page.getByRole('heading', { name: 'The wishlist is empty' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add the first dish' })).toBeVisible()
  })

  test('set a craving with one tap', async ({ page }) => {
    const people = await openKitchen(page)
    const id = await wish(page, people, 'Rösti')
    await page.goto('/#/wishlist')

    const rosti = card(page, 'Rösti')
    await expect(rosti.getByTestId('craving-words')).toHaveText('Tap a heart')
    await expect(page.getByRole('button', { name: /^Not rated yet/ })).toContainText('1')

    await rosti.getByRole('radio', { name: /4 of 5 hearts/ }).click()
    await expect(rosti.getByTestId('craving-words')).toHaveText('Ooh, yes please')
    await expect(rosti.getByRole('radio', { name: /4 of 5 hearts/ })).toBeChecked()
    await expect(page.getByRole('button', { name: /^Not rated yet/ })).toContainText('0')
    expect(await serving(page, id)).toMatchObject({ craving: 4 })

    // A change of heart is one more tap.
    await rosti.getByRole('radio', { name: /5 of 5 hearts/ }).click()
    await expect(rosti.getByTestId('craving-words')).toHaveText('Feed me this immediately')
    expect(await serving(page, id)).toMatchObject({ craving: 5 })
  })

  test('the hearts belong to the Taster: the cook only watches', async ({ page }) => {
    const people = await openKitchen(page)
    // Leo cooks this one, so the craving is Mia's to set.
    await wish(page, people, 'Zopf', { cookedBy: people.leo })
    await page.goto('/#/wishlist')
    await expect(card(page, 'Zopf').getByTestId('craving-words')).toHaveText('Mia has not given hearts yet')
    await expect(card(page, 'Zopf').getByRole('radio')).toHaveCount(0)
  })

  test('reorder by drag', async ({ page }) => {
    const people = await openKitchen(page)
    for (const name of ['Rösti', 'Fondue', 'Zopf']) await wish(page, people, name)
    await page.goto('/#/wishlist')
    await expect.poll(() => board(page)).toEqual(['Rösti', 'Fondue', 'Zopf'])

    const from = await centre(page.getByRole('button', { name: 'Move Zopf' }))
    const target = await card(page, 'Rösti').boundingBox()
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x, from.y - 12, { steps: 3 })
    await expect(page.getByTestId('wish-lifted')).toBeVisible()
    await page.mouse.move(from.x, target!.y + 8, { steps: 12 })
    await expect(page.getByText('Zopf is now number 1 of 3.')).toBeAttached()
    await page.mouse.up()

    await expect(page.getByTestId('wish-lifted')).toBeHidden()
    await expect.poll(() => board(page)).toEqual(['Zopf', 'Rösti', 'Fondue'])
    await expect.poll(() => storedOrder(page)).toEqual(['Zopf', 'Rösti', 'Fondue'])

    await page.reload()
    await expect.poll(() => board(page)).toEqual(['Zopf', 'Rösti', 'Fondue'])
  })

  test('reorder by keyboard', async ({ page }) => {
    const people = await openKitchen(page)
    for (const name of ['Rösti', 'Fondue', 'Zopf']) await wish(page, people, name)
    await page.goto('/#/wishlist')
    await expect.poll(() => board(page)).toEqual(['Rösti', 'Fondue', 'Zopf'])

    await page.getByRole('button', { name: 'Move Rösti' }).focus()
    await page.keyboard.press('Space')
    await expect(page.getByText('Picked up Rösti.')).toBeAttached()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByText('Rösti is now number 2 of 3.')).toBeAttached()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByText('Rösti is now number 3 of 3.')).toBeAttached()
    await page.keyboard.press('Space')

    await expect.poll(() => board(page)).toEqual(['Fondue', 'Zopf', 'Rösti'])
    await expect.poll(() => storedOrder(page)).toEqual(['Fondue', 'Zopf', 'Rösti'])
  })

  test('a finger resting on a card lifts it, and dragging moves the card', async ({ page }) => {
    const people = await openKitchen(page)
    for (const name of ['Rösti', 'Fondue', 'Zopf']) await wish(page, people, name)
    await page.goto('/#/wishlist')
    await expect.poll(() => board(page)).toEqual(['Rösti', 'Fondue', 'Zopf'])
    const touch = await page.context().newCDPSession(page)
    const finger = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number }[]) => touch.send('Input.dispatchTouchEvent', { type, touchPoints: points })

    const hold = await centre(page.getByRole('button', { name: 'Move Fondue' }))
    const above = await card(page, 'Rösti').boundingBox()
    await finger('touchStart', [hold])
    // Nothing moves until the short hold is over.
    await expect(page.getByTestId('wish-lifted')).toBeVisible()
    const steps = 10
    for (let step = 1; step <= steps; step++) await finger('touchMove', [{ x: hold.x, y: hold.y + ((above!.y + 8 - hold.y) * step) / steps }])
    await expect(page.getByText('Fondue is now number 1 of 3.')).toBeAttached()
    await finger('touchEnd', [])

    await expect.poll(() => board(page)).toEqual(['Fondue', 'Rösti', 'Zopf'])
    await expect.poll(() => storedOrder(page)).toEqual(['Fondue', 'Rösti', 'Zopf'])
    // The page stayed where it was: the finger moved the card, not the list.
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
  })

  test('a swipe over the cards still scrolls the list', async ({ page }) => {
    const people = await openKitchen(page)
    const names = ['Rösti', 'Fondue', 'Zopf', 'Birchermüesli', 'Raclette', 'Capuns']
    for (const name of names) await wish(page, people, name)
    await page.goto('/#/wishlist')
    await expect.poll(() => board(page)).toEqual(names)
    const touch = await page.context().newCDPSession(page)
    const finger = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number }[]) => touch.send('Input.dispatchTouchEvent', { type, touchPoints: points })

    const start = await centre(card(page, 'Zopf'))
    await finger('touchStart', [start])
    for (let step = 1; step <= 8; step++) await finger('touchMove', [{ x: start.x, y: start.y - step * 30 }])
    await finger('touchEnd', [])

    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(50)
    await expect(page.getByTestId('wish-lifted')).toHaveCount(0)
    await expect.poll(() => storedOrder(page)).toEqual(names)
  })

  test('filter: all, not rated yet, planned', async ({ page }) => {
    const people = await openKitchen(page)
    const rated = await wish(page, people, 'Rösti')
    const planned = await wish(page, people, 'Fondue')
    await wish(page, people, 'Zopf')
    await act(page, 'setCraving', rated, 3)
    await act(page, 'setCraving', planned, 5)
    await act(page, 'planServing', planned, addDays(today(), 1), 'dinner')
    await page.goto('/#/wishlist')
    await expect.poll(() => board(page)).toEqual(['Rösti', 'Fondue', 'Zopf'])
    await expect(card(page, 'Fondue')).toContainText('Planned for tomorrow, dinner')

    await page.getByRole('button', { name: /^Not rated yet/ }).click()
    await expect.poll(() => board(page)).toEqual(['Zopf'])

    await page.getByRole('button', { name: /^Planned/ }).click()
    await expect.poll(() => board(page)).toEqual(['Fondue'])

    await page.getByRole('button', { name: /^All/ }).click()
    await expect.poll(() => board(page)).toEqual(['Rösti', 'Fondue', 'Zopf'])
  })

  test('skip with a reason and put back', async ({ page }) => {
    const people = await openKitchen(page)
    const id = await wish(page, people, 'Fondue')
    await wish(page, people, 'Zopf')
    await page.goto('/#/wishlist')

    await page.getByRole('button', { name: 'Open Fondue' }).click()
    await page.getByRole('button', { name: 'Skip this one' }).click()
    const sheet = page.getByRole('dialog', { name: 'Skip this one?' })
    await expect(sheet).toContainText('Fondue leaves the wishlist for now')
    await sheet.getByRole('button', { name: 'Ate out' }).click()
    await sheet.getByRole('button', { name: 'Skip it' }).click()

    await expect(toast(page, 'Skipped')).toBeVisible()
    await expect(page).toHaveURL(/#\/wishlist$/)
    await expect.poll(() => board(page)).toEqual(['Zopf'])
    expect(await serving(page, id)).toMatchObject({ status: 'skipped', skippedReason: 'Ate out' })

    // Skipped meals rest in a quiet, folded section at the bottom.
    const skipped = page.getByRole('button', { name: 'Skipped (1)' })
    await expect(skipped).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId('skipped-row')).toHaveCount(0)
    await skipped.click()
    await expect(page.getByTestId('skipped-row')).toContainText('Fondue')
    await expect(page.getByTestId('skipped-row')).toContainText('Ate out')

    await page.getByRole('button', { name: 'Put Fondue back on the wishlist' }).click()
    await expect(toast(page, 'Back on the wishlist')).toBeVisible()
    await expect.poll(() => board(page)).toEqual(['Fondue', 'Zopf'])
    await expect(page.getByRole('button', { name: /^Skipped/ })).toHaveCount(0)
    expect(await serving(page, id)).toMatchObject({ status: 'wishlist', skippedReason: null })
  })

  test('remove says what will happen first', async ({ page }) => {
    const people = await openKitchen(page)
    const id = await wish(page, people, 'Fondue')
    await page.goto('/#/wishlist')
    await page.getByRole('button', { name: 'Open Fondue' }).click()

    await page.getByRole('button', { name: 'Remove' }).click()
    const sheet = page.getByRole('dialog', { name: 'Remove Fondue?' })
    await expect(sheet).toContainText('It disappears from the wishlist and the calendar, on both phones. The recipe stays in the recipe book.')
    await sheet.getByRole('button', { name: 'Cancel' }).click()
    await expect(sheet).toBeHidden()
    expect(await serving(page, id)).toMatchObject({ deletedAt: null })

    await page.getByRole('button', { name: 'Remove' }).click()
    await page.getByRole('dialog', { name: 'Remove Fondue?' }).getByRole('button', { name: 'Remove' }).click()
    await expect(toast(page, 'Removed')).toBeVisible()
    await expect(page).toHaveURL(/#\/wishlist$/)
    await expect(page.getByRole('heading', { name: 'The wishlist is empty' })).toBeVisible()
    expect((await serving(page, id)).deletedAt).not.toBeNull()
  })
})

// ---------------------------------------------------------------- planning --

test.describe('planning and Our Week', () => {
  test('plan for tomorrow dinner and see it in the week', async ({ page }) => {
    const people = await openKitchen(page)
    const id = await wish(page, people, 'Lasagne al forno')
    const tomorrow = addDays(today(), 1)
    await page.goto('/#/wishlist')
    await page.getByRole('button', { name: 'Open Lasagne al forno' }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'On the wishlist' })).toBeVisible()
    const planner = page.getByTestId('planner')
    await expect(planner.getByRole('button', { name: 'Plan it' })).toBeDisabled()
    await planner.locator(`[data-day="${tomorrow}"]`).click()
    await planner.getByRole('button', { name: 'Dinner' }).click()
    await planner.getByRole('button', { name: 'Plan it' }).click()

    await expect(toast(page, 'Planned for tomorrow, dinner')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Planned' })).toBeVisible()
    await expect(page.getByTestId('serving-status')).toHaveText('Planned for tomorrow, dinner')
    expect(await serving(page, id)).toMatchObject({ status: 'planned', plannedDate: tomorrow, plannedSlot: 'dinner' })

    await page.goto('/#/week')
    // On a Sunday, tomorrow belongs to next week.
    if (mondayOf(tomorrow) !== mondayOf(today())) await page.getByRole('button', { name: 'Next week' }).click()
    const day = dayCard(page, tomorrow)
    await expect(day.getByRole('heading')).toHaveText(weekdayName(tomorrow))
    await expect(day.getByTestId('week-meal')).toContainText('Lasagne al forno')
    await expect(day.getByTestId('week-meal')).toContainText('Dinner')
    // Dinner is taken, and every meal of the day can still take something: also a second dish for dinner.
    await expect(day.locator('[data-slot]')).toHaveCount(4)
    await expect(day.getByRole('button', { name: /^Plan dinner for / })).toBeVisible()

    // Changing your mind: back to the wishlist.
    await day.getByTestId('week-meal').click()
    await page.getByRole('button', { name: 'Back to the wishlist' }).click()
    await expect(toast(page, 'Back on the wishlist')).toBeVisible()
    await expect(page.getByTestId('planner')).toBeVisible()
    expect(await serving(page, id)).toMatchObject({ status: 'wishlist', plannedDate: null, plannedSlot: null })
  })

  test('a later day goes through the date field', async ({ page }) => {
    const people = await openKitchen(page)
    const id = await wish(page, people, 'Raclette')
    const later = addDays(today(), 30)
    await page.goto(`/#/serving/${id}`)
    const planner = page.getByTestId('planner')
    await planner.getByLabel('Or a later day').fill(later)
    await planner.getByRole('button', { name: 'Lunch' }).click()
    await planner.getByRole('button', { name: 'Plan it' }).click()
    await expect(toast(page, /^Planned for .+, lunch$/)).toBeVisible()
    expect(await serving(page, id)).toMatchObject({ status: 'planned', plannedDate: later, plannedSlot: 'lunch' })
  })

  test('reschedule by dragging a meal to another day', async ({ page }) => {
    const people = await openKitchen(page)
    const id = await wish(page, people, 'Rösti')
    // Next week's Tuesday and Thursday: always ahead of us, always in the same week.
    const tuesday = addDays(mondayOf(today()), 8)
    const thursday = addDays(tuesday, 2)
    await act(page, 'planServing', id, tuesday, 'lunch')

    await page.goto('/#/week')
    await page.getByRole('button', { name: 'Next week' }).click()
    await expect(dayCard(page, tuesday).getByTestId('week-meal')).toContainText('Rösti')

    await dayCard(page, thursday).scrollIntoViewIfNeeded()
    const from = await centre(dayCard(page, tuesday).getByTestId('week-meal'))
    const to = await centre(dayCard(page, thursday))
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x, from.y + 12, { steps: 3 })
    await expect(page.getByTestId('meal-lifted')).toBeVisible()
    await page.mouse.move(to.x, to.y, { steps: 12 })
    await expect(dayCard(page, thursday)).toHaveAttribute('data-over', 'true')
    await page.mouse.up()

    await expect(toast(page, /^Moved to /)).toBeVisible()
    await expect(dayCard(page, thursday).getByTestId('week-meal')).toContainText('Rösti')
    await expect(dayCard(page, tuesday).getByTestId('week-meal')).toHaveCount(0)
    // Same meal, same slot, new day.
    expect(await serving(page, id)).toMatchObject({ status: 'planned', plannedDate: thursday, plannedSlot: 'lunch' })
  })

  test('an empty slot offers the wishlist', async ({ page }) => {
    const people = await openKitchen(page)
    const tuesday = addDays(mondayOf(today()), 8)
    await wish(page, people, 'Fondue')
    const suggested = await wish(page, people, 'Zopf', { suggestedDays: [tuesday] })

    await page.goto('/#/week')
    await page.getByRole('button', { name: 'Next week' }).click()
    await dayCard(page, tuesday).locator('[data-slot="breakfast"]').click()

    const sheet = page.getByRole('dialog', { name: 'What shall it be?' })
    // The wish suggested for exactly this day comes first.
    await expect(sheet.getByTestId('wish-option')).toHaveText([/Zopf/, /Fondue/])
    await expect(sheet.getByTestId('wish-option').first()).toContainText('You suggested this day')
    await sheet.getByTestId('wish-option').first().click()

    await expect(toast(page, /^Planned for .+, breakfast$/)).toBeVisible()
    await expect(sheet).toBeHidden()
    await expect(dayCard(page, tuesday).getByTestId('week-meal')).toContainText('Zopf')
    expect(await serving(page, suggested)).toMatchObject({ status: 'planned', plannedDate: tuesday, plannedSlot: 'breakfast' })
  })

  test('a suggested day waits in the week and leads straight to planning', async ({ page }) => {
    const people = await openKitchen(page)
    const tuesday = addDays(mondayOf(today()), 8)
    const id = await wish(page, people, 'Apple strudel', { suggestedDays: [tuesday] })

    await page.goto('/#/week')
    await page.getByRole('button', { name: 'Next week' }).click()
    const hint = dayCard(page, tuesday).getByTestId('day-suggestion')
    await expect(hint).toHaveText('You suggested Apple strudel')
    await expect(page.getByTestId('day-suggestion')).toHaveCount(1)
    await hint.click()

    // The day you tapped is already picked: one more tap plans it.
    const planner = page.getByTestId('planner')
    await expect(planner.locator(`[data-day="${tuesday}"]`)).toHaveAttribute('aria-pressed', 'true')
    await planner.getByRole('button', { name: 'Plan it' }).click()
    await expect(toast(page, /^Planned for .+, dinner$/)).toBeVisible()
    expect(await serving(page, id)).toMatchObject({ status: 'planned', plannedDate: tuesday, plannedSlot: 'dinner' })

    // Once planned, the hint has done its job.
    await page.goto('/#/week')
    await expect(dayCard(page, tuesday).getByTestId('week-meal')).toContainText('Apple strudel')
    await expect(page.getByTestId('day-suggestion')).toHaveCount(0)
  })

  test('week and month: step, jump to today, open a day', async ({ page }) => {
    const people = await openKitchen(page)
    const id = await wish(page, people, 'Capuns')
    const now = today()
    await act(page, 'planServing', id, now, 'dinner')

    await page.goto('/#/week')
    await expect(dayCard(page, now)).toHaveAttribute('aria-current', 'date')
    await expect(dayCard(page, now)).toContainText('Today')
    await expect(page.getByTestId('day')).toHaveCount(7)
    await expect(page.getByTestId('day').first()).toHaveAttribute('data-day', mondayOf(now))
    await expect(page.getByRole('button', { name: 'Jump to today' })).toBeDisabled()

    await page.getByRole('button', { name: 'Previous week' }).click()
    await expect(page.getByTestId('day').first()).toHaveAttribute('data-day', addDays(mondayOf(now), -7))
    // Past days are quiet: nothing to plan there.
    await expect(page.getByTestId('week').locator('[data-slot]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Jump to today' }).click()
    await expect(dayCard(page, now)).toBeVisible()

    await page.getByRole('radio', { name: 'Month' }).click()
    const month = page.getByTestId('month')
    await expect(month.locator('[data-day]')).toHaveCount(42)
    await expect(month.locator(`[data-day="${now}"]`)).toHaveAccessibleName(/1 meal planned/)
    // Today is open underneath; tapping another day opens that one.
    await expect(page.getByTestId('month-day').getByTestId('week-meal')).toContainText('Capuns')
    const other = now.endsWith('-15') ? `${now.slice(0, 8)}16` : `${now.slice(0, 8)}15`
    await month.locator(`[data-day="${other}"]`).click()
    await expect(page.getByTestId('month-day').getByTestId('day')).toHaveAttribute('data-day', other)
    await expect(page.getByTestId('month-day').getByTestId('week-meal')).toHaveCount(0)

    // The next month's grid starts on the Monday on or before its first day.
    await page.getByRole('button', { name: 'Next month' }).click()
    const nextMonth = new Date(Date.UTC(Number(now.slice(0, 4)), Number(now.slice(5, 7)), 1, 12)).toISOString().slice(0, 10)
    await expect(month.locator('[data-day]').first()).toHaveAttribute('data-day', mondayOf(nextMonth))
    await expect(page.getByTestId('month-day').getByTestId('day')).toHaveAttribute('data-day', nextMonth)
    await page.getByRole('button', { name: 'Jump to today' }).click()
    await expect(page.getByTestId('month-day').getByTestId('week-meal')).toContainText('Capuns')
  })
})

// ------------------------------------------------------------------- today --

test.describe('Today', () => {
  test('nothing planned: an invitation, the queue and the mini stats', async ({ page }) => {
    const people = await openKitchen(page)
    await expect(page.getByTestId('today-empty')).toContainText('Nothing planned for today')
    await expect(page.getByTestId('today-stats')).toContainText('0meals this week')

    const first = await wish(page, people, 'Rösti')
    await wish(page, people, 'Fondue')
    await wish(page, people, 'Zopf')
    const planned = await wish(page, people, 'Capuns')
    await act(page, 'setCraving', first, 4)
    await act(page, 'planServing', planned, addDays(today(), 2), 'lunch')

    // Planned meals come first, then the wishlist in its own order. Three in all.
    const rows = page.getByTestId('up-next').getByRole('button')
    await expect(rows).toHaveText([/Capuns.*lunch/, /Rösti.*Not planned yet/, /Fondue.*Not planned yet/, 'See the whole wishlist'])
    await expect(page.getByTestId('today-empty')).toContainText('The table is free. The wishlist is not.')

    // The invitation: pick today's meal right here. The wishes come first, in their order,
    // then what is planned for another day.
    await page.getByTestId('today-empty').getByRole('button', { name: "Pick today's meal" }).click()
    const picker = page.getByRole('dialog', { name: 'What shall it be?' })
    await expect(picker.getByTestId('wish-option')).toHaveText([/Rösti/, /Fondue/, /Zopf/, /Capuns.*Planned for/])
    await picker.getByRole('button', { name: 'Dinner', exact: true }).click()
    await picker.getByTestId('wish-option').first().click()
    await expect(page.getByTestId('serving-status')).toHaveText('Planned for today, dinner')

    // It is today's meal now, and still on the wishlist board with the others.
    await page.goto('/#/')
    await expect(page.getByTestId('today-meal')).toContainText('Rösti')
    await page.getByRole('navigation', { name: /^(Main|Hauptnavigation)$/ }).getByRole('button', { name: 'Wishlist' }).click()
    await expect(page).toHaveURL(/#\/wishlist$/)
    await expect.poll(() => board(page)).toEqual(['Rösti', 'Fondue', 'Zopf', 'Capuns'])
  })

  test("shows today's meal, and Served moves it to the served card", async ({ page }) => {
    const people = await openKitchen(page)
    // Leo cooks tonight, so the Served button is his.
    const id = await wish(page, people, 'Älplermagronen', { cookedBy: people.leo, note: 'Extra cheese, just for you' })
    await act(page, 'planServing', id, today(), 'dinner')

    const meal = page.getByTestId('today-meal')
    await expect(meal).toContainText('On the menu today')
    await expect(meal.getByRole('heading', { name: 'Älplermagronen' })).toBeVisible()
    await expect(meal).toContainText('Dinner')
    await expect(meal).toContainText('Extra cheese, just for you')
    await expect(page.getByTestId('today-empty')).toHaveCount(0)

    await meal.getByRole('button', { name: 'Served' }).click()
    await expect(toast(page, 'Served')).toBeVisible()

    const served = page.getByTestId('served-card')
    await expect(served.getByRole('heading', { name: 'Dinner is served' })).toBeVisible()
    await expect(served).toContainText('Älplermagronen is on the table. Over to Mia.')
    await expect(served).toContainText('Extra cheese, just for you')
    // For the cook: calm waiting, no proof button.
    await expect(served).toContainText('Waiting for proof')
    await expect(served.getByRole('button', { name: 'Take the proof photo' })).toHaveCount(0)
    await expect(page.getByTestId('today-meal')).toHaveCount(0)
    expect(await serving(page, id)).toMatchObject({ status: 'served', cookedBy: people.leo })
  })

  test('the Taster is asked for proof and lands at the camera', async ({ page }) => {
    const people = await openKitchen(page)
    const id = await wish(page, people, 'Lasagne al forno', { note: 'With the crispy corners' })
    await act(page, 'planServing', id, today(), 'lunch')
    // Mia cooks: Leo sees the plan, but no Served button.
    await expect(page.getByTestId('today-meal')).toContainText('Mia is cooking. Bring an appetite.')
    await expect(page.getByTestId('today-meal').getByRole('button', { name: 'Served' })).toHaveCount(0)

    await act(page, 'markServed', id)
    const served = page.getByTestId('served-card')
    await expect(served.getByRole('heading', { name: 'Lunch is served' })).toBeVisible()
    await expect(served).toContainText('Lasagne al forno is on the table. Proof, please.')
    await served.getByRole('button', { name: 'Take the proof photo' }).click()

    // The proof flow takes over from here (tests/e2e/review.spec.ts).
    await expect(page).toHaveURL(new RegExp(`#/review/${id}$`))
    await expect(page.getByRole('heading', { level: 1, name: 'Proof and verdict' })).toBeVisible()
  })

  test('counts eaten meals and the streak', async ({ page }) => {
    const people = await openKitchen(page)
    const now = today()
    // There is no "eaten" action before the review milestone, so these rows are written directly.
    for (const [name, daysAgo] of [['Rösti', 0], ['Fondue', 1], ['Zopf', 2], ['Capuns', 4]] as const) {
      const id = await wish(page, people, name)
      await page.evaluate(([servingId, eatenAt]) => window.__foodwishus.db.servings.update(servingId, { status: 'eaten', eatenAt }), [id, `${addDays(now, -daysAgo)}T11:00:00.000Z`] as const)
    }
    const thisWeek = [0, 1, 2, 4].filter((daysAgo) => mondayOf(addDays(now, -daysAgo)) === mondayOf(now)).length
    const stats = page.getByTestId('today-stats')
    await expect(stats).toContainText(`${thisWeek}${thisWeek === 1 ? 'meal' : 'meals'} this week`)
    await expect(stats).toContainText('3daysin a row')
    await expect(page.getByText('Eaten today')).toBeVisible()
    await expect(page.getByTestId('today-empty')).toHaveCount(0)
  })

  test('speaks German too', async ({ page }) => {
    const people = await openKitchen(page)
    const id = await wish(page, people, 'Rösti')
    await act(page, 'planServing', id, addDays(today(), 1), 'dinner')
    await page.evaluate(() => localStorage.setItem('foodwishus.lang', 'de'))
    await page.addInitScript(() => localStorage.setItem('foodwishus.lang', 'de'))
    await page.goto('/#/wishlist')
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Wunschliste' })).toBeVisible()
    await expect(page.getByTestId('wish-card')).toContainText('Geplant für morgen, Abendessen')
    await expect(page.getByTestId('wish-card')).toContainText('Deine Idee')
  })
})
