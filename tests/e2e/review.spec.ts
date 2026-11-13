import { expect, test, type Page } from '@playwright/test'

// Serve, proof and review in the demo kitchen: Mia is the Chef, Leo (this phone) is the
// Taster. For the Chef's side the phone changes hands. Nothing here touches a cloud, and
// the "camera" is a picture painted on a canvas and handed to the file field.

type Kit = { db: any; actions: any }
declare global {
  interface Window {
    __foodwishus: Kit
  }
}

// ----------------------------------------------------------------- helpers --

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' })
const today = () => dayFormat.format(new Date())
/** A moment on the kitchen's clock: "19:42". */
const zurichTime = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

/** The moment at which clocks in Zurich show the given day and time ("19:42:10"). Right in summer and in winter. */
function zurichMoment(day: string, time: string): Date {
  const wall = Date.parse(`${day}T${time}Z`)
  const ahead = (at: number): number => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(at))
    const part = Object.fromEntries(parts.map((p) => [p.type, Number(p.value)]))
    return Date.UTC(part.year, part.month - 1, part.day, part.hour, part.minute, part.second) - Math.floor(at / 1000) * 1000
  }
  return new Date(wall - ahead(wall - ahead(wall)))
}

/** Zurich's lead over UTC at that moment, the way a camera writes it: "+01:00". */
function zurichZone(day: string, time: string): string {
  const hours = Math.round((Date.parse(`${day}T${time}Z`) - zurichMoment(day, time).getTime()) / 3_600_000)
  return `+0${hours}:00`
}

function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

interface People {
  mia: string
  leo: string
}

/** Open the empty demo kitchen on Today and wait until it is ready. */
async function openKitchen(page: Page, options: { lang?: 'en' | 'de'; prefs?: Record<string, unknown> } = {}): Promise<People> {
  await page.addInitScript(
    ([lang, prefs]) => {
      localStorage.setItem('foodwishus.prefs', JSON.stringify({ demoData: true, demoEmpty: true, ...(prefs as object) }))
      localStorage.setItem('foodwishus.lang', lang as string)
    },
    [options.lang ?? 'en', options.prefs ?? {}] as const,
  )
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

const addDish = (page: Page, name: string, extra: Record<string, unknown> = {}): Promise<string> =>
  page.evaluate(async ([n, e]) => (await window.__foodwishus.actions.createDish({ name: n, ...(e as object) })).id as string, [name, extra] as const)

/** Something Mia cooks today. Served unless told otherwise. Returns the serving's id. */
function cook(page: Page, people: People, what: { dishId?: string; menuId?: string }, options: { served?: boolean } = {}): Promise<string> {
  return page.evaluate(
    async ([w, cookedBy, day, served]) => {
      const { actions } = window.__foodwishus
      const serving = await actions.proposeServing({ ...(w as object), cookedBy })
      await actions.planServing(serving.id, day, 'dinner')
      if (served) await actions.markServed(serving.id)
      return serving.id as string
    },
    [what, people.mia, today(), options.served ?? true] as const,
  )
}

/** A dish by Mia, on the table. */
async function served(page: Page, people: People, name = 'Älplermagronen', extra: Record<string, unknown> = {}): Promise<{ dishId: string; servingId: string }> {
  const dishId = await addDish(page, name, extra)
  return { dishId, servingId: await cook(page, people, { dishId }) }
}

const act = (page: Page, action: string, ...args: unknown[]) => page.evaluate(([name, list]) => window.__foodwishus.actions[name as string](...(list as unknown[])), [action, args] as const)
const serving = (page: Page, id: string) => page.evaluate((servingId) => window.__foodwishus.db.servings.get(servingId), id)
const reviews = (page: Page): Promise<any[]> => page.evaluate(() => window.__foodwishus.db.reviews.toArray())
const toast = (page: Page, text: string | RegExp) => page.getByRole('status').filter({ hasText: text }).last()

/** A photo of a plate, painted on a canvas: the bytes of a JPEG, bigger than the app keeps. */
async function plateJpeg(page: Page, width = 2000, height = 1500): Promise<Buffer> {
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

/** The same photo with a note from the camera: when it was taken, and in which time zone. */
function withExif(jpeg: Buffer, stamp: string, zone: string): Buffer {
  const tiff = Buffer.alloc(128)
  tiff.write('II', 0, 'latin1')
  tiff.writeUInt16LE(42, 2)
  tiff.writeUInt32LE(8, 4)
  // First list: one entry, pointing at the camera's own list.
  tiff.writeUInt16LE(1, 8)
  tiff.writeUInt16LE(0x8769, 10)
  tiff.writeUInt16LE(4, 12)
  tiff.writeUInt32LE(1, 14)
  tiff.writeUInt32LE(26, 18)
  // The camera's list: date taken, and its time zone.
  tiff.writeUInt16LE(2, 26)
  const entries: [number, string, number][] = [[0x9003, stamp, 60], [0x9011, zone, 90]]
  entries.forEach(([tag, text, at], i) => {
    const entry = 28 + i * 12
    tiff.writeUInt16LE(tag, entry)
    tiff.writeUInt16LE(2, entry + 2)
    tiff.writeUInt32LE(text.length + 1, entry + 4)
    tiff.writeUInt32LE(at, entry + 8)
    tiff.write(text, at, 'latin1')
  })
  const head = Buffer.from([0xff, 0xe1, 0, 0, 0x45, 0x78, 0x69, 0x66, 0, 0])
  head.writeUInt16BE(2 + 6 + tiff.length, 2)
  return Buffer.concat([jpeg.subarray(0, 2), head, tiff, jpeg.subarray(2)])
}

/** Press a button that opens the camera or the gallery, and hand over a photo. */
async function shoot(page: Page, button: string | RegExp, jpeg: Buffer): Promise<void> {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: button }).click()
  await (await chooser).setFiles({ name: 'proof.jpg', mimeType: 'image/jpeg', buffer: jpeg })
}

