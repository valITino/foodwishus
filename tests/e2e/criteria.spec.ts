import { expect, test, type Page } from '@playwright/test'
import { kit, tabs, toast, useDemo } from './ship.helpers'

// Review criteria: what the Taster rates with spoons. Edited in Settings, asked on the
// review sheet in the same order, and kept in the Cockpit after being switched off.

const DEFAULTS = ['Taste', 'Texture', 'Smell', 'Looks', 'Portion', 'Temperature']

const rows = (page: Page) => page.getByTestId('criterion-row')
const labels = async (page: Page) => (await rows(page).allInnerTexts()).map((text) => text.split('\n')[0])
const sheet = (page: Page) => page.getByRole('dialog')

async function openCriteria(page: Page): Promise<void> {
  await page.goto('/#/settings')
  await page.getByRole('button', { name: /^Review criteria/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Review criteria' })).toBeVisible()
  await expect(rows(page)).toHaveCount(6)
}

/** A meal on the table tonight, ready for its verdict. Returns the address of its review page. */
async function serveDinner(page: Page): Promise<string> {
  const k = await kit(page)
  return k.evaluate(async (app) => {
    const mia = ((await app.db.members.toArray()) as { id: string; name: string }[]).find((m) => m.name === 'Mia')
    const dish = await app.actions.createDish({ name: 'Raclette' })
    const serving = await app.actions.proposeServing({ dishId: dish.id, cookedBy: mia?.id })
    await app.actions.markServed(serving.id)
    return `/#/review/${serving.id}`
  })
}

test('add, rename, pick an icon, reorder, switch off and on: the review sheet follows', async ({ page }) => {
  await useDemo(page, { empty: true })
  await openCriteria(page)
  expect(await labels(page)).toEqual(DEFAULTS)

  await test.step('add a criterion with a name and an icon', async () => {
    await page.getByRole('button', { name: 'Add a criterion' }).click()
    await expect(sheet(page)).toContainText('New criterion')
    // No name yet: it says what is missing instead of saving.
    await sheet(page).getByRole('button', { name: 'Add criterion' }).click()
    await expect(page.getByTestId('pairing-error')).toHaveText('Give the criterion a name, then save.')
    await page.getByLabel('Name').fill('taste')
    await sheet(page).getByRole('button', { name: 'Add criterion' }).click()
    await expect(page.getByTestId('pairing-error')).toContainText('There is already a criterion called taste.')

    await page.getByLabel('Name').fill('Crunch')
    await page.getByRole('radio', { name: 'Biscuit' }).click()
    await expect(page.getByRole('radio', { name: 'Biscuit' })).toBeChecked()
    await sheet(page).getByRole('button', { name: 'Add criterion' }).click()
    await expect(toast(page, 'Added')).toBeVisible()
    await expect(sheet(page)).toBeHidden()
    expect(await labels(page)).toEqual([...DEFAULTS, 'Crunch'])
  })

  await test.step('rename one and give it another icon', async () => {
    await page.getByRole('button', { name: 'Texture Edit' }).click()
    await expect(sheet(page)).toContainText('Edit criterion')
    await expect(page.getByLabel('Name')).toHaveValue('Texture')
    await page.getByLabel('Name').fill('Bite')
    await page.getByRole('radio', { name: 'Star' }).click()
    await sheet(page).getByRole('button', { name: 'Save criterion' }).click()
    await expect(toast(page, 'Saved')).toBeVisible()
    await expect(rows(page).nth(1)).toContainText('Bite')
    const k = await kit(page)
    expect(await k.evaluate(async (app) => ((await app.db.criteria.toArray()) as { label: string; icon: string }[]).find((c) => c.label === 'Bite')?.icon)).toBe('star')
  })

  await test.step('reorder with the keyboard: space picks up, arrows move, space drops', async () => {
    // Every key is answered aloud. The next key waits for that answer: an arrow pressed
    // before the row has arrived starts from the old place and the step is lost.
    await page.getByRole('button', { name: 'Move Crunch' }).focus()
    await page.keyboard.press('Space')
    await expect(page.getByText('Picked up Crunch.')).toBeAttached()
    for (const place of [6, 5, 4, 3, 2]) {
      await page.keyboard.press('ArrowUp')
      await expect(page.getByText(`Crunch is now number ${place} of 7.`)).toBeAttached()
    }
    await page.keyboard.press('Space')
    await expect(page.getByText('Crunch dropped at number 2.')).toBeAttached()
    await expect.poll(() => labels(page)).toEqual(['Taste', 'Crunch', 'Bite', 'Smell', 'Looks', 'Portion', 'Temperature'])
  })

  await test.step('reorder by dragging the grip', async () => {
    const from = await page.getByRole('button', { name: 'Move Temperature' }).boundingBox()
    const to = await page.getByRole('button', { name: 'Move Taste' }).boundingBox()
    if (!from || !to) throw new Error('grips not on screen')
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x + from.width / 2, from.y - 40, { steps: 6 })
    await expect(page.getByText('Picked up Temperature.').or(page.getByText(/^Temperature is now number/))).toBeAttached()
    await page.mouse.move(to.x + to.width / 2, to.y + 4, { steps: 12 })
    // Let go only once the row has arrived, or it drops where it was a moment ago.
    await expect(page.getByText('Temperature is now number 1 of 7.')).toBeAttached()
    await page.mouse.up()
    await expect(page.getByText('Temperature dropped at number 1.')).toBeAttached()
    await expect.poll(() => labels(page)).toEqual(['Temperature', 'Taste', 'Crunch', 'Bite', 'Smell', 'Looks', 'Portion'])
  })

  await test.step('switch one off: it says so, and stays in the list', async () => {
    const ask = page.getByRole('switch', { name: 'Ask about Smell' })
    await expect(ask).toBeChecked()
    await ask.click()
    await expect(ask).not.toBeChecked()
    await expect(rows(page).nth(4)).toContainText('Not asked')
    await expect(rows(page)).toHaveCount(7)
  })

  await test.step('the review sheet asks the criteria that are on, in the new order', async () => {
    await page.goto(await serveDinner(page))
    await page.getByRole('radio', { name: 'Yummy' }).click()
    await page.getByRole('button', { name: 'Add the details' }).click()
    const review = page.getByTestId('review-sheet')
    await expect(review).toBeVisible()
    // The overall rating has spoons too; the criteria are the groups after it.
    const asked = await review.getByRole('radiogroup').evaluateAll((groups) => groups.map((group) => group.getAttribute('aria-label')))
    expect(asked.filter((label) => ['Temperature', 'Taste', 'Crunch', 'Bite', 'Smell', 'Looks', 'Portion'].includes(label ?? ''))).toEqual(['Temperature', 'Taste', 'Crunch', 'Bite', 'Looks', 'Portion'])
    await expect(review.getByText('Smell')).toHaveCount(0)
  })

  await test.step('switched on again, it is asked again', async () => {
    await page.goto('/#/settings/criteria')
    await page.getByRole('switch', { name: 'Ask about Smell' }).click()
    await expect(page.getByRole('switch', { name: 'Ask about Smell' })).toBeChecked()
    await expect(page.getByTestId('criteria-page')).not.toContainText('Not asked')
  })
})

test('a criterion that was rated can only be switched off, and the Cockpit keeps its history', async ({ page }) => {
  test.setTimeout(90_000)
  await useDemo(page)
  await page.goto('/#/')
  await expect(tabs(page)).toBeVisible()
  await openCriteria(page)

  // Smell has three months of ratings: no way to remove it.
  await page.getByRole('button', { name: 'Smell Edit' }).click()
  await expect(sheet(page)).toContainText(/Rated in \d+ reviews, so it cannot be removed/)
  await expect(sheet(page).getByRole('button', { name: 'Remove criterion' })).toHaveCount(0)
  await sheet(page).getByRole('button', { name: 'Close' }).click()
  await expect(sheet(page)).toBeHidden()
  await page.getByRole('switch', { name: 'Ask about Smell' }).click()
  await expect(page.getByRole('switch', { name: 'Ask about Smell' })).not.toBeChecked()

  // A fresh one that nobody rated can go without a trace.
  await page.getByRole('button', { name: 'Add a criterion' }).click()
  await page.getByLabel('Name').fill('Typo')
  await sheet(page).getByRole('button', { name: 'Add criterion' }).click()
  await expect(rows(page)).toHaveCount(7)
  await page.getByRole('button', { name: 'Typo Edit' }).click()
  await sheet(page).getByRole('button', { name: 'Remove criterion' }).click()
  await expect(toast(page, 'Removed')).toBeVisible()
  await expect(rows(page)).toHaveCount(6)

  // The Cockpit still shows Smell: in the profile of all dishes and as a line to add.
  await page.goto('/#/cockpit')
  const profile = page.locator('[data-chart="criteria"]')
  await profile.scrollIntoViewIfNeeded()
  await expect(profile).toContainText('Smell')
  await expect(page.locator('[data-chart="ratings"]').getByRole('button', { name: 'Smell' })).toBeVisible()

  // An old review still shows what was said about the smell.
  const k = await kit(page)
  const address = await k.evaluate(async (app) => {
    const smell = ((await app.db.criteria.toArray()) as { id: string; label: string }[]).find((c) => c.label === 'Smell')
    const review = ((await app.db.reviews.toArray()) as { servingId: string; scores: Record<string, number> }[]).find((r) => smell && r.scores[smell.id] !== undefined)
    return `/#/serving/${review?.servingId}`
  })
  await page.goto(address)
  await expect(page.getByRole('term').filter({ hasText: 'Smell' }).first()).toBeVisible()
})

test('the criteria page in German', async ({ page }) => {
  await useDemo(page, { empty: true, lang: 'de' })
  await page.goto('/#/settings')
  await page.getByRole('button', { name: /^Kriterien für Bewertungen/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Kriterien für Bewertungen' })).toBeVisible()
  await expect(rows(page).first()).toContainText('Geschmack')

  // Moving a row is read aloud in German too, and escape puts it back.
  const before = await labels(page)
  await page.getByRole('button', { name: 'Geschmack verschieben' }).focus()
  await page.keyboard.press('Space')
  await expect(page.getByText('Geschmack aufgenommen.')).toBeAttached()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByText('Geschmack ist jetzt auf Platz 2 von 6.')).toBeAttached()
  await page.keyboard.press('Escape')
  await expect(page.getByText('Verschieben abgebrochen. Geschmack ist wieder am alten Platz.')).toBeAttached()
  expect(await labels(page)).toEqual(before)

  await page.getByRole('switch', { name: 'Duft abfragen' }).click()
  await expect(rows(page).nth(2)).toContainText('Wird nicht abgefragt')
  await page.getByRole('button', { name: 'Kriterium hinzufügen' }).click()
  await expect(sheet(page)).toContainText('Neues Kriterium')
  await expect(page.getByRole('radio', { name: 'Guetzli' })).toBeVisible()
})
