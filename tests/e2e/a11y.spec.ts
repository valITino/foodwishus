import { expect, test, type Page } from '@playwright/test'
import { kit, useDemo } from './ship.helpers'

// A guard for the basics on every main screen, at the narrowest phone we design for:
//   - every control has a name (read from the browser's accessibility tree)
//   - nothing scrolls sideways at 360 px
//   - exactly one h1
// English and German, because German words are longer. Sheets get the first two checks.

test.use({ viewport: { width: 360, height: 740 } })

const CONTROLS = ['button', 'link', 'textbox', 'searchbox', 'switch', 'radio', 'checkbox', 'combobox', 'slider', 'spinbutton', 'tab', 'menuitem', 'option']

/** Controls the accessibility tree lists without a name, as "role" or "role near 'text'". */
async function unnamed(page: Page, scope = 'body'): Promise<string[]> {
  const tree = await page.locator(scope).first().ariaSnapshot()
  const found: string[] = []
  for (const line of tree.split('\n')) {
    // A named control reads `- button "Save dish"`. One without a name is just `- button` (or `- button:` with children).
    const match = /^\s*- (\w+)(?: \[[^\]]*\])*:?\s*(.*)$/.exec(line)
    if (!match || !CONTROLS.includes(match[1])) continue
    const rest = match[2].trim()
    if (rest.startsWith('"') || rest.startsWith("'") || rest.startsWith('/')) continue
    // `- textbox: typed value` has a value but no name; `- button: text` has text content as its name.
    if (rest && !['textbox', 'searchbox', 'combobox', 'spinbutton', 'slider'].includes(match[1])) continue
    found.push(line.trim())
  }
  return found
}

async function basics(page: Page, name: string, options: { sheet?: boolean } = {}): Promise<void> {
  expect.soft(await unnamed(page, options.sheet ? '[role="dialog"]' : 'body'), `${name}: controls without a name`).toEqual([])
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  expect.soft(width.scroll, `${name}: scrolls sideways`).toBeLessThanOrEqual(width.client)
  if (!options.sheet) await expect.soft(page.locator('h1:visible'), `${name}: one h1`).toHaveCount(1)
}

interface Ids {
  dish: string
  menu: string
  wish: string
  planned: string
  eaten: string
  served: string
}

/** Addresses of one example of everything in the demo kitchen, plus one meal that is on the table right now. */
async function examples(page: Page): Promise<Ids> {
  const k = await kit(page)
  return k.evaluate(async (app) => {
    const alive = <T extends { deletedAt: string | null }>(rows: T[]) => rows.filter((row) => !row.deletedAt)
    const dishes = alive((await app.db.dishes.toArray()) as { id: string; deletedAt: string | null; recipe: { steps?: unknown[] } }[])
    const menus = alive((await app.db.menus.toArray()) as { id: string; deletedAt: string | null }[])
    const servings = alive((await app.db.servings.toArray()) as { id: string; status: string; deletedAt: string | null }[])
    const chef = ((await app.db.members.toArray()) as { id: string; defaultRole: string }[]).find((member) => member.defaultRole === 'chef')
    const fresh = await app.actions.createDish({ name: 'Guard soup' })
    const served = await app.actions.proposeServing({ dishId: fresh.id, cookedBy: chef?.id })
    await app.actions.markServed(served.id)
    const by = (status: string) => servings.find((serving) => serving.status === status)?.id ?? ''
    return { dish: (dishes.find((dish) => (dish.recipe.steps ?? []).length > 2) ?? dishes[0]).id, menu: menus[0].id, wish: by('wishlist'), planned: by('planned'), eaten: by('eaten'), served: served.id }
  })
}

