import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { kit, makeCouple, settle, toast } from './ship.helpers'

// The Sync page: what is going on, in words a person can act on, and the two ways out
// for a change the cloud refused. Played by two devices against the pretend cloud.

const contexts: BrowserContext[] = []
test.afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close()
})

const refused = (page: Page) => page.getByTestId('refused-change')
const advice = (page: Page) => page.getByTestId('sync-advice')

/** A dish the cloud will refuse: it claims to belong to another kitchen. Returns its id. */
async function smuggle(page: Page, name: string): Promise<string> {
  const k = await kit(page)
  return k.evaluate(async (app, dishName) => {
    const at = new Date().toISOString()
    const id = crypto.randomUUID()
    await app.store.put('dishes', { id, householdId: crypto.randomUUID(), name: dishName, description: null, course: 'main', tags: [], effort: null, recipe: {}, nutrition: {}, coverPhotoId: null, icon: null, createdBy: null, archived: false, createdAt: at, updatedAt: at, deletedAt: null })
    await app.sync.sync()
    return id
  }, name)
}

async function openSync(page: Page): Promise<void> {
  await page.goto('/#/settings')
  await page.getByTestId('sync-section').getByRole('button', { name: /^Sync details/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Sync' })).toBeVisible()
}

test('refused changes are listed in plain words, with "Try again" and "Discard"', async ({ browser, request }) => {
  test.setTimeout(120_000)
  await request.post('/__cloud/reset')
  const { leo, mia } = await makeCouple(browser, contexts)
  await settle(leo)
  const k = await kit(leo)

  await test.step('all is well: it says so, and what that means', async () => {
    await openSync(leo)
    await expect(advice(leo)).toHaveText('Everything you changed is in the cloud. Your partner gets it the next time their app is open.')
    await expect(leo.getByTestId('sync-stuck')).toHaveText('0')
    await expect(leo.getByTestId('refused')).toHaveCount(0)
    await expect(leo.getByText('No names, dishes or notes.')).toBeVisible()
  })

  let dishId = ''
  await test.step('the cloud says no twice: a new dish and a change to the profile', async () => {
    dishId = await smuggle(leo, 'Smuggled soup')
    await k.evaluate(async (app) => {
      const me = await app.store.memberId()
      await app.store.patch('members', me, { status: 'h'.repeat(61) })
      await app.sync.sync()
    })
    // Settings points at it.
    await leo.goto('/#/settings')
    await expect(leo.getByTestId('sync-words')).toHaveText('2 changes were refused and wait for you.')
    await leo.getByTestId('sync-section').getByRole('button', { name: /^Sync details/ }).click()

    await expect(advice(leo)).toContainText('The cloud said no to 2 changes.')
    await expect(leo.getByTestId('sync-stuck')).toHaveText('2')
    await expect(refused(leo)).toHaveCount(2)
    await expect(refused(leo).nth(0)).toContainText('A new dish: Smuggled soup')
    await expect(refused(leo).nth(0)).toContainText(/Refused: Today, \d\d:\d\d/)
    await expect(refused(leo).nth(1)).toContainText('A change to your profile')
    await expect(leo.getByTestId('refused')).toContainText('"Try again" sends a change once more. "Discard" gives up on it for good.')
    // The refused dish is still on this device, and Mia has never seen it.
    expect(await k.evaluate((app, id) => app.db.dishes.get(id).then((dish: { name: string }) => dish?.name), dishId)).toBe('Smuggled soup')
  })

  await test.step('"Try again" while the reason is still there: the change comes back, nothing is lost', async () => {
    await leo.getByRole('button', { name: 'Try again: A new dish: Smuggled soup' }).click()
    await expect(toast(leo, 'Trying again')).toBeVisible()
    await expect.poll(() => k.evaluate((app) => app.db.outbox.count())).toBe(0)
    await expect(refused(leo)).toHaveCount(2)
    await expect(leo.getByTestId('refused')).toContainText('A new dish: Smuggled soup')
  })

  await test.step('"Try again" once the reason is gone: it reaches the cloud and the partner', async () => {
    await k.evaluate(async (app, id) => app.db.dishes.update(id, { householdId: await app.store.householdId() }), dishId)
    await leo.getByRole('button', { name: 'Try again: A new dish: Smuggled soup' }).click()
    await expect(refused(leo)).toHaveCount(1)
    await expect(leo.getByTestId('sync-stuck')).toHaveText('1')
    const hers = await kit(mia)
    await expect
      .poll(async () => {
        await hers.evaluate((app) => app.sync.sync())
        return hers.evaluate((app, id) => app.db.dishes.get(id).then((dish: { name: string } | undefined) => dish?.name ?? null), dishId)
      })
      .toBe('Smuggled soup')
  })

  await test.step('"Discard" asks first, says what happens, and then the change is gone', async () => {
    await leo.getByRole('button', { name: 'Discard: A change to your profile' }).click()
    const sheet = leo.getByRole('dialog', { name: 'Discard this change?' })
    await expect(sheet).toContainText('A change to your profile')
    await expect(sheet).toContainText('The change is dropped for good. Everything else stays as you see it now.')
    await sheet.getByRole('button', { name: 'Keep it' }).click()
    await expect(sheet).toBeHidden()
    await expect(refused(leo)).toHaveCount(1)

    await leo.getByRole('button', { name: 'Discard: A change to your profile' }).click()
    await sheet.getByRole('button', { name: 'Discard change' }).click()
    await expect(toast(leo, 'Discarded')).toBeVisible()
    await expect(leo.getByTestId('refused')).toHaveCount(0)
    await expect(advice(leo)).toContainText('Everything you changed is in the cloud.')
  })

  await test.step('discarding something new needs the cloud: offline it stays, online it leaves this device', async () => {
    const ghost = await smuggle(leo, 'Ghost gratin')
    await expect(refused(leo)).toHaveCount(1)
    await leo.context().setOffline(true)
    await leo.getByRole('button', { name: 'Discard: A new dish: Ghost gratin' }).click()
    const sheet = leo.getByRole('dialog', { name: 'Discard this change?' })
    await expect(sheet).toContainText('It never reached the cloud, so your partner has not seen it.')
    await sheet.getByRole('button', { name: 'Discard change' }).click()
    await expect(leo.getByTestId('pairing-error')).toHaveText('Discarding needs a connection, so the cloud can be asked what it has. Go online and try again.')
    await expect(refused(leo)).toHaveCount(1)
    expect(await k.evaluate((app, id) => app.db.dishes.get(id).then(Boolean), ghost)).toBe(true)

    await leo.context().setOffline(false)
    await leo.getByRole('button', { name: 'Discard: A new dish: Ghost gratin' }).click()
    await sheet.getByRole('button', { name: 'Discard change' }).click()
    await expect(toast(leo, 'Discarded')).toBeVisible()
    await expect(leo.getByTestId('refused')).toHaveCount(0)
    expect(await k.evaluate((app, id) => app.db.dishes.get(id).then(Boolean), ghost)).toBe(false)
  })

  await test.step('"Copy details" has what support needs and nothing a person typed', async () => {
    await smuggle(leo, 'Secret family recipe')
    await expect(refused(leo)).toHaveCount(1)
    await leo.getByRole('button', { name: 'Copy details' }).click()
    await expect(toast(leo, 'Copied')).toBeVisible()
    const report = await leo.evaluate(() => navigator.clipboard.readText())
    expect(report).toMatch(/^FoodwishUs sync report\nApp: \d+\.\d+\.\d+ \(fake\)\n/)
    expect(report).toMatch(/State: (idle|syncing)/)
    expect(report).toMatch(/Last sync: \d{4}-\d\d-\d\dT/)
    expect(report).toContain('Changes waiting: 0')
    expect(report).toContain('Refused changes: 1')
    expect(report).toContain('Last error: none')
    expect(report).toMatch(/Rows: households 1, members 2, criteria 6, dishes \d+/)
    expect(report).toMatch(/Refused: put dishes, forbidden, \d{4}-/)
    for (const personal of ['Secret family recipe', 'Smuggled', 'Leo', 'Mia', 'Casa Leo']) expect(report).not.toContain(personal)
  })
})

test('waiting changes and being offline are explained, and the demo kitchen says it never syncs', async ({ browser, request, page }) => {
  await request.post('/__cloud/reset')
  const { leo } = await makeCouple(browser, contexts)
  await settle(leo)
  await openSync(leo)

  await leo.context().setOffline(true)
  const k = await kit(leo)
  await k.evaluate(async (app) => {
    await app.actions.createDish({ name: 'Rösti' })
    await app.actions.createDish({ name: 'Zopf' })
    await app.sync.sync()
  })
  await expect(leo.getByTestId('sync-pending')).toHaveText('2')
  await expect(advice(leo)).toHaveText('This device has no connection right now. Carry on as usual: everything is saved here and goes out by itself once you are back online.')
  await leo.getByRole('button', { name: 'Sync now' }).click()
  await expect(toast(leo, 'Still offline. Your changes are safe on this device.')).toBeVisible()

  await leo.context().setOffline(false)
  await expect(leo.getByTestId('sync-pending')).toHaveText('0')
  await expect(advice(leo)).toContainText('Everything you changed is in the cloud.')

  // The demo kitchen has no cloud at all.
  await page.addInitScript(() => {
    localStorage.setItem('foodwishus.prefs', '{"demoData":true,"demoEmpty":true}')
    localStorage.setItem('foodwishus.lang', 'en')
  })
  await page.goto('/#/settings/sync')
  await expect(page.getByTestId('sync-page')).toHaveText('The demo kitchen lives on this device only. Nothing here syncs.')
  await expect(page.getByRole('button', { name: 'Sync now' })).toHaveCount(0)
})
