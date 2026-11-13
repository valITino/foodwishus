import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { kit, makeCouple, settle, tabs, useDemo, type Kit } from './ship.helpers'

// The bell: what the other one did. Two phones in the pretend cloud, then the demo
// kitchen for the look of it. News is made on the phone that receives a change.

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' })
const today = () => dayFormat.format(new Date())

const bell = (page: Page) => page.getByTestId('bell')
const lines = (page: Page) => page.getByTestId('news-line')

/** Do something through the app's own actions on this phone, and send it to the cloud. */
async function act<T>(page: Page, run: (app: Kit, arg: any) => Promise<T>, arg?: unknown): Promise<T> {
  const k = await kit(page)
  const result = await k.evaluate(run, arg)
  await settle(page)
  return result
}

/** Pull until the bell on this phone shows what is expected (the pretend cloud pushes, but a nudge is quicker). */
async function expectBell(page: Page, name: string): Promise<void> {
  const k = await kit(page)
  await expect
    .poll(async () => {
      await k.evaluate((app) => app.sync.sync())
      return bell(page).getAttribute('aria-label')
    })
    .toBe(name)
}

test.describe('two phones', () => {
  let contexts: BrowserContext[] = []
  test.beforeEach(async ({ request }) => {
    contexts = []
    await request.post('/__cloud/reset')
  })
  test.afterEach(async () => {
    for (const context of contexts) await context.close()
  })

  test('the bell tells each of them what the other one did, once, and leads to the meal', async ({ browser }) => {
    test.setTimeout(120_000)
    const { leo, mia } = await makeCouple(browser, contexts)

    await test.step('his phone was there first: her arrival is the first news', async () => {
      await expectBell(leo, 'Kitchen news, 1 new')
      await expect(bell(mia)).toHaveAccessibleName('Kitchen news')
      await bell(leo).click()
      await expect(leo.getByRole('heading', { level: 1, name: 'Kitchen news' })).toBeVisible()
      await expect(lines(leo)).toHaveText([/Mia joined the kitchen\.\s*New/])
      // Looking at it is enough: nothing is new any more.
      await leo.getByRole('button', { name: 'Back' }).click()
      await expect(bell(leo)).toHaveAccessibleName('Kitchen news')
    })

    const servingId = await test.step('she wishes for something he should cook: his bell rings, hers stays quiet', async () => {
      const id = await act(mia, async (app) => {
        const me = await app.store.memberId()
        const partner = (await app.db.members.toArray()).find((member: { id: string }) => member.id !== me)
        const dish = await app.actions.createDish({ name: 'Rösti' })
        return (await app.actions.proposeServing({ dishId: dish.id, cookedBy: partner.id })).id as string
      })
      await expectBell(leo, 'Kitchen news, 1 new')
      await expect(bell(mia)).toHaveAccessibleName('Kitchen news')

      // From another tab the number sits on Today.
      await tabs(leo).getByRole('button', { name: 'Wishlist' }).click()
      await expect(tabs(leo).getByRole('button', { name: 'Today, 1 new' })).toBeVisible()
      await tabs(leo).getByRole('button', { name: 'Today, 1 new' }).click()

      await bell(leo).click()
      // The dish came with the wish: one line, and it is worded for the one who cooks.
      await expect(lines(leo)).toHaveText([/Mia wishes for Rösti\.\s*New/, /Mia joined the kitchen\./])
      await lines(leo).first().getByRole('button').click()
      await expect(leo.getByRole('heading', { name: 'Rösti' })).toBeVisible()
      await expect(leo.getByTestId('serving-status')).toContainText('On the wishlist since')
      return id
    })

    await test.step('he plans and serves it: two lines for her, the newest on top', async () => {
      await act(leo, (app, id) => app.actions.planServing(id, new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(new Date()), 'dinner'), servingId)
      await expectBell(mia, 'Kitchen news, 1 new')
      await act(leo, (app, id) => app.actions.markServed(id), servingId)
      await expectBell(mia, 'Kitchen news, 2 new')
      // What he did himself is not news to him.
      await leo.goto('/#/')
      await expect(bell(leo)).toHaveAccessibleName('Kitchen news')

      await bell(mia).click()
      await expect(lines(mia)).toHaveText([/Leo served Rösti\. Proof, please\.\s*New/, /Rösti is planned for today, dinner\.\s*New/])
      // "Proof, please" leads straight to the camera for whoever eats.
      await lines(mia).first().getByRole('button').click()
      await expect(mia).toHaveURL(new RegExp(`#/review/${servingId}$`))
      await expect(mia.getByTestId('proof')).toBeVisible()
    })

    await test.step('syncing again and again tells nothing twice', async () => {
      for (let i = 0; i < 3; i++) {
        await settle(leo)
        await settle(mia)
      }
      await mia.goto('/#/news')
      await expect(lines(mia)).toHaveCount(2)
      await leo.goto('/#/news')
      await expect(lines(leo)).toHaveCount(2)
    })
  })
})