for (const lang of ['en', 'de'] as const) {
  test(`every screen of the kitchen keeps the basics (${lang})`, async ({ page }) => {
    test.setTimeout(180_000)
    await useDemo(page, { lang })
    await page.goto('/#/')
    const nav = page.getByRole('navigation', { name: lang === 'de' ? 'Hauptnavigation' : 'Main' })
    await expect(nav).toBeVisible()
    const ids = await examples(page)

    const screens: [name: string, path: string][] = [
      ['Today', '/'],
      ['Wishlist', '/wishlist'],
      ['Our Week', '/week'],
      ['Cockpit', '/cockpit'],
      ['Recipe Book', '/recipes'],
      ['dish', `/recipes/${ids.dish}`],
      ['dish editor', `/recipes/${ids.dish}/edit`],
      ['new dish', '/recipes/new'],
      ['recipe from a link', '/recipes/import'],
      ['cook mode', `/recipes/${ids.dish}/cook`],
      ['menu', `/menus/${ids.menu}`],
      ['menu editor', `/menus/${ids.menu}/edit`],
      ['new menu', '/menus/new'],
      ['propose a dish', `/propose/dish/${ids.dish}`],
      ['propose a menu', `/propose/menu/${ids.menu}`],
      ['meal page, a wish', `/serving/${ids.wish}`],
      ['meal page, planned', `/serving/${ids.planned}`],
      ['meal page, eaten', `/serving/${ids.eaten}`],
      ['meal page, served', `/serving/${ids.served}`],
      ['meal page, gone', '/serving/00000000-0000-4000-8000-000000000000'],
      ['proof and verdict', `/review/${ids.served}`],
      ['verdict, sealed', `/review/${ids.eaten}`],
      ['photo wall', '/photos'],
      ['kitchen news', '/news'],
      ['basket', '/basket'],
      ['pantry', '/basket?view=pantry'],
      ['ask Fork', '/fork'],
      ['dish in numbers', `/cockpit/dish/${ids.dish}`],
      ['Settings', '/settings'],
      ['my profile', '/settings/profile'],
      ['review criteria', '/settings/criteria'],
      ['backup', '/settings/backup'],
      ['sync', '/settings/sync'],
    ]
    for (const [name, path] of screens) {
      await page.goto(`/#${path}`)
      await expect(page.locator('h1:visible').first(), `${name}: has a title`).toBeVisible()
      // Loading states have a title too: wait for the page itself.
      await expect(page.getByRole('status').filter({ hasText: /Something is cooking|Da köchelt etwas/ })).toHaveCount(0)
      await basics(page, `${name} (${lang})`)
    }

    // Sheets: the add sheet, the choice of a meal, a criterion, and the review details.
    await page.goto('/#/')
    await page.getByRole('button', { name: lang === 'de' ? 'Etwas hinzufügen' : 'Add something' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await basics(page, `add sheet (${lang})`, { sheet: true })
    await page.getByRole('dialog').getByRole('button', { name: lang === 'de' ? /Ein Essen für heute/ : /A meal for today/ }).click()
    await expect(page.getByRole('dialog').getByTestId('pick-when')).toBeVisible()
    await basics(page, `meal picker (${lang})`, { sheet: true })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await page.goto('/#/settings/criteria')
    await page.getByTestId('criterion-row').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await basics(page, `criterion sheet (${lang})`, { sheet: true })

    await page.goto(`/#/review/${ids.served}`)
    await page.getByRole('radiogroup').first().getByRole('radio').nth(4).click()
    await page.getByRole('button', { name: /Add the details|Details ergänzen|Details/ }).first().click()
    await expect(page.getByTestId('review-sheet')).toBeVisible()
    await basics(page, `review sheet (${lang})`, { sheet: true })
  })
}

test('the start screens keep the basics, and so do the pages that need a real kitchen', async ({ page, request }) => {
  test.setTimeout(120_000)
  await request.post('/__cloud/reset')
  await page.addInitScript(() => {
    if (!localStorage.getItem('foodwishus.lang')) localStorage.setItem('foodwishus.lang', 'en')
    if (!localStorage.getItem('foodwishus.theme')) localStorage.setItem('foodwishus.theme', 'light')
  })
  const next = () => page.getByRole('button', { name: 'Next', exact: true }).click()

  await page.goto('/#/')
  await expect(page.getByRole('button', { name: 'Start from scratch' })).toBeVisible()
  await basics(page, 'start')
  await page.goto('/#/login')
  await expect(page.getByLabel('Your name')).toBeVisible()
  await basics(page, 'log in')
  await page.goto('/#/join')
  await expect(page.locator('h1:visible')).toHaveCount(1)
  await basics(page, 'join with a code')

  // Open a kitchen, checking each step of the way.
  await page.goto('/#/')
  await page.getByRole('button', { name: 'Start from scratch' }).click()
  await expect(page.getByTestId('wizard-step')).toHaveText('Step 1 of 4')
  await basics(page, 'wizard, step 1')
  await page.getByRole('radio', { name: /I hold the fork/ }).click()
  await page.getByLabel('Kitchen name').fill('Casa Leo')
  await next()
  await expect(page.getByTestId('wizard-step')).toHaveText('Step 2 of 4')
  await basics(page, 'wizard, step 2')
  await page.getByLabel('Your name').fill('Leo')
  await next()
  await expect(page.getByTestId('wizard-step')).toHaveText('Step 3 of 4')
  await basics(page, 'wizard, step 3')
  await next()
  await expect(page.getByTestId('wizard-step')).toHaveText('Step 4 of 4')
  await basics(page, 'wizard, step 4')
  await page.getByLabel('PIN', { exact: true }).fill('314159')
  await page.getByLabel('Repeat PIN', { exact: true }).fill('314159')
  await page.getByRole('button', { name: 'Open the kitchen' }).click()
  await expect(page.getByRole('heading', { name: 'Your kitchen is open' })).toBeVisible()
  await basics(page, 'the kitchen is open')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('navigation', { name: /^(Main|Hauptnavigation)$/ })).toBeVisible()

  for (const [name, path, landmark] of [
    ['Today, empty', '/', 'navigation'],
    ['Settings', '/settings', 'main'],
    ['people', '/settings/people', 'main'],
    ['invite', '/settings/invite', 'main'],
    ['PIN and devices', '/settings/pin', 'main'],
    ['notifications', '/settings/notifications', 'main'],
    ['sync', '/settings/sync', 'main'],
  ] as const) {
    await page.goto(`/#${path}`)
    await expect(page.getByRole(landmark).first()).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'Something is cooking' })).toHaveCount(0)
    await basics(page, name)
  }
})

