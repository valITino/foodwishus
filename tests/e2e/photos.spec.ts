import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { kit, tabs, toast, useDemo } from './ship.helpers'

// Photos for Fork to look at: of what is at home (the pantry), of a recipe (the reader),
// and with a question (Ask Fork). One phone in a kitchen in the pretend cloud. Behind
// the real helper function stands the stand-in for the AI, which cannot see: it tells one
// photo from several, and a blank one from a real one (src/data/fake/pretendWeb.ts).

const MIA = { name: 'Mia', pin: '271828', kitchen: 'Casa Mia' }

async function openKitchen(browser: Browser, contexts: BrowserContext[]): Promise<Page> {
  const context = await browser.newContext()
  contexts.push(context)
  await context.addInitScript(() => {
    if (!localStorage.getItem('foodwishus.lang')) localStorage.setItem('foodwishus.lang', 'en')
    if (!localStorage.getItem('foodwishus.theme')) localStorage.setItem('foodwishus.theme', 'light')
  })
  const page = await context.newPage()
  const next = () => page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.goto('/#/')
  await page.getByRole('button', { name: 'Start from scratch' }).click()
  await page.getByRole('radio', { name: /I hold the fork/ }).click()
  await page.getByLabel('Kitchen name').fill(MIA.kitchen)
  await next()
  await page.getByLabel('Your name').fill(MIA.name)
  await next()
  await next()
  await page.getByLabel('PIN', { exact: true }).fill(MIA.pin)
  await page.getByLabel('Repeat PIN', { exact: true }).fill(MIA.pin)
  await page.getByRole('button', { name: 'Open the kitchen' }).click()
  await expect(page.getByRole('heading', { name: 'Your kitchen is open' })).toBeVisible()
  await page.goto('/#/')
  await expect(tabs(page)).toBeVisible()
  return page
}

interface Shot {
  name: string
  mimeType: string
  buffer: Buffer
}

/** A photo as a phone would hand it over: a JPEG with something on it, painted in the page. */
async function shot(page: Page, name: string, width = 1200, height = 900): Promise<Shot> {
  const base64 = await page.evaluate(
    async ([w, h]) => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const c = canvas.getContext('2d')!
      c.fillStyle = '#f4ead9'
      c.fillRect(0, 0, w, h)
      // Shelves and things on them, so the picture does not shrink to nothing.
      for (let i = 0; i < 40; i++) {
        c.fillStyle = `hsl(${(i * 47) % 360} 60% ${40 + (i % 5) * 8}%)`
        c.fillRect((i * 97) % (w - 80), (i * 61) % (h - 80), 40 + (i % 7) * 12, 50 + (i % 4) * 20)
      }
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.9))
      let text = ''
      for (const byte of new Uint8Array(await blob.arrayBuffer())) text += String.fromCharCode(byte)
      return btoa(text)
    },
    [width, height] as const,
  )
  return { name, mimeType: 'image/jpeg', buffer: Buffer.from(base64, 'base64') }
}

/** A photo with nothing on it: one pale pixel. The stand-in "sees" nothing on anything this small. */
const blank = (page: Page) => shot(page, 'blank.jpg', 1, 1)

const pantryRows = (page: Page) => page.getByTestId('pantry-row')
const seen = (page: Page) => page.getByTestId('seen-line')
const picked = (page: Page) => page.getByTestId('picked-photos').getByRole('img')
const said = (page: Page, who: 'me' | 'fork') => page.getByTestId(`said-${who}`)
const offers = (page: Page) => page.getByTestId('offers').last()
const setHelper = (page: Page, query: string) => page.request.post(`/__cloud/helper-setup?${query}`)

async function openShow(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Show Fork a photo' }).click()
  await expect(page.getByRole('dialog', { name: 'Show Fork a photo' })).toBeVisible()
}

let contexts: BrowserContext[] = []
test.beforeEach(async ({ request }) => {
  contexts = []
  await request.post('/__cloud/reset')
})
test.afterEach(async () => {
  for (const context of contexts) await context.close()
})

