import { expect, test, type Browser, type Page } from '@playwright/test'
import sharp from 'sharp'

async function openPhone(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto('/#/lab')
  return page
}

/** Wait until a renamed dish is saved on this phone and has reached the cloud. */
async function settle(page: Page, dishName: string): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(async (name) => {
        const { db, sync } = (window as unknown as { __foodwishus: { db: any; sync: any } }).__foodwishus
        const saved = (await db.dishes.toArray()).some((d: { name: string }) => d.name === name)
        if (!saved) return 'not saved yet'
        await sync.sync()
        return (await db.outbox.count()) === 0 ? 'synced' : 'still sending'
      }, dishName),
    )
    .toBe('synced')
}

const dishNames = (page: Page) => page.locator('[data-testid="dish"] input[aria-label^="Name of"]')
const pending = (page: Page) => page.getByTestId('pending')
const syncState = (page: Page) => page.locator('[data-sync-state]')

test('two phones stay in sync, even when one is offline and they are never online together', async ({ browser, request }) => {
  await request.post('/__cloud/reset')
  const her = await openPhone(browser)
  const him = await openPhone(browser)

  await test.step('she starts the kitchen and he joins with her code', async () => {
    await her.getByLabel('Your name').fill('Mia')
    await her.getByRole('button', { name: 'Start our kitchen' }).click()
    await expect(her.getByTestId('members')).toHaveText('Mia')
    await her.getByRole('button', { name: 'Create invite code' }).click()
    const code = (await her.getByTestId('invite-code').textContent()) ?? ''
    expect(code).toMatch(/^[A-Z2-9]{10}$/)

    await him.getByLabel('Your name').fill('Leo')
    await him.getByLabel('Invite code').fill(code.toLowerCase())
    await him.getByRole('button', { name: 'Join with code' }).click()
    await expect(him.getByTestId('members')).toHaveText('Leo + Mia')
    await expect(her.getByTestId('members')).toHaveText('Leo + Mia')
  })

  await test.step('a dish she adds shows up on his phone by itself', async () => {
    await her.getByLabel('New dish').fill('Älplermagronen')
    await her.getByRole('button', { name: 'Add dish' }).click()
    await expect(dishNames(him)).toHaveValue('Älplermagronen')
  })

  await test.step('his phone goes offline: he keeps working, changes queue up', async () => {
    await him.context().setOffline(true)
    await him.getByLabel('Note for Älplermagronen').fill('Extra cheese')
    await him.getByLabel('Note for Älplermagronen').blur()
    await him.getByLabel('New dish').fill('Rösti')
    await him.getByRole('button', { name: 'Add dish' }).click()
    const photo = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: '#e8b04a' } })
      .jpeg()
      .toBuffer()
    await him.getByTestId('photo-input').setInputFiles({ name: 'proof.jpg', mimeType: 'image/jpeg', buffer: photo })

    await expect(dishNames(him)).toHaveCount(2)
    await expect(him.getByTestId('photo')).toHaveCount(1)
    await expect(syncState(him)).toHaveAttribute('data-sync-state', 'offline')
    await expect(pending(him)).not.toHaveText('0')
    await expect(dishNames(her)).toHaveCount(1)
  })

  await test.step('meanwhile she renames the same dish, then her phone goes offline too', async () => {
    await her.getByLabel('Name of Älplermagronen').fill('Älplermagronen deluxe')
    await her.getByLabel('Name of Älplermagronen').blur()
    await settle(her, 'Älplermagronen deluxe')
    await her.context().setOffline(true)
  })

  await test.step('his phone comes back while hers is off: everything arrives and merges', async () => {
    await him.context().setOffline(false)
    await expect(pending(him)).toHaveText('0')
    await expect(syncState(him)).toHaveAttribute('data-sync-state', 'idle')
    await expect(him.getByLabel('Name of Älplermagronen deluxe')).toHaveValue('Älplermagronen deluxe')
    await expect(him.getByLabel('Note for Älplermagronen deluxe')).toHaveValue('Extra cheese')
  })

  await test.step('her phone wakes up later and gets his note, his dish and his photo', async () => {
    await her.context().setOffline(false)
    await expect(dishNames(her)).toHaveCount(2)
    await expect(her.getByLabel('Note for Älplermagronen deluxe')).toHaveValue('Extra cheese')
    const image = her.getByTestId('photo')
    await expect(image).toHaveCount(1)
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(400)
  })

  await test.step('the photo was shrunk on the phone before upload', async () => {
    const sizes = await him.evaluate(async () => {
      const open = indexedDB.open('foodwishus')
      const db: IDBDatabase = await new Promise((resolve) => (open.onsuccess = () => resolve(open.result)))
      const all: { full: Blob; thumb: Blob }[] = await new Promise((resolve) => {
        const request = db.transaction('blobs').objectStore('blobs').getAll()
        request.onsuccess = () => resolve(request.result)
      })
      const bitmap = await createImageBitmap(all[0].full)
      return { fullBytes: all[0].full.size, thumbBytes: all[0].thumb.size, longEdge: Math.max(bitmap.width, bitmap.height) }
    })
    expect(sizes.longEdge).toBe(1600)
    expect(sizes.fullBytes).toBeLessThan(400 * 1024)
    expect(sizes.thumbBytes).toBeLessThan(sizes.fullBytes)
  })

  await test.step('after closing and reopening the app, everything is still there', async () => {
    await him.reload()
    await expect(dishNames(him)).toHaveCount(2)
    await expect(him.getByTestId('photo')).toHaveCount(1)
    await expect(him.getByTestId('members')).toHaveText('Leo + Mia')
  })
})