/** A proof photo straight into the kitchen, for tests that are about something else. */
function proof(page: Page, servingId: string, options: { minutesAgo?: number; courseDishId?: string } = {}): Promise<string> {
  return page.evaluate(
    async ([id, ago, courseDishId]) => {
      const canvas = document.createElement('canvas')
      canvas.width = 400
      canvas.height = 300
      const c = canvas.getContext('2d')!
      c.fillStyle = '#f2cf7a'
      c.fillRect(0, 0, 400, 300)
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.8))
      const image = { full: blob, thumb: blob, width: 400, height: 300 }
      const takenAt = new Date(Date.now() - (ago as number) * 60_000).toISOString()
      return (await window.__foodwishus.actions.addProofPhoto(id, { image, source: 'camera', takenAt, courseDishId })).photoId as string
    },
    [servingId, options.minutesAgo ?? 0, options.courseDishId] as const,
  )
}

/** Leo ate it and said so: photo, face, a few details, handed in. */
async function eaten(page: Page, servingId: string, dishId: string, verdict: Record<string, unknown> = {}): Promise<void> {
  await proof(page, servingId)
  await act(page, 'saveReview', servingId, dishId, { reaction: 6, overall: 5, portionsEaten: 1.5, wouldEatAgain: true, comment: 'The onions alone deserve a medal.', chips: ['perfect'], ...verdict })
  await act(page, 'finishMeal', servingId)
}

const flow = (page: Page, servingId: string) => page.goto(`/#/review/${servingId}`)
const faces = (page: Page) => page.getByTestId('faces')
const handIn = (page: Page) => page.getByRole('button', { name: 'Hand in the verdict' })
const celebration = (page: Page) => page.getByTestId('celebration')
const seal = (page: Page) => page.getByRole('img', { name: 'Sealed: eaten with love' })

// -------------------------------------------------------- the Taster's path --