test('focus is never lost: a sheet takes it and gives it back, a new page hands it to its title', async ({ page }) => {
  await useDemo(page, { empty: true })
  await page.goto('/#/settings/criteria')
  const inDialog = () => page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))
  const focused = () => page.evaluate(() => (document.activeElement?.getAttribute('aria-label') ?? (document.activeElement as HTMLElement | null)?.innerText ?? '').replace(/\s+/g, ' ').trim())

  // Opened with the keyboard, the sheet has the focus, and Tab goes round inside it.
  const opener = page.getByRole('button', { name: 'Add a criterion' })
  await opener.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'New criterion' })).toBeVisible()
  expect(await inDialog()).toBe(true)
  for (let i = 0; i < 24; i++) {
    await page.keyboard.press('Tab')
    expect(await inDialog(), `Tab ${i + 1} stays in the sheet`).toBe(true)
  }
  await page.keyboard.press('Shift+Tab')
  expect(await inDialog()).toBe(true)

  // Escape closes it and focus is back on the button that opened it.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(opener).toBeFocused()

  // The same with a row of the list, closed by its close button.
  const row = page.getByRole('button', { name: 'Taste Edit' })
  await row.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Edit criterion' })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(row).toBeFocused()

  // Going to another page by keyboard: the button that was pressed is gone, the title has the focus.
  await page.goto('/#/settings')
  await page.getByRole('button', { name: /^Backup/ }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: 'Backup' })).toBeFocused()
  expect(await focused()).toBe('Backup')
  // The next Tab carries on from the top of the page.
  await page.keyboard.press('Tab')
  await expect(page.getByRole('switch', { name: 'Include photos' })).toBeFocused()
})