test('the pantry from a photo: Fork lists what he sees, she looks it over, then it is noted', async ({ browser }) => {
  const page = await openKitchen(browser, contexts)
  await page.goto('/#/basket?view=pantry')
  const sheet = page.getByRole('dialog', { name: 'Show Fork a photo' })

  await test.step('the sheet says what to photograph and where the photo goes', async () => {
    await openShow(page)
    await expect(sheet).toContainText('One photo of the open fridge or a shelf, or up to four photos of single things.')
    await expect(sheet).toContainText('The photos go to the AI (Claude) for this one look and are kept nowhere.')
    await expect(sheet.getByRole('button', { name: 'Let Fork look' })).toBeDisabled()
    // The camera opens the camera, the other button the pictures on the phone, several at once.
    await expect(page.getByTestId('pantry-photo-camera')).toHaveAttribute('capture', 'environment')
    await expect(page.getByTestId('pantry-photo-gallery')).toHaveAttribute('multiple', '')
  })

  await test.step('one photo of the fridge: four things, one of them wrong, and a word about what he cannot see', async () => {
    await page.getByTestId('pantry-photo-camera').setInputFiles(await shot(page, 'fridge.jpg'))
    await expect(picked(page)).toHaveCount(1)
    await expect(picked(page)).toHaveAccessibleName('Photo 1 of 1')
    await sheet.getByRole('button', { name: 'Let Fork look' }).click()
    await expect(seen(page)).toHaveText([/Milk\s*1 l/, /Eggs\s*6/, /Butter\s*opened/, /Carrots/])
    await expect(page.getByTestId('seen-note')).toHaveText('I cannot see what stands at the back.')
    // Nothing is in the pantry before she says so.
    const k = await kit(page)
    expect(await k.evaluate(async (app) => (await app.db.pantry.toArray()).length)).toBe(0)
    await sheet.getByRole('button', { name: 'Not needed: Butter' }).click()
    await expect(seen(page)).toHaveCount(3)
    await sheet.getByRole('button', { name: 'Put it into the pantry' }).click()
    await expect(toast(page, '3 noted')).toBeVisible()
    await expect(pantryRows(page)).toHaveText([/Carrots/, /Eggs\s*6/, /Milk\s*1 l/])
  })

  await test.step('several photos of single things: one line each, and a photo can be taken out again', async () => {
    await openShow(page)
    // Nothing is left over from the last time.
    await expect(page.getByTestId('picked-photos')).toHaveCount(0)
    await page.getByTestId('pantry-photo-gallery').setInputFiles([await shot(page, 'flour.jpg'), await shot(page, 'sugar.jpg'), await shot(page, 'oil.jpg')])
    await expect(picked(page)).toHaveCount(3)
    await sheet.getByRole('button', { name: 'Remove photo 2' }).click()
    await expect(picked(page)).toHaveCount(2)
    await sheet.getByRole('button', { name: 'Let Fork look' }).click()
    await expect(seen(page)).toHaveText([/Flour\s*1 kg/, /Sugar\s*500 g/])
    // Not what she meant: back to the photos, with none picked.
    await sheet.getByRole('button', { name: 'Other photos' }).click()
    await expect(page.getByTestId('picked-photos')).toHaveCount(0)
    await expect(sheet.getByRole('button', { name: 'Let Fork look' })).toBeDisabled()
  })

  await test.step('four at most: the fifth is left out and the buttons rest', async () => {
    const five = await Promise.all(['a', 'b', 'c', 'd', 'e'].map((name) => shot(page, `${name}.jpg`, 400, 300)))
    await page.getByTestId('pantry-photo-gallery').setInputFiles(five)
    await expect(picked(page)).toHaveCount(4)
    await expect(sheet.getByRole('button', { name: 'Take a photo' })).toBeDisabled()
    await expect(sheet.getByRole('button', { name: 'Choose photos' })).toBeDisabled()
    for (const n of [4, 3, 2, 1]) await sheet.getByRole('button', { name: `Remove photo ${n}` }).click()
    await expect(page.getByTestId('picked-photos')).toHaveCount(0)
  })

  await test.step('a photo with nothing on it, and a file that is no picture, are said in words', async () => {
    await page.getByTestId('pantry-photo-gallery').setInputFiles(await blank(page))
    await sheet.getByRole('button', { name: 'Let Fork look' }).click()
    await expect(page.getByTestId('show-problem')).toHaveText('I cannot make out any food in the photo.')
    await sheet.getByRole('button', { name: 'Remove photo 1' }).click()
    await page.getByTestId('pantry-photo-gallery').setInputFiles({ name: 'holiday.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('Dear diary, today we had Rösti.') })
    await sheet.getByRole('button', { name: 'Let Fork look' }).click()
    await expect(page.getByTestId('show-problem')).toHaveText('One of these is not a picture this phone can read. Take the photo with the camera.')
  })

  await test.step('without the helper, and without a connection, it says why', async () => {
    await sheet.getByRole('button', { name: 'Remove photo 1' }).click()
    await page.getByTestId('pantry-photo-gallery').setInputFiles(await shot(page, 'fridge.jpg'))
    await setHelper(page, 'key=')
    await sheet.getByRole('button', { name: 'Let Fork look' }).click()
    await expect(page.getByTestId('show-problem')).toHaveText('The AI helper is not set up for this kitchen yet. Add one thing at a time.')
    await setHelper(page, 'key=pretend-key')
    await page.context().setOffline(true)
    await sheet.getByRole('button', { name: 'Let Fork look' }).click()
    await expect(page.getByTestId('show-problem')).toContainText('No connection.')
    await page.context().setOffline(false)
    // The photo is still picked: one more tap, and it works.
    await sheet.getByRole('button', { name: 'Let Fork look' }).click()
    await expect(seen(page)).toHaveCount(4)
  })
})

test('a recipe from photos: two pages become one dish to look over', async ({ browser }) => {
  const page = await openKitchen(browser, contexts)

  await test.step('the reader has two ways: a link, or a photo', async () => {
    await tabs(page).getByRole('button', { name: 'Add something' }).click()
    await page.getByRole('button', { name: /^A recipe from a link or a photo/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Recipe from a link' })).toBeVisible()
    await page.getByRole('radio', { name: 'A photo' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Recipe from a photo' })).toBeVisible()
    await expect(page.getByText('Photograph the recipe: a page of a cookbook, a handwritten card or a screenshot.')).toBeVisible()
    await expect(page.getByTestId('recipe-photos')).toContainText('The photos go to the AI (Claude) for this one reading and are kept nowhere.')
    // No link field, and no picture to bring along: the photo is of a page, not of the dish.
    await expect(page.getByLabel('Link to the recipe')).toBeHidden()
    await expect(page.getByRole('switch', { name: 'Bring the picture along' })).toHaveCount(0)
    await expect(page.getByRole('switch', { name: 'Write it in English' })).toBeChecked()
    await expect(page.getByRole('button', { name: 'Read recipe' })).toBeDisabled()
  })

  await test.step('a photo with no recipe on it: said plainly, with the way by hand', async () => {
    await page.getByTestId('recipe-photo-camera').setInputFiles(await blank(page))
    await page.getByRole('button', { name: 'Read recipe' }).click()
    await expect(page.getByTestId('link-problem')).toContainText('Fork found no recipe on that. Photograph the whole recipe, straight from above and with enough light.')
    await expect(page.getByTestId('link-problem').getByRole('button', { name: 'Add it by hand' })).toBeVisible()
    await page.getByRole('button', { name: 'Remove photo 1' }).click()
  })

  await test.step('two pages: one dish, filled in, with a note about what was hard to read', async () => {
    await page.getByTestId('recipe-photo-gallery').setInputFiles([await shot(page, 'page-1.jpg'), await shot(page, 'page-2.jpg')])
    await expect(picked(page)).toHaveCount(2)
    await page.getByRole('button', { name: 'Read recipe' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'New dish' })).toBeVisible()
    await expect(page.getByTestId('read-note')).toContainText('Read from your photo')
    await expect(page.getByTestId('read-note')).toContainText('The amount of sugar is hard to read: 150 g or 180 g.')
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue("Grandma's apple cake")
    await expect(page.getByTestId('ingredient-row')).toHaveCount(5)
    const steps = page.getByTestId('step').getByRole('textbox', { name: /^Step \d+$/ })
    await expect(steps).toHaveCount(4)
    await expect(steps.last()).toHaveValue('Let it cool in the tin before cutting.')
    // Nothing is saved before she says so.
    const k = await kit(page)
    expect(await k.evaluate(async (app) => (await app.db.dishes.toArray()).length)).toBe(0)
    await page.getByRole('button', { name: 'Save dish' }).click()
    await expect(page.getByTestId('dish-name')).toHaveText("Grandma's apple cake")
  })

  await test.step('the photo way has an address of its own, and the link way is as it was', async () => {
    await page.goto('/#/recipes/import?way=photo')
    await expect(page.getByRole('heading', { level: 1, name: 'Recipe from a photo' })).toBeVisible()
    await page.getByRole('radio', { name: 'A link' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Recipe from a link' })).toBeVisible()
    await expect(page.getByLabel('Link to the recipe')).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Bring the picture along' })).toBeVisible()
  })
})

test('a question to Fork with a photo: what is in the fridge, and a recipe off a page', async ({ browser }) => {
  const page = await openKitchen(browser, contexts)
  await page.goto('/#/fork')
  const asked: string[] = []
  page.on('request', (request) => request.url().endsWith('/__cloud/helper') && request.method() === 'POST' && asked.push(request.postData() ?? ''))

  await test.step('a photo alone is a question: Fork says what he sees and offers to note it', async () => {
    await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeDisabled()
    await page.getByTestId('fork-photo').setInputFiles(await shot(page, 'fridge.jpg'))
    await expect(picked(page)).toHaveCount(1)
    await page.getByRole('button', { name: 'Ask', exact: true }).click()
    await expect(said(page, 'me')).toHaveText('You: What is on this photo? With 1 photo')
    await expect(said(page, 'fork')).toHaveText('Fork: I can see Milk, Eggs, Butter, Carrots. I cannot see what stands at the back.')
    // The photo went with the question and is let go.
    await expect(page.getByTestId('picked-photos')).toHaveCount(0)
    await offers(page).getByRole('button', { name: 'Note 4 things in the pantry' }).click()
    await expect(offers(page).getByTestId('offer-done')).toHaveText('Noted in the pantry')
    const k = await kit(page)
    expect(await k.evaluate(async (app) => (await app.db.pantry.toArray()).map((row: { name: string; amount: string | null }) => `${row.name}/${row.amount}`).sort())).toEqual(['Butter/opened', 'Carrots/null', 'Eggs/6', 'Milk/1 l'])
  })

  await test.step('a recipe on a photo: he writes it out, and one tap puts it into the dish form', async () => {
    await page.getByTestId('fork-photo').setInputFiles(await shot(page, 'cookbook.jpg'))
    await page.getByLabel('Your question').fill('Put this recipe in my book')
    await page.getByRole('button', { name: 'Ask', exact: true }).click()
    await expect(said(page, 'fork').last()).toContainText("Grandma's apple cake, for 8 servings")
    await offers(page).getByRole('button', { name: 'Put it in the recipe book' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'New dish' })).toBeVisible()
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue("Grandma's apple cake")
    await expect(page.getByTestId('ingredient-row')).toHaveCount(5)
  })

  await test.step('a photo is sent once: with its question, shrunk, and never again', async () => {
    const first = JSON.parse(asked[0])
    expect(first.photos).toHaveLength(1)
    expect(first.photos[0].type).toBe('image/jpeg')
    // 1200 x 900 on the phone, well under a megabyte on its way.
    expect(first.photos[0].base64.length).toBeGreaterThan(2000)
    expect(first.photos[0].base64.length).toBeLessThan(1_400_000)
    const second = JSON.parse(asked[1])
    expect(second.photos).toHaveLength(1)
    // The talk before it says that there was a photo, and does not carry it.
    expect(second.turns[0]).toEqual({ who: 'me', text: 'What is on this photo?\n(A photo came with this. Not shown again.)' })
    expect(JSON.stringify(second.turns)).not.toContain(first.photos[0].base64.slice(0, 200))
  })

  await test.step('the talk remembers that a photo was there, not the photo', async () => {
    // The dish form is open and not saved: leaving it asks first.
    await page.goto('/#/fork')
    await page.getByRole('button', { name: 'Discard changes' }).click()
    await page.goto('/#/fork')
    await expect(said(page, 'me').first()).toHaveText('You: What is on this photo? With 1 photo')
    expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('foodwishus.fork.')).map((key) => localStorage.getItem(key)!.length))).toEqual([expect.any(Number)])
    expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('foodwishus.fork.')).every((key) => localStorage.getItem(key)!.length < 5000))).toBe(true)
  })

  await test.step('three photos at most with a question, and a blank one gets asked for again', async () => {
    const four = await Promise.all(['a', 'b', 'c', 'd'].map((name) => shot(page, `${name}.jpg`, 400, 300)))
    await page.getByTestId('fork-photo').setInputFiles(four)
    await expect(picked(page)).toHaveCount(3)
    await expect(page.getByRole('button', { name: 'Add a photo' })).toBeDisabled()
    for (const n of [3, 2, 1]) await page.getByRole('button', { name: `Remove photo ${n}` }).click()
    await page.getByTestId('fork-photo').setInputFiles(await blank(page))
    await page.getByRole('button', { name: 'Ask', exact: true }).click()
    await expect(said(page, 'fork').last()).toHaveText('Fork: I cannot make anything out in the photo. Can you take another one, with more light?')
  })
})