test('the demo kitchen has a few lines to show what the bell is for', async ({ page }) => {
  await useDemo(page)
  await page.goto('/#/')
  await expect(bell(page)).toHaveAccessibleName('Kitchen news, 2 new')
  const [bellBox, avatarBox] = await Promise.all([bell(page).boundingBox(), page.getByRole('button', { name: 'Open settings' }).boundingBox()])
  // Under the avatar, top right, and big enough for a thumb.
  expect(bellBox?.width).toBeGreaterThanOrEqual(44)
  expect(bellBox?.height).toBeGreaterThanOrEqual(44)
  expect(bellBox?.y ?? 0).toBeGreaterThan((avatarBox?.y ?? 0) + (avatarBox?.height ?? 0) - 1)
  expect(Math.abs((bellBox?.x ?? 0) + (bellBox?.width ?? 0) - ((avatarBox?.x ?? 0) + (avatarBox?.width ?? 0)))).toBeLessThan(6)

  await bell(page).click()
  await expect(lines(page)).toHaveCount(5)
  await expect(lines(page).filter({ hasText: 'New' })).toHaveCount(2)
  // Which of them is the newest depends on the day the demo is opened: its story is told
  // backwards from today. So the lines are found by what they say, not by where they stand.
  const answered = lines(page).filter({ hasText: /Mia answered your verdict on .+\./ })
  await expect(answered).toHaveCount(1)
  await expect(page.getByTestId('news')).toContainText(/Mia planned .+ for .+\./)
  await expect(page.getByTestId('news')).toContainText(/Mia put .+ on the wishlist\./)

  // A line leads to its meal, and back comes back to the list. Nothing is new any more.
  await answered.getByRole('button').click()
  await expect(page.getByTestId('verdict-card')).toBeVisible()
  await page.goBack()
  await expect(lines(page)).toHaveCount(5)
  await expect(lines(page).filter({ hasText: 'New' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(bell(page)).toHaveAccessibleName('Kitchen news')
})

test('tidying the list: tick lines one by one or all at once, and delete them', async ({ page }) => {
  await useDemo(page)
  await page.goto('/#/news')
  await expect(lines(page)).toHaveCount(5)
  const header = page.locator('header')
  const picked = page.getByTestId('news-picked')
  const boxes = page.getByTestId('news').getByRole('checkbox')

  await test.step('"Select" turns the lines into things to tick, and nothing is deleted by itself', async () => {
    await header.getByRole('button', { name: 'Select' }).click()
    await expect(picked).toHaveText('Tap the lines that can go.')
    await expect(boxes).toHaveCount(5)
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled()
    // A tap ticks, it does not open the meal.
    await boxes.nth(0).click()
    await expect(boxes.nth(0)).toBeChecked()
    await expect(page).toHaveURL(/#\/news$/)
    await expect(picked).toHaveText('1 line selected')
    await boxes.nth(2).click()
    await expect(picked).toHaveText('2 lines selected')
    // Changed her mind about one: a second tap takes the tick away.
    await boxes.nth(2).click()
    await expect(boxes.nth(2)).not.toBeChecked()
    await boxes.nth(3).click()
    await expect(picked).toHaveText('2 lines selected')
  })

  await test.step('"Done" leaves without deleting', async () => {
    await header.getByRole('button', { name: 'Done' }).click()
    await expect(boxes).toHaveCount(0)
    await expect(lines(page)).toHaveCount(5)
  })

  await test.step('the ticked lines go, the others stay', async () => {
    const second = await lines(page).nth(1).innerText()
    await header.getByRole('button', { name: 'Select' }).click()
    // Nothing is ticked from the last time.
    await expect(picked).toHaveText('Tap the lines that can go.')
    await boxes.nth(0).click()
    await boxes.nth(3).click()
    await page.getByRole('button', { name: 'Delete 2' }).click()
    await expect(page.getByText('Deleted', { exact: true }).last()).toBeVisible()
    await expect(lines(page)).toHaveCount(3)
    await expect(boxes).toHaveCount(0)
    expect(await lines(page).nth(0).innerText()).toBe(second)
    // They stay gone.
    await page.reload()
    await expect(lines(page)).toHaveCount(3)
  })

  await test.step('"Select all" ticks everything, "Select none" unticks it, and an empty list says so', async () => {
    await header.getByRole('button', { name: 'Select' }).click()
    await page.getByRole('button', { name: 'Select all' }).click()
    await expect(picked).toHaveText('3 lines selected')
    for (const box of await boxes.all()) await expect(box).toBeChecked()
    await page.getByRole('button', { name: 'Select none' }).click()
    await expect(picked).toHaveText('Tap the lines that can go.')
    await page.getByRole('button', { name: 'Select all' }).click()
    await page.getByRole('button', { name: 'Delete 3' }).click()
    await expect(page.getByText('Nothing new')).toBeVisible()
    await expect(header.getByRole('button', { name: 'Select' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(bell(page)).toHaveAccessibleName('Kitchen news')
  })
})

test('an empty bell says what will show up, and reads in German', async ({ page }) => {
  await useDemo(page, { empty: true, lang: 'de' })
  await page.goto('/#/')
  await expect(bell(page)).toHaveAccessibleName('Neues aus der Küche')
  await bell(page).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Neues aus der Küche' })).toBeVisible()
  await expect(page.getByText('Nichts Neues')).toBeVisible()
  await expect(page.getByText('Wenn die andere Person etwas vorschlägt, plant, serviert oder antwortet, steht es hier.')).toBeVisible()

  // A line that arrives is worded in German too.
  const k = await kit(page)
  await k.evaluate(async (app, day) => {
    const mia = ((await app.db.members.toArray()) as { id: string; name: string }[]).find((member) => member.name === 'Mia')
    const dish = await app.actions.createDish({ name: 'Rösti' })
    const serving = await app.actions.proposeServing({ dishId: dish.id, cookedBy: mia?.id, plan: { date: day, slot: 'dinner' } })
    await app.db.news.add({ kind: 'planned', at: new Date().toISOString(), actorId: mia?.id ?? null, servingId: serving.id, dishId: dish.id, facts: { day, slot: 'dinner' }, seenAt: null })
  }, today())
  await expect(page.getByTestId('news-line')).toHaveText(/Mia hat Rösti für heute, Abendessen eingeplant\.\s*Neu/)

  // Tidying reads in German too.
  await page.locator('header').getByRole('button', { name: 'Auswählen' }).click()
  await expect(page.getByTestId('news-picked')).toHaveText('Tippe auf die Zeilen, die weg können.')
  await page.getByRole('button', { name: 'Alle auswählen' }).click()
  await expect(page.getByTestId('news-picked')).toHaveText('1 Zeile ausgewählt')
  await page.getByRole('button', { name: 'Löschen', exact: true }).click()
  await expect(page.getByText('Gelöscht', { exact: true }).last()).toBeVisible()
  await expect(page.getByText('Nichts Neues')).toBeVisible()
})
