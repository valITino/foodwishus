import { expect, test } from '@playwright/test'

// Things every screen shares.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('foodwishus.prefs', '{"demoData":true,"demoEmpty":true}')
    localStorage.setItem('foodwishus.lang', 'en')
  })
})

test("Android's back button closes a sheet instead of leaving the page", async ({ page }) => {
  await page.goto('/#/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Leo')
  await page.getByRole('navigation').getByRole('button', { name: 'Wishlist' }).click()
  await expect(page).toHaveURL(/#\/wishlist$/)

  await page.getByRole('button', { name: 'Add something' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()

  await page.goBack()
  await expect(sheet).toBeHidden()
  await expect(page).toHaveURL(/#\/wishlist$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Wishlist' })).toBeVisible()

  // With nothing open, back leaves as usual.
  await page.goBack()
  await expect(page).not.toHaveURL(/#\/wishlist$/)
})

test('an address that leads nowhere goes home', async ({ page }) => {
  await page.goto('/#/no/such/page')
  await expect(page).toHaveURL(/#\/$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Leo')
  await expect(page.getByRole('navigation')).toBeVisible()
})

test('a sheet never leaves a dead step in the history', async ({ page }) => {
  await page.goto('/#/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Leo')
  await page.getByRole('navigation').getByRole('button', { name: 'Recipes' }).click()
  await expect(page).toHaveURL(/#\/recipes$/)
  const sheet = page.getByRole('dialog')

  // Closed with a tap on its close button: the next back press leaves the page in one step.
  await page.getByRole('button', { name: 'Add something' }).click()
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(sheet).toBeHidden()
  expect(await page.evaluate(() => (window.history.state as { layer?: number } | null)?.layer)).toBeUndefined()

  // Moving on from inside the sheet: one press of back returns to where the sheet was opened.
  await page.getByRole('button', { name: 'Add something' }).click()
  await sheet.getByRole('button', { name: /A new dish/ }).click()
  await expect(page).toHaveURL(/#\/recipes\/new$/)
  await expect(sheet).toBeHidden()
  await page.goBack()
  await expect(page).toHaveURL(/#\/recipes$/)
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('navigation')).toBeVisible()

  // Open, back, open, back: the sheet answers every time.
  for (let round = 0; round < 2; round++) {
    await page.getByRole('button', { name: 'Add something' }).click()
    await expect(sheet).toBeVisible()
    await page.goBack()
    await expect(sheet).toBeHidden()
    await expect(page).toHaveURL(/#\/recipes$/)
  }
})