test('auf Deutsch: Vorrat per Foto, und ein Rezept vom Foto', async ({ browser }) => {
  const page = await openKitchen(browser, contexts)
  await page.goto('/#/settings')
  await page.getByRole('radio', { name: 'Deutsch' }).click()
  await page.goto('/#/basket?view=pantry')
  await page.getByRole('button', { name: 'Fork ein Foto zeigen' }).click()
  const sheet = page.getByRole('dialog', { name: 'Fork ein Foto zeigen' })
  await expect(sheet).toContainText('Die Fotos gehen für diesen einen Blick an die KI (Claude) und werden nirgends gespeichert.')
  await page.getByTestId('pantry-photo-camera').setInputFiles(await shot(page, 'kuehlschrank.jpg'))
  await expect(picked(page)).toHaveAccessibleName('Foto 1 von 1')
  await sheet.getByRole('button', { name: 'Fork schauen lassen' }).click()
  await expect(seen(page)).toHaveText([/Milch\s*1 l/, /Eier\s*6/, /Butter\s*angebrochen/, /Rüebli/])
  await expect(page.getByTestId('seen-note')).toHaveText('Was hinten steht, sehe ich nicht.')
  await sheet.getByRole('button', { name: 'In den Vorrat legen' }).click()
  await expect(pantryRows(page)).toHaveCount(4)

  await page.goto('/#/recipes/import?way=photo')
  await expect(page.getByRole('heading', { level: 1, name: 'Rezept aus einem Foto' })).toBeVisible()
  await page.getByTestId('recipe-photo-camera').setInputFiles(await shot(page, 'seite.jpg'))
  await page.getByRole('button', { name: 'Rezept lesen' }).click()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Omas Apfelkuchen')
  await expect(page.getByTestId('read-note')).toContainText('Gelesen von deinem Foto')
  await expect(page.getByTestId('read-note')).toContainText('Die Zuckermenge ist schwer zu lesen: 150 g oder 180 g.')
})

test('the demo kitchen says that Fork cannot look at photos there', async ({ page }) => {
  await useDemo(page)
  await page.goto('/#/basket?view=pantry')
  await openShow(page)
  await page.getByTestId('pantry-photo-gallery').setInputFiles(await shot(page, 'fridge.jpg'))
  await page.getByRole('dialog', { name: 'Show Fork a photo' }).getByRole('button', { name: 'Let Fork look' }).click()
  await expect(page.getByTestId('show-problem')).toHaveText('In the demo kitchen Fork cannot look at photos. Add one thing at a time.')

  await page.goto('/#/recipes/import?way=photo')
  await expect(page.getByTestId('link-problem')).toContainText('The demo kitchen cannot read photos. Leave the demo and try it in your own kitchen.')
})