test.describe('proof and verdict', () => {
  test('from the table to the seal: photo, one tap, the full review, handed in', async ({ page }) => {
    const people = await openKitchen(page)
    const { servingId, dishId } = await served(page, people, 'Älplermagronen', { nutrition: { kcalPerServing: 640 } })
    const taste = await page.evaluate(async () => (await window.__foodwishus.db.criteria.toArray()).find((c: any) => c.label === 'Taste').id as string)

    // Today asks for the proof and leads straight to the camera.
    await page.getByTestId('served-card').getByRole('button', { name: 'Take the proof photo' }).click()
    await expect(page).toHaveURL(new RegExp(`#/review/${servingId}$`))
    await expect(page.getByRole('heading', { name: 'Proof and verdict' })).toBeVisible()
    await expect(page.getByText('Mia cooked. You judge.')).toBeVisible()
    await expect(page.getByTestId('proof-empty')).toContainText('Proof, please.')
    await expect(page.getByTestId('camera-input')).toHaveAttribute('capture', 'environment')
    await expect(page.getByTestId('gallery-input')).not.toHaveAttribute('capture')

    // The proof photo: a polaroid, badged "Live", with its time.
    await shoot(page, 'Take the proof photo', await plateJpeg(page))
    const polaroid = page.getByTestId('proof-photo')
    await expect(polaroid).toHaveCount(1)
    await expect(polaroid).toHaveAttribute('data-source', 'camera')
    await expect(polaroid).toContainText('Live')
    const [shot] = (await serving(page, servingId)).proofPhotos
    expect(shot).toMatchObject({ source: 'camera' })
    await expect(polaroid).toContainText(zurichTime(shot.takenAt))
    await expect(page.getByTestId('eaten-at')).toHaveText(`Eaten today at ${zurichTime(shot.takenAt)}`)
    // Shrunk on the phone: 1600 px on the long edge, with a thumbnail next to it.
    const stored = await page.evaluate(async (id) => {
      const { db } = window.__foodwishus
      const [photo, blob] = [await db.photos.get(id), await db.blobs.get(id)]
      return { kind: photo.kind, width: photo.width, height: photo.height, hasThumb: blob.thumb.size > 0 && blob.thumb.size < blob.full.size }
    }, shot.photoId)
    expect(stored).toEqual({ kind: 'proof', width: 1600, height: 1200, hasThumb: true })

    // One tap on a face is saved at once.
    await faces(page).getByRole('radio', { name: 'Super delicious' }).click()
    await expect(faces(page).getByRole('radio', { name: 'Super delicious' })).toBeChecked()
    await expect.poll(async () => (await reviews(page))[0]?.reaction).toBe(6)

    // A little extra, more than one if you like.
    await faces(page).getByRole('button', { name: 'A little extra' }).click()
    await page.getByTestId('extras').getByRole('button', { name: 'Love it' }).click()
    await page.getByTestId('extras').getByRole('button', { name: 'A crown for Mia' }).click()
    await expect(page.getByTestId('extras').getByRole('button', { name: 'Love it' })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => (await reviews(page))[0].extraReactions).toEqual(['love', 'chef-queen'])

    // The full review.
    await page.getByRole('button', { name: 'Add the details' }).click()
    const sheet = page.getByRole('dialog', { name: 'Your verdict' })
    await sheet.getByRole('radiogroup', { name: 'Overall' }).getByRole('radio', { name: "5 of 5 spoons: Chef's kiss" }).click()
    await expect(sheet.getByText("Chef's kiss")).toBeVisible()
    await sheet.getByRole('radiogroup', { name: 'Taste' }).getByRole('radio', { name: '4 of 5 spoons' }).click()
    await sheet.getByRole('group', { name: 'How much did you eat?' }).getByRole('button', { name: '1.5', exact: true }).click()
    await expect(sheet.getByText('About 960 kcal on your plate.')).toBeVisible()
    await sheet.getByRole('button', { name: 'Yes, again' }).click()
    await sheet.getByRole('button', { name: 'Recipe keeper' }).click()
    await sheet.getByLabel('A few words').fill('The onions alone deserve a medal.')
    await sheet.getByRole('button', { name: 'Save verdict' }).click()
    await expect(toast(page, 'Saved')).toBeVisible()
    await expect(sheet).toBeHidden()
    const details = page.getByTestId('details')
    await expect(details).toContainText("Chef's kiss")
    await expect(details).toContainText('Ate a portion and a half, about 960 kcal. Would eat it again.')
    await expect(details).toContainText('The onions alone deserve a medal.')
    await expect(details.getByRole('button', { name: 'Change the details' })).toBeVisible()

    // Handing in stamps the seal; a "Super delicious" adds hearts.
    await handIn(page).click()
    await expect(celebration(page)).toBeVisible()
    await expect(celebration(page).getByRole('heading', { name: 'Handed in' })).toBeVisible()
    await expect(celebration(page)).toContainText('Mia can read it now.')
    await expect(seal(page)).toBeVisible()
    await expect(celebration(page).getByTestId('confetti')).toBeAttached()

    // Then back to where he came from: Today, where the meal now wears its seal.
    await celebration(page).getByRole('button', { name: 'Done' }).click()
    await expect(page).toHaveURL(/#\/$/)
    await expect(page.getByTestId('served-card')).toHaveCount(0)
    await expect(page.getByTestId('eaten-today')).toContainText('Älplermagronen')
    await expect(page.getByTestId('eaten-today').getByRole('img', { name: 'Sealed: eaten with love' })).toBeVisible()

    expect(await serving(page, servingId)).toMatchObject({ status: 'eaten', eatenAt: shot.takenAt })
    expect(await reviews(page)).toEqual([
      expect.objectContaining({ servingId, dishId, reviewerId: people.leo, reaction: 6, extraReactions: ['love', 'chef-queen'], overall: 5, scores: { [taste]: 4 }, portionsEaten: 1.5, wouldEatAgain: true, chips: ['keeper'], comment: 'The onions alone deserve a medal.' }),
    ])

    // The meal page hangs up the proof and the verdict.
    await page.getByTestId('eaten-today').getByRole('button').click()
    await expect(page.getByTestId('proof-gallery').getByTestId('proof-photo')).toHaveCount(1)
    await expect(seal(page)).toBeVisible()
    const card = page.getByTestId('verdict-card')
    await expect(card.getByRole('heading', { name: 'Your verdict' })).toBeVisible()
    await expect(card.getByTestId('verdict-face')).toHaveText('Super delicious')
    await expect(card).toContainText('A crown for Mia')
    await expect(card).toContainText('Recipe keeper')
    await expect(card.getByTestId('time-left')).toHaveText('You can change it for another 24 hours.')
    await expect(page.getByTestId('answer-view')).toHaveText('Mia has not answered yet.')
  })

  test('holding a face picks it and opens the extras', async ({ page }) => {
    const people = await openKitchen(page)
    const { servingId } = await served(page, people)
    await flow(page, servingId)
    await expect(faces(page)).toContainText('Hold a face for a little extra.')
    await expect(page.getByTestId('extras')).toHaveCount(0)

    // A real finger: it rests on the face until the extras open, then lifts.
    const yummy = faces(page).getByRole('radio', { name: 'Yummy' })
    await faces(page).evaluate((card) => card.scrollIntoView({ block: 'center' }))
    const box = (await yummy.boundingBox())!
    const touch = await page.context().newCDPSession(page)
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] })
    await expect(page.getByTestId('extras')).toBeVisible()
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

    // The finger coming up does not count as a second tap.
    await expect(yummy).toBeChecked()
    await expect(page.getByTestId('extras').getByRole('button')).toHaveCount(6)
    await page.getByTestId('extras').getByRole('button', { name: 'Again please' }).click()
    await expect.poll(async () => (await reviews(page))[0]).toMatchObject({ reaction: 5, extraReactions: ['again'] })
  })

  test("the phone's back button closes the review sheet and keeps what was entered", async ({ page }) => {
    const people = await openKitchen(page)
    const { servingId } = await served(page, people)
    await flow(page, servingId)
    await page.getByRole('button', { name: 'Add the details' }).click()
    const sheet = page.getByRole('dialog', { name: 'Your verdict' })
    await sheet.getByRole('radio', { name: '4 of 5 spoons: So good' }).click()
    await sheet.getByLabel('A few words').fill('Halfway through, already happy.')

    await page.goBack()
    await expect(sheet).toBeHidden()
    await expect(toast(page, 'Saved')).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`#/review/${servingId}$`))
    await expect(page.getByTestId('details')).toContainText('So good')
    await expect(page.getByTestId('details')).toContainText('Halfway through, already happy.')
    expect(await reviews(page)).toEqual([expect.objectContaining({ overall: 4, comment: 'Halfway through, already happy.' })])

    // Tapping next to the sheet keeps things as well; with nothing changed it just closes.
    await page.getByRole('button', { name: 'Change the details' }).click()
    await sheet.getByRole('button', { name: 'Close' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('details')).toContainText('So good')
  })

  test('says in words what is missing: first the proof, then the verdict', async ({ page }) => {
    const people = await openKitchen(page)
    const { servingId } = await served(page, people)
    await flow(page, servingId)

    await handIn(page).click()
    await expect(page.getByRole('alert')).toHaveText('No proof yet. Take the photo first, then hand it in. Plate already empty? A clean plate counts too.')
    expect((await serving(page, servingId)).status).toBe('served')

    await shoot(page, 'Take the proof photo', await plateJpeg(page, 800, 600))
    await expect(page.getByTestId('proof-photo')).toHaveCount(1)
    await expect(page.getByRole('alert')).toHaveCount(0)

    await handIn(page).click()
    await expect(page.getByRole('alert')).toHaveText('No verdict yet. Tap a face, then hand it in.')
    await expect(celebration(page)).toHaveCount(0)
    expect((await serving(page, servingId)).status).toBe('served')

    await faces(page).getByRole('radio', { name: 'Pretty good' }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await handIn(page).click()
    await expect(seal(page)).toBeVisible()
    // "Pretty good" is no reason for confetti.
    await expect(celebration(page).getByTestId('confetti')).toHaveCount(0)
    expect((await serving(page, servingId)).status).toBe('eaten')
  })

  test('a meal the Chef forgot to mark as served can still be proven', async ({ page }) => {
    const people = await openKitchen(page)
    const dishId = await addDish(page, 'Rösti')
    const servingId = await cook(page, people, { dishId }, { served: false })

    // Today offers it, and so does the meal page: a real button, and the camera behind it.
    await expect(page.getByTestId('today-meal').getByText('Already on the table?')).toBeVisible()
    await expect(page.getByTestId('today-meal').getByRole('button', { name: 'Take a photo and rate' })).toBeVisible()
    await page.goto(`/#/serving/${servingId}`)
    await expect(page.getByText('Mia taps Served when it is on the table.')).toBeVisible()

    // The photo comes first: one tap opens the camera, and the verdict opens with the photo in it.
    await shoot(page, 'Take a photo and rate', await plateJpeg(page, 800, 600))
    await expect(page).toHaveURL(new RegExp(`#/review/${servingId}$`))
    await expect(page.getByText('Not marked as served yet. No problem: your photo says it all.')).toBeVisible()
    await expect(page.getByTestId('proof-photo')).toHaveCount(1)
    expect(await serving(page, servingId)).toMatchObject({ status: 'planned', proofPhotos: [{ source: 'camera' }] })

    // Put down in between: the same place leads back to the verdict, without a second photo.
    await page.goto(`/#/serving/${servingId}`)
    await expect(page.getByRole('button', { name: 'Take a photo and rate' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Finish the verdict' }).click()
    await expect(page).toHaveURL(new RegExp(`#/review/${servingId}$`))
    await expect(page.getByTestId('proof-photo')).toHaveCount(1)
    await faces(page).getByRole('radio', { name: 'Yummy' }).click()
    await handIn(page).click()
    await celebration(page).getByRole('button', { name: 'Done' }).click()

    // Back on the meal page, which now says "Eaten".
    await expect(page).toHaveURL(new RegExp(`#/serving/${servingId}$`))
    await expect(page.getByTestId('serving-status')).toContainText('Eaten on')
    const stored = await serving(page, servingId)
    expect(stored).toMatchObject({ status: 'eaten', servedAt: stored.eatenAt })
  })

  test('the gallery is the second way: badged, dated by the photo, and the time can be corrected', async ({ page }) => {
    const people = await openKitchen(page)
    const { servingId } = await served(page, people)
    await flow(page, servingId)
    const yesterday = addDays(today(), -1)

    // Taken with the phone's camera last night. The camera wrote down the kitchen's time and zone.
    const fromLastNight = withExif(await plateJpeg(page, 800, 600), `${yesterday.replaceAll('-', ':')} 19:42:10`, zurichZone(yesterday, '19:42:10'))
    await shoot(page, 'Pick from the gallery', fromLastNight)
    const polaroid = page.getByTestId('proof-photo')
    await expect(polaroid).toHaveAttribute('data-source', 'gallery')
    await expect(polaroid).toContainText('From gallery')
    await expect(polaroid).toContainText('19:42')
    await expect(page.getByTestId('eaten-at')).toHaveText('Eaten yesterday at 19:42')
    expect((await serving(page, servingId)).proofPhotos[0]).toMatchObject({ source: 'gallery', takenAt: zurichMoment(yesterday, '19:42:10').toISOString() })

    // A second, live photo. The earlier one still sets the time.
    await shoot(page, 'Add a photo', await plateJpeg(page, 800, 600))
    await expect(polaroid).toHaveCount(2)
    await expect(polaroid.last()).toContainText('Live')
    await expect(page.getByTestId('eaten-at')).toHaveText('Eaten yesterday at 19:42')

    // Correct the time. Tomorrow is not an answer.
    await page.getByRole('button', { name: 'Change the time' }).click()
    const field = page.getByLabel('When was it eaten?')
    await expect(field).toHaveValue(`${yesterday}T19:42`)
    await field.fill(`${addDays(today(), 1)}T12:00`)
    await expect(toast(page, 'That is still ahead of us. Pick a time that has passed.')).toBeVisible()
    await field.fill(`${yesterday}T18:30`)
    await expect(page.getByTestId('eaten-at')).toHaveText('Eaten yesterday at 18:30')

    // Take the live photo down again. It asks first.
    await page.getByRole('button', { name: /^Remove the photo from/ }).last().click()
    const ask = page.getByRole('dialog', { name: 'Remove this photo?' })
    await ask.getByRole('button', { name: 'Remove' }).click()
    await expect(toast(page, 'Removed')).toBeVisible()
    await expect(polaroid).toHaveCount(1)
    await expect(polaroid).toContainText('From gallery')

    await faces(page).getByRole('radio', { name: 'Yummy' }).click()
    await handIn(page).click()
    await expect(seal(page)).toBeVisible()
    expect(await serving(page, servingId)).toMatchObject({ status: 'eaten', eatenAt: zurichMoment(yesterday, '18:30:00').toISOString() })
  })

  test('a file that is no photo is refused in words', async ({ page }) => {
    const people = await openKitchen(page)
    const { servingId } = await served(page, people)
    await flow(page, servingId)
    await shoot(page, 'Pick from the gallery', Buffer.from('This is a shopping list, not a photo.'))
    await expect(toast(page, 'That photo could not be read. Take a new one or pick another.')).toBeVisible()
    await expect(page.getByTestId('proof-empty')).toBeVisible()
    expect((await serving(page, servingId)).proofPhotos).toEqual([])
  })

  test('calorie numbers stay away when they are switched off', async ({ page }) => {
    const people = await openKitchen(page, { prefs: { showCalories: false } })
    const { servingId, dishId } = await served(page, people, 'Älplermagronen', { nutrition: { kcalPerServing: 640 } })
    await eaten(page, servingId, dishId)
    await page.goto(`/#/serving/${servingId}`)
    await expect(page.getByTestId('verdict-card')).toContainText('Ate a portion and a half. Would eat it again.')
    await expect(page.getByText('kcal')).toHaveCount(0)

    await page.getByRole('button', { name: 'Change verdict' }).click()
    await page.getByRole('button', { name: 'Change the details' }).click()
    await expect(page.getByRole('dialog', { name: 'Your verdict' }).getByRole('button', { name: 'Seconds!' })).toBeVisible()
    await expect(page.getByText('kcal')).toHaveCount(0)
  })

  test('with less motion the seal still lands, without confetti', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const people = await openKitchen(page)
    const { servingId } = await served(page, people)
    await proof(page, servingId)
    await act(page, 'reactToMeal', servingId, 6)
    await flow(page, servingId)
    await handIn(page).click()
    await expect(seal(page)).toBeVisible()
    await expect(celebration(page).getByTestId('confetti')).toHaveCount(0)
  })
})

// -------------------------------------------------------------------- menus --

test.describe('a menu', () => {
  test('one photo of the table, one face for everything, and a verdict per course', async ({ page }) => {
    const people = await openKitchen(page)
    const soup = await addDish(page, 'Pumpkin soup', { course: 'starter' })
    const roast = await addDish(page, 'Roast chicken')
    const tart = await addDish(page, 'Plum tart', { course: 'dessert' })
    const menuId = (await act(page, 'createMenu', { name: 'Sunday roast', courses: [{ dishId: roast, order: 1 }, { dishId: tart, order: 2 }, { dishId: soup, order: 0 }] })).id as string
    const servingId = await cook(page, people, { menuId })
    await flow(page, servingId)

    await expect(page.getByRole('heading', { name: 'The proof: the whole table' })).toBeVisible()
    await expect(page.getByText('One photo of the whole table, please. A photo of each course is a bonus.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'How was the menu?' })).toBeVisible()

    // The table first, then one course on its own.
    await shoot(page, 'Take the proof photo', await plateJpeg(page, 800, 600))
    await expect(page.getByTestId('proof-photo')).toHaveCount(1)
    await shoot(page, 'Photo of Plum tart', await plateJpeg(page, 600, 600))
    await expect(page.getByTestId('proof-photo')).toHaveCount(2)
    await expect(page.getByTestId('proof-photo').last()).toContainText('Plum tart')
    expect((await serving(page, servingId)).proofPhotos.map((p: any) => p.courseDishId ?? 'table')).toEqual(['table', tart])

    // One tap covers every course.
    const courses = page.getByTestId('courses')
    await expect(courses.getByTestId('course-verdict')).toHaveText(['No face yet', 'No face yet', 'No face yet'])
    await faces(page).getByRole('radio', { name: 'Yummy' }).click()
    await expect(courses.getByTestId('course-verdict')).toHaveText(['Yummy', 'Yummy', 'Yummy'])
    for (const name of ['Pumpkin soup', 'Roast chicken', 'Plum tart']) await expect(courses.getByRole('button', { name: `Judge ${name} on its own` })).toBeVisible()

    // The dessert deserves more.
    await courses.getByRole('button', { name: 'Judge Plum tart on its own' }).click()
    const sheet = page.getByRole('dialog', { name: 'Plum tart' })
    await expect(sheet.getByRole('radio', { name: 'Yummy' })).toBeChecked()
    await sheet.getByRole('radio', { name: 'Super delicious' }).click()
    await sheet.getByRole('radio', { name: "5 of 5 spoons: Chef's kiss" }).click()
    await sheet.getByLabel('A few words').fill('Plums forever.')
    await sheet.getByRole('button', { name: 'Save verdict' }).click()
    await expect(toast(page, 'Saved')).toBeVisible()
    await expect(courses.getByTestId('course-verdict')).toHaveText(['Yummy', 'Yummy', "Super delicious, Chef's kiss"])
    await expect(faces(page)).toContainText('Every course has its own face now.')

    await handIn(page).click()
    await expect(celebration(page).getByTestId('confetti')).toBeAttached()
    await celebration(page).getByRole('button', { name: 'Done' }).click()

    // Every course has its own review, so the dish numbers stay true.
    expect((await serving(page, servingId)).status).toBe('eaten')
    const stored = Object.fromEntries((await reviews(page)).map((r) => [r.dishId, [r.reaction, r.overall, r.comment]]))
    expect(stored).toEqual({ [soup]: [5, null, null], [roast]: [5, null, null], [tart]: [6, 5, 'Plums forever.'] })

    await expect(page).toHaveURL(new RegExp(`#/serving/${servingId}$`))
    const verdicts = page.getByTestId('dish-verdict')
    await expect(verdicts).toHaveCount(3)
    await expect(verdicts.nth(0)).toContainText('Pumpkin soup')
    await expect(verdicts.nth(2)).toContainText('Plum tart')
    await expect(verdicts.nth(2)).toContainText('Plums forever.')
    await expect(page.getByTestId('proof-gallery').getByTestId('proof-photo')).toHaveCount(2)
  })
})

// ------------------------------------------------------------ the 24 hours --

test.describe('changing a verdict', () => {
  test('for 24 hours it can be changed, then it is sealed', async ({ page }) => {
    const people = await openKitchen(page)
    const { servingId, dishId } = await served(page, people)
    await eaten(page, servingId, dishId)

    await page.goto(`/#/serving/${servingId}`)
    const card = page.getByTestId('verdict-card')
    await expect(card.getByTestId('verdict-face')).toHaveText('Super delicious')
    await expect(card.getByTestId('time-left')).toHaveText('You can change it for another 24 hours.')

    // Change the face and a detail.
    await card.getByRole('button', { name: 'Change verdict' }).click()
    await expect(page.getByRole('heading', { name: 'Change your verdict' })).toBeVisible()
    await expect(page.getByTestId('time-left')).toHaveText('You can change it for another 24 hours.')
    await expect(handIn(page)).toHaveCount(0)
    await faces(page).getByRole('radio', { name: 'Pretty good' }).click()
    await page.getByRole('button', { name: 'Change the details' }).click()
    const sheet = page.getByRole('dialog', { name: 'Your verdict' })
    await expect(sheet.getByLabel('A few words')).toHaveValue('The onions alone deserve a medal.')
    await sheet.getByRole('radio', { name: '3 of 5 spoons: Solid' }).click()
    await sheet.getByRole('button', { name: 'No, thanks' }).click()
    await sheet.getByRole('button', { name: 'Save verdict' }).click()
    await expect(toast(page, 'Saved')).toBeVisible()

    // An eaten meal keeps its proof.
    await page.getByRole('button', { name: /^Remove the photo from/ }).click()
    await expect(toast(page, 'An eaten meal keeps at least one proof photo. Add a new one first.')).toBeVisible()
    await expect(page.getByTestId('proof-photo')).toHaveCount(1)

    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page).toHaveURL(new RegExp(`#/serving/${servingId}$`))
    await expect(card.getByTestId('verdict-face')).toHaveText('Pretty good')
    await expect(card).toContainText('Solid')
    await expect(card).toContainText('Once was enough')
    expect(await reviews(page)).toEqual([expect.objectContaining({ reaction: 4, overall: 3, wouldEatAgain: false })])

    // Less than an hour and a half left: it counts in minutes.
    await page.evaluate(async () => {
      const { db } = window.__foodwishus
      for (const review of await db.reviews.toArray()) await db.reviews.update(review.id, { sealedAt: new Date(Date.now() + 40 * 60_000 - 5000).toISOString() })
    })
    await expect(card.getByTestId('time-left')).toHaveText('You can change it for another 40 minutes.')

    // A day later it is sealed: it shows, and nothing can be changed any more.
    await page.evaluate(async () => {
      const { db } = window.__foodwishus
      for (const review of await db.reviews.toArray()) await db.reviews.update(review.id, { sealedAt: new Date(Date.now() - 60_000).toISOString() })
    })
    await expect(card.getByTestId('sealed-note')).toContainText('Sealed since')
    await expect(card.getByRole('button', { name: 'Change verdict' })).toHaveCount(0)
    await expect(card.getByTestId('verdict-face')).toHaveText('Pretty good')

    await flow(page, servingId)
    await expect(page.getByTestId('sealed')).toContainText('Signed and sealed')
    await expect(page.getByTestId('sealed')).toContainText('This verdict can no longer be changed.')
    await expect(faces(page)).toHaveCount(0)
    await page.getByRole('button', { name: 'Open the meal' }).click()
    await expect(page).toHaveURL(new RegExp(`#/serving/${servingId}$`))
    const refused = await page.evaluate(([s, d]) => window.__foodwishus.actions.saveReview(s, d, { reaction: 1 }).then(() => 'saved', (error: { code?: string }) => error.code), [servingId, dishId] as const)
    expect(refused).toBe('review_sealed')
  })
})

// ---------------------------------------------------------- the Chef's side --

test.describe("the Chef's side", () => {
  test('a guess before the reveal, then a face, a little extra and a reply', async ({ page }) => {
    const people = await openKitchen(page)
    const { servingId, dishId } = await served(page, people)

    // While it is on the table, the cook waits. She cannot judge her own cooking.
    await become(page, people.mia, 'Mia')
    await expect(page.getByTestId('served-card')).toContainText('Waiting for proof')
    await flow(page, servingId)
    await expect(page.getByRole('heading', { name: 'Not your plate to judge' })).toBeVisible()
    await expect(page.getByText('Leo takes the photo and hands in the verdict.')).toBeVisible()
    await expect(page.getByTestId('camera-input')).toHaveCount(0)

    await become(page, people.leo, 'Leo')
    await eaten(page, servingId, dishId, { overall: 5 })

    // Her Today: the waiting is over.
    await become(page, people.mia, 'Mia')
    const news = page.getByTestId('verdict-in')
    await expect(news.getByRole('heading', { name: 'The verdict is in' })).toBeVisible()
    await expect(news).toContainText('Leo has eaten Älplermagronen and handed in a verdict.')
    await expect(page.getByTestId('served-card')).toHaveCount(0)
    await news.getByRole('button', { name: /Open the verdict/ }).click()
    await expect(page).toHaveURL(new RegExp(`#/serving/${servingId}$`))

    // Before she looks: her own guess. The verdict stays under the cloche.
    const gate = page.getByTestId('guess-gate')
    await expect(gate).toContainText('Before you look')
    await expect(gate.getByRole('heading', { name: 'How do you think it went?' })).toBeVisible()
    await expect(page.getByTestId('proof-gallery').getByTestId('proof-photo')).toHaveCount(1)
    await expect(page.getByTestId('verdict-card')).toHaveCount(0)
    await expect(page.getByText('The onions alone deserve a medal.')).toHaveCount(0)
    await expect(page.getByText('Super delicious')).toHaveCount(0)

    await gate.getByRole('radio', { name: '4 of 5 spoons: So good' }).click()
    const card = page.getByTestId('verdict-card')
    await expect(card.getByRole('heading', { name: "Leo's verdict" })).toBeVisible()
    await expect(card.getByTestId('guess-result')).toHaveText('Your guess: So good. Too modest. It went better than you thought.')
    await expect(card.getByTestId('verdict-face')).toHaveText('Super delicious')
    await expect(card).toContainText('The onions alone deserve a medal.')
    await expect(card.getByTestId('time-left')).toHaveText('Leo can still change it for 24 hours.')
    await expect(card.getByRole('button', { name: 'Change verdict' })).toHaveCount(0)
    await expect(gate).toHaveCount(0)
    expect((await reviews(page))[0]).toMatchObject({ chefSelfRating: 4, reaction: 6, overall: 5 })

    // She answers like under a post: a face, a little extra, a few words.
    const answer = page.getByTestId('answer-editor')
    await answer.getByRole('radio', { name: 'Yummy' }).click()
    await expect(answer.getByRole('radio', { name: 'Yummy' })).toBeChecked()
    await answer.getByRole('button', { name: 'A little extra' }).click()
    await answer.getByRole('button', { name: 'Love', exact: true }).click()
    await answer.getByRole('button', { name: 'A crown for Leo' }).click()
    await expect(answer.getByRole('button', { name: 'Send reply' })).toBeDisabled()
    await answer.getByLabel('A reply for Leo').fill('Told you so. Seconds tomorrow?')
    await answer.getByRole('button', { name: 'Send reply' }).click()
    await expect(toast(page, 'Sent')).toBeVisible()
    await expect(answer.getByTestId('chef-reply')).toHaveText('Told you so. Seconds tomorrow?')
    await expect(answer.getByRole('button', { name: 'Edit reply' })).toBeVisible()
    expect((await reviews(page))[0]).toMatchObject({ chefReaction: 5, chefExtraReactions: ['love', 'chef-queen'], chefReply: 'Told you so. Seconds tomorrow?', reaction: 6 })

    // Her Today is calm again: the meal is simply eaten.
    await page.goto('/#/')
    await expect(page.getByTestId('verdict-in')).toHaveCount(0)
    await expect(page.getByTestId('eaten-today')).toContainText('Älplermagronen')

    // And he reads her answer on the same page.
    await become(page, people.leo, 'Leo')
    await page.goto(`/#/serving/${servingId}`)
    const reply = page.getByTestId('answer-view')
    await expect(reply).toContainText("Mia's answer")
    await expect(reply).toContainText('Yummy')
    await expect(reply).toContainText('Love')
    await expect(reply).toContainText('A crown for Leo')
    await expect(reply.getByTestId('chef-reply')).toHaveText('Told you so. Seconds tomorrow?')
    await expect(reply).toContainText('Mia guessed "So good" before looking.')
    await expect(page.getByTestId('answer-editor')).toHaveCount(0)
    await expect(page.getByTestId('guess-gate')).toHaveCount(0)
  })

  test('a verdict she has not opened is still news the next morning', async ({ page }) => {
    const people = await openKitchen(page)
    const { servingId, dishId } = await served(page, people)
    await eaten(page, servingId, dishId)
    // It all happened last night.
    await page.evaluate(([id, at]) => window.__foodwishus.db.servings.update(id, { eatenAt: at, servedAt: at }), [servingId, zurichMoment(addDays(today(), -1), '19:42:00').toISOString()] as const)

    // His Today has moved on: nothing was eaten today.
    await page.goto('/#/')
    await expect(page.getByTestId('eaten-today')).toHaveCount(0)

    await become(page, people.mia, 'Mia')
    const news = page.getByTestId('verdict-in')
    await expect(news).toContainText('Yesterday, dinner')
    await expect(news).toContainText('The verdict is in')
    await news.getByRole('button', { name: /Open the verdict/ }).click()
    await page.getByTestId('guess-gate').getByRole('radio', { name: "5 of 5 spoons: Chef's kiss" }).click()
    await expect(page.getByTestId('guess-result')).toContainText('Spot on.')
    await page.goto('/#/')
    await expect(page.getByTestId('today-empty')).toBeVisible()
    await expect(page.getByTestId('verdict-in')).toHaveCount(0)
  })

  test('the reply can be edited later, even after the seal', async ({ page }) => {
    const people = await openKitchen(page)
    const { servingId, dishId } = await served(page, people)
    await eaten(page, servingId, dishId)
    await page.evaluate(async () => {
      const { db, actions } = window.__foodwishus
      for (const review of await db.reviews.toArray()) {
        await actions.answerReview(review.id, { chefSelfRating: 5, chefReply: 'Told you so.' })
        await db.reviews.update(review.id, { sealedAt: new Date(Date.now() - 60_000).toISOString() })
      }
    })
    await become(page, people.mia, 'Mia')
    await page.goto(`/#/serving/${servingId}`)

    await expect(page.getByTestId('guess-result')).toHaveText('Your guess: Chef\'s kiss. Spot on. You know your cooking.')
    await expect(page.getByTestId('sealed-note')).toContainText('Sealed since')
    const answer = page.getByTestId('answer-editor')
    await answer.getByRole('button', { name: 'Edit reply' }).click()
    await answer.getByLabel('A reply for Leo').fill('Told you so. Twice.')
    await answer.getByRole('button', { name: 'Send reply' }).click()
    await expect(toast(page, 'Sent')).toBeVisible()
    await expect(answer.getByTestId('chef-reply')).toHaveText('Told you so. Twice.')
  })
})

// ---------------------------------------------------------------- the wall --

test.describe('the photo wall', () => {
  test('starts bare, then shows every proof photo, newest first, and opens the meal', async ({ page }) => {
    const people = await openKitchen(page)

    // One obvious way in: the card at the bottom of Today.
    const link = page.getByTestId('wall-link')
    await expect(link).toContainText('No proof photos yet')
    await link.getByRole('button').click()
    await expect(page).toHaveURL(/#\/photos$/)
    await expect(page.getByRole('heading', { name: 'Photo wall' })).toBeVisible()
    await expect(page.getByTestId('wall-empty')).toContainText('The wall is still bare')
    await page.getByTestId('wall-empty').getByRole('button', { name: 'Open the wishlist' }).click()
    await expect(page).toHaveURL(/#\/wishlist$/)

    // Two meals. The soup was eaten an hour before the tart.
    const soup = await served(page, people, 'Pumpkin soup')
    await proof(page, soup.servingId, { minutesAgo: 60 })
    await act(page, 'saveReview', soup.servingId, soup.dishId, { reaction: 4, comment: 'Warms the soul.' })
    await act(page, 'finishMeal', soup.servingId)
    const tart = await served(page, people, 'Plum tart')
    await proof(page, tart.servingId, { minutesAgo: 2 })
    await proof(page, tart.servingId, { minutesAgo: 1 })

    await page.goto('/#/')
    await expect(link).toContainText('3 proof photos')
    await link.getByRole('button').click()
    const photos = page.getByTestId('wall-photo')
    await expect(photos).toHaveCount(3)
    await expect(photos).toContainText(['Plum tart', 'Plum tart', 'Pumpkin soup'])

    // A tap opens that meal's page, with its review.
    await photos.last().getByRole('button', { name: /^Pumpkin soup, .* Open the meal$/ }).click()
    await expect(page).toHaveURL(new RegExp(`#/serving/${soup.servingId}$`))
    await expect(page.getByTestId('verdict-card')).toContainText('Warms the soul.')

    // And the meal page leads back to the wall.
    await page.getByRole('button', { name: 'See the photo wall' }).click()
    await expect(page).toHaveURL(/#\/photos$/)

    // A meal still waiting for its verdict leads to the flow from an empty wall, too.
    await page.goto(`/#/serving/${tart.servingId}`)
    await expect(page.getByTestId('proof-card')).toContainText('Almost there')
    await page.getByTestId('proof-card').getByRole('button', { name: 'Finish the verdict' }).click()
    await expect(page).toHaveURL(new RegExp(`#/review/${tart.servingId}$`))
    await expect(page.getByTestId('proof-photo')).toHaveCount(2)
  })

  test('does not give the verdict away to a cook who has not guessed yet', async ({ page }) => {
    const people = await openKitchen(page)
    const { servingId } = await served(page, people)
    // He has taken the photo and tapped a face, but not handed in yet.
    await proof(page, servingId)
    await act(page, 'reactToMeal', servingId, 6)
    await page.goto('/#/photos')
    await expect(page.getByTestId('wall-photo')).toContainText('🤤')

    await become(page, people.mia, 'Mia')
    await page.goto('/#/photos')
    await expect(page.getByTestId('wall-photo')).toHaveCount(1)
    await expect(page.getByTestId('wall-photo')).not.toContainText('🤤')

    // Handed in: still covered, until she has guessed.
    await become(page, people.leo, 'Leo')
    await act(page, 'finishMeal', servingId)
    await become(page, people.mia, 'Mia')
    await page.goto('/#/photos')
    await expect(page.getByTestId('wall-photo')).not.toContainText('🤤')
    await page.evaluate(async () => {
      const { db, actions } = window.__foodwishus
      for (const review of await db.reviews.toArray()) await actions.answerReview(review.id, { chefSelfRating: 4 })
    })
    await expect(page.getByTestId('wall-photo')).toContainText('🤤')
  })
})

// ------------------------------------------------------------------- German --

test.describe('auf Deutsch', () => {
  test('Beweis, Urteil, Siegel und Fotowand', async ({ page }) => {
    const people = await openKitchen(page, { lang: 'de' })
    const { servingId } = await served(page, people)

    await page.getByTestId('served-card').getByRole('button', { name: 'Beweisfoto machen' }).click()
    await expect(page.getByRole('heading', { name: 'Beweis und Urteil' })).toBeVisible()
    await expect(page.getByText('Mia hat gekocht. Du urteilst.')).toBeVisible()
    await expect(page.getByTestId('proof-empty')).toContainText('Beweis, bitte.')
    await expect(page.getByRole('button', { name: 'Aus der Galerie wählen' })).toBeVisible()

    await page.getByRole('button', { name: 'Urteil abgeben' }).click()
    await expect(page.getByRole('alert')).toHaveText('Noch kein Beweis. Mach zuerst das Foto, dann gib das Urteil ab. Teller schon leer? Ein leerer Teller zählt auch.')

    await shoot(page, 'Beweisfoto machen', await plateJpeg(page, 800, 600))
    await expect(page.getByTestId('proof-photo')).toContainText('Live')
    await expect(page.getByTestId('eaten-at')).toContainText(/^Gegessen heute um \d\d:\d\d$/)
    await page.getByRole('button', { name: 'Urteil abgeben' }).click()
    await expect(page.getByRole('alert')).toHaveText('Noch kein Urteil. Tippe ein Gesicht an, dann gib es ab.')

    await faces(page).getByRole('radio', { name: 'Mega fein' }).click()
    await faces(page).getByRole('button', { name: 'Das gewisse Extra' }).click()
    await page.getByTestId('extras').getByRole('button', { name: 'Eine Krone für Mia' }).click()
    await page.getByRole('button', { name: 'Details ergänzen' }).click()
    const sheet = page.getByRole('dialog', { name: 'Dein Urteil' })
    await sheet.getByRole('radio', { name: '5 von 5 Löffeln: Zum Niederknien' }).click()
    await sheet.getByRole('button', { name: 'Nachschlag!' }).click()
    await expect(sheet.getByText('Nachschlag zählt als drei Portionen.')).toBeVisible()
    await sheet.getByRole('button', { name: 'Urteil speichern' }).click()
    await expect(toast(page, 'Gespeichert')).toBeVisible()

    await page.getByRole('button', { name: 'Urteil abgeben' }).click()
    await expect(celebration(page).getByRole('heading', { name: 'Abgegeben' })).toBeVisible()
    await expect(page.getByRole('img', { name: 'Besiegelt: mit Liebe gegessen' })).toBeVisible()
    await celebration(page).getByRole('button', { name: 'Fertig' }).click()

    await page.goto(`/#/serving/${servingId}`)
    const card = page.getByTestId('verdict-card')
    await expect(card.getByRole('heading', { name: 'Dein Urteil' })).toBeVisible()
    await expect(card).toContainText('Gegessen: Nachschlag, und dann noch einen.')
    await expect(card.getByTestId('time-left')).toHaveText('Du kannst es noch 24 Stunden ändern.')
    await expect(page.getByTestId('answer-view')).toHaveText('Mia hat noch nicht geantwortet.')

    // Die Köchin rät zuerst.
    await become(page, people.mia, 'Mia')
    await expect(page.getByTestId('verdict-in')).toContainText('Das Urteil ist da')
    await page.goto(`/#/serving/${servingId}`)
    await expect(page.getByTestId('guess-gate')).toContainText('Was glaubst du, wie es ankam?')
    await page.getByTestId('guess-gate').getByRole('radio', { name: '5 von 5 Löffeln: Zum Niederknien' }).click()
    await expect(page.getByTestId('guess-result')).toHaveText('Dein Tipp: Zum Niederknien. Volltreffer. Du kennst deine Küche.')
    await expect(page.getByTestId('verdict-card').getByRole('heading', { name: 'Das Urteil von Leo' })).toBeVisible()
    await expect(page.getByTestId('answer-editor').getByLabel('Eine Antwort für Leo')).toBeVisible()

    await page.goto('/#/photos')
    await expect(page.getByRole('heading', { name: 'Fotowand' })).toBeVisible()
    await expect(page.getByTestId('wall-photo')).toHaveCount(1)
  })
})
