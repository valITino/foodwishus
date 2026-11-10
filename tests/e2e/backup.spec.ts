import { statSync } from 'node:fs'
import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test'
import { demoPhotosReady, kit, makeCouple, settle, tabs, toast, useDemo } from './ship.helpers'

// Backup: save the kitchen as one file, then bring it back somewhere else. The full demo
// kitchen is exported; it is imported into an empty kitchen on this device, and into a
// kitchen in the pretend cloud, where it has to reach the partner as well.

const contexts: BrowserContext[] = []
test.afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close()
})

interface Counts {
  dishes: number
  menus: number
  servings: number
  reviews: number
  photos: number
  pictures: number
}

async function counts(page: Page): Promise<Counts> {
  const k = await kit(page)
  return k.evaluate(async (app) => {
    const alive = async (table: string) => ((await app.db.table(table).toArray()) as { deletedAt: string | null }[]).filter((row) => !row.deletedAt).length
    return { dishes: await alive('dishes'), menus: await alive('menus'), servings: await alive('servings'), reviews: await alive('reviews'), photos: await alive('photos'), pictures: await app.db.blobs.count() }
  })
}

const openBackupPage = async (page: Page) => {
  await page.goto('/#/settings')
  await page.getByRole('button', { name: /^Backup/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Backup' })).toBeVisible()
}

/** Export the full demo kitchen in its own browser. Returns where the file was saved and what was in the kitchen. */
async function exportDemo(browser: Browser, testInfo: TestInfo, withPhotos = true): Promise<{ path: string; name: string; had: Counts }> {
  const context = await browser.newContext()
  contexts.push(context)
  await useDemo(context)
  const page = await context.newPage()
  await page.goto('/#/')
  await expect(tabs(page)).toBeVisible()
  await demoPhotosReady(page)
  const had = await counts(page)

  await openBackupPage(page)
  await expect(page.getByTestId('backup-status')).toHaveText('No backup from this device yet.')
  if (!withPhotos) await page.getByRole('switch', { name: 'Include photos' }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save backup' }).click()])
  await expect(toast(page, 'Saved')).toBeVisible()
  const name = download.suggestedFilename()
  const path = testInfo.outputPath(name)
  await download.saveAs(path)
  await expect(page.getByTestId('backup-made')).toContainText(name)
  await expect(page.getByTestId('backup-status')).toContainText('Last backup from this device:')
  return { path, name, had }
}

test('export the kitchen, then import it into an empty one: everything is back, photos included', async ({ browser, page }, testInfo) => {
  test.setTimeout(120_000)
  const { path, name, had } = await exportDemo(browser, testInfo)
  expect(name).toMatch(/^foodwishus-backup-\d{4}-\d{2}-\d{2}\.zip$/)
  expect(had.dishes).toBeGreaterThan(20)
  expect(had.photos).toBeGreaterThan(20)

  // An empty kitchen: two people, the six criteria, nothing else.
  await useDemo(page, { empty: true })
  await page.goto('/#/')
  await expect(tabs(page)).toBeVisible()
  expect(await counts(page)).toMatchObject({ dishes: 0, servings: 0, photos: 0 })

  await openBackupPage(page)
  await page.getByTestId('backup-file').setInputFiles(path)

  // First it says what is in the file and what will happen. Nothing has changed yet.
  const preview = page.getByRole('dialog', { name: 'Import this backup?' })
  await expect(preview).toBeVisible()
  await expect(preview).toContainText('From the kitchen')
  await expect(preview.getByText('Dishes').locator('..')).toContainText(String(had.dishes))
  await expect(preview.getByText('Photos', { exact: true }).locator('..')).toContainText(String(had.photos))
  await expect(preview.getByTestId('backup-plan')).toContainText('new and will be added')
  await expect(preview.getByTestId('backup-plan')).toContainText('Nothing is deleted. People, PINs and devices are never part of a backup.')
  await expect(preview.getByTestId('backup-plan')).toContainText('This backup comes from another kitchen.')
  expect((await counts(page)).dishes).toBe(0)

  await preview.getByRole('button', { name: 'Import backup' }).click()
  await expect(toast(page, 'Imported')).toBeVisible({ timeout: 60_000 })
  await expect(preview).toBeHidden()
  await expect(page.getByTestId('backup-imported')).toContainText('imported.')

  // Everything the other kitchen had is here now, and nobody was added.
  expect(await counts(page)).toEqual(had)
  const k = await kit(page)
  expect(await k.evaluate((app) => app.db.members.count())).toBe(2)
  expect(await k.evaluate((app) => app.db.criteria.count())).toBe(6)

  // And it shows: recipe cards with their covers, the photo wall, the Cockpit.
  await page.goto('/#/recipes')
  await expect(page.getByText('Älplermagronen').first()).toBeVisible()
  await page.goto('/#/photos')
  await expect(page.locator('main img').first()).toBeVisible()
  expect(await page.locator('main img').first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
  await page.goto('/#/cockpit')
  await expect(page.getByRole('heading', { level: 1, name: 'Cockpit' })).toBeVisible()
  await expect(page.getByText('Älplermagronen').first()).toBeVisible()

  // A second import of the same file finds nothing left to do.
  await openBackupPage(page)
  await page.getByTestId('backup-file').setInputFiles(path)
  await expect(preview.getByTestId('backup-nothing')).toHaveText('Everything in this file is already in your kitchen. There is nothing to import.')
  await expect(preview.getByRole('button', { name: 'Import backup' })).toHaveCount(0)
  await preview.getByRole('button', { name: 'Close' }).last().click()
  await expect(preview).toBeHidden()
  expect(await counts(page)).toEqual(had)
})

test('a file that is not a backup is refused with a reason, and nothing changes', async ({ page }) => {
  await useDemo(page, { empty: true })
  await openBackupPage(page)
  const input = page.getByTestId('backup-file')
  const complaint = page.getByTestId('pairing-error')

  await input.setInputFiles({ name: 'holiday.zip', mimeType: 'application/zip', buffer: Buffer.from('Dear diary, today we had Rösti.') })
  await expect(complaint).toContainText('This file is not a FoodwishUs backup.')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // A backup from an app of the future: a real zip with a higher format version.
  const k = await kit(page)
  /** A zip holding one backup.json with this text, built by the app's own zip writer. */
  const zipOf = (json: string) =>
    k.evaluate(
      async (_app, [path, text]) => {
        const { ZipWriter } = (await import(/* @vite-ignore */ path)) as typeof import('../../src/data/zip')
        const zip = new ZipWriter()
        await zip.add('backup.json', new TextEncoder().encode(text))
        return Array.from(new Uint8Array(await zip.finish().arrayBuffer()))
      },
      ['/src/data/zip.ts', json] as const,
    )
  const future = await zipOf(JSON.stringify({ format: 'foodwishus-backup', version: 99 }))
  await input.setInputFiles({ name: 'foodwishus-backup-2031-01-01.zip', mimeType: 'application/zip', buffer: Buffer.from(future) })
  await expect(complaint).toContainText('made with a newer version of the app')
  await expect(complaint).toContainText('Update the app')

  // A backup that was cut off halfway through the download.
  const whole = await zipOf('{"format":"foodwishus-backup","version":1,"tables":')
  await input.setInputFiles({ name: 'foodwishus-backup-2026-11-10.zip', mimeType: 'application/zip', buffer: Buffer.from(whole) })
  await expect(complaint).toContainText('This backup is damaged and cannot be read')
  await expect(complaint).toContainText('Nothing was imported')
  expect(await k.evaluate((app) => app.db.dishes.count())).toBe(0)
})

test('a backup without photos is small and imports without empty picture frames', async ({ browser, page }, testInfo) => {
  test.setTimeout(120_000)
  const { path, had } = await exportDemo(browser, testInfo, false)
  expect(statSync(path).size).toBeLessThan(2_000_000)

  await useDemo(page, { empty: true })
  await openBackupPage(page)
  await page.getByTestId('backup-file').setInputFiles(path)
  const preview = page.getByRole('dialog', { name: 'Import this backup?' })
  await expect(preview.getByText('Photos', { exact: true }).locator('..')).toContainText('Not in this file')
  await preview.getByRole('button', { name: 'Import backup' }).click()
  await expect(toast(page, 'Imported')).toBeVisible({ timeout: 60_000 })

  const now = await counts(page)
  expect(now).toMatchObject({ dishes: had.dishes, servings: had.servings, reviews: had.reviews, photos: 0, pictures: 0 })
  // Nothing points to a picture that is not there.
  const k = await kit(page)
  expect(await k.evaluate(async (app) => ((await app.db.dishes.toArray()) as { coverPhotoId: string | null }[]).filter((dish) => dish.coverPhotoId).length)).toBe(0)
  expect(await k.evaluate(async (app) => ((await app.db.servings.toArray()) as { proofPhotos: unknown[] }[]).filter((serving) => serving.proofPhotos.length > 0).length)).toBe(0)
})

test('an import into a real kitchen reaches the partner, photos and all', async ({ browser, request }, testInfo) => {
  test.setTimeout(180_000)
  const { path, had } = await exportDemo(browser, testInfo)
  await request.post('/__cloud/reset')
  const { leo, mia } = await makeCouple(browser, contexts)

  await openBackupPage(leo)
  await leo.getByTestId('backup-file').setInputFiles(path)
  const preview = leo.getByRole('dialog', { name: 'Import this backup?' })
  await expect(preview.getByTestId('backup-plan')).toContainText('Everything that is imported syncs to your partner.')
  await preview.getByRole('button', { name: 'Import backup' }).click()
  await expect(toast(leo, 'Imported')).toBeVisible({ timeout: 60_000 })
  await expect(leo.getByTestId('backup-imported')).toContainText('on their way to your partner')

  // Nothing was refused on the way to the cloud.
  await settle(leo)
  const k = await kit(leo)
  expect(await k.evaluate((app) => app.db.deadLetters.count())).toBe(0)

  // Mia's phone gets every row, and the pictures.
  const hers = await kit(mia)
  await expect
    .poll(
      async () => {
        await hers.evaluate((app) => app.sync.sync())
        return counts(mia)
      },
      { timeout: 60_000 },
    )
    .toEqual(had)
  await mia.goto('/#/recipes')
  await expect(mia.getByText('Älplermagronen').first()).toBeVisible()
  // The demo's people did not come along: still the two who live here.
  expect(await hers.evaluate(async (app) => ((await app.db.members.toArray()) as { name: string }[]).map((m) => m.name).sort())).toEqual(['Leo', 'Mia'])
})
