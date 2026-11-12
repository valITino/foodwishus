import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'

// Shared by the specs for backup, criteria, the Sync page and the accessibility guard.

export type Kit = {
  db: any
  store: any
  sync: any
  backend: any
  actions: any
}

/** The app's development hooks, once the page has set them up. */
export async function kit(page: Page) {
  await page.waitForFunction(() => Boolean((window as unknown as { __foodwishus?: Kit }).__foodwishus))
  return page.evaluateHandle(() => (window as unknown as { __foodwishus: Kit }).__foodwishus)
}

export interface DemoOptions {
  /** The kitchen with two people and nothing else. */
  empty?: boolean
  lang?: 'en' | 'de'
  theme?: 'light' | 'dark'
}

/** Make this page open the demo kitchen (set before the first goto). */
export async function useDemo(target: Page | BrowserContext, options: DemoOptions = {}): Promise<void> {
  await target.addInitScript(
    ([prefs, lang, theme]) => {
      localStorage.setItem('foodwishus.prefs', prefs)
      localStorage.setItem('foodwishus.lang', lang)
      localStorage.setItem('foodwishus.theme', theme)
    },
    [JSON.stringify({ demoData: true, demoEmpty: Boolean(options.empty) }), options.lang ?? 'en', options.theme ?? 'light'] as const,
  )
}

/** Wait until the demo kitchen has painted all of its sample photos. */
export async function demoPhotosReady(page: Page): Promise<void> {
  const k = await kit(page)
  await expect
    .poll(() => k.evaluate(async (app) => (await app.db.photos.count()) > 0 && (await app.db.meta.get('demo.photoJobs')) === undefined), { timeout: 60_000 })
    .toBe(true)
}

/** The newest toast with exactly this text. */
export const toast = (page: Page, text: string | RegExp) => page.getByText(text, { exact: true }).last()
export const tabs = (page: Page) => page.getByRole('navigation', { name: /^(Main|Hauptnavigation)$/ })

const LEO = { name: 'Leo', pin: '314159', kitchen: 'Casa Leo' }
const MIA = { name: 'Mia', pin: '271828' }

async function wizard(page: Page, who: { name: string; pin: string }, finish: string): Promise<void> {
  const next = () => page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByLabel('Your name').fill(who.name)
  await next()
  await next()
  await page.getByLabel('PIN', { exact: true }).fill(who.pin)
  await page.getByLabel('Repeat PIN', { exact: true }).fill(who.pin)
  await page.getByRole('button', { name: finish }).click()
}

/**
 * Two devices in one kitchen in the pretend cloud: Leo opens it (he is the admin and
 * the Taster), Mia joins by link. Reset the cloud first with request.post('/__cloud/reset').
 */
export async function makeCouple(browser: Browser, contexts: BrowserContext[]): Promise<{ leo: Page; mia: Page }> {
  const open = async () => {
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
    contexts.push(context)
    await context.addInitScript(() => {
      if (!localStorage.getItem('foodwishus.lang')) localStorage.setItem('foodwishus.lang', 'en')
      if (!localStorage.getItem('foodwishus.theme')) localStorage.setItem('foodwishus.theme', 'light')
    })
    return context.newPage()
  }
  const leo = await open()
  const mia = await open()

  await leo.goto('/#/')
  await leo.getByRole('button', { name: 'Start from scratch' }).click()
  await leo.getByRole('radio', { name: /I hold the fork/ }).click()
  await leo.getByLabel('Kitchen name').fill(LEO.kitchen)
  await leo.getByRole('button', { name: 'Next', exact: true }).click()
  await wizard(leo, LEO, 'Open the kitchen')
  await expect(leo.getByRole('heading', { name: 'Your kitchen is open' })).toBeVisible()
  const link = (await leo.getByTestId('qr').getAttribute('data-qr-value')) ?? ''

  await mia.goto(link)
  await expect(mia.getByTestId('invitation')).toBeVisible()
  await mia.getByRole('button', { name: 'Next', exact: true }).click()
  await wizard(mia, MIA, 'Join the kitchen')
  await expect(tabs(mia)).toBeVisible()

  await expect(leo.getByTestId('partner-joined')).toContainText('Mia is in')
  await leo.getByRole('button', { name: 'Done' }).click()
  await expect(tabs(leo)).toBeVisible()
  return { leo, mia }
}

/** Wait until everything this device changed has reached the cloud, photos included. */
export async function settle(page: Page): Promise<void> {
  const k = await kit(page)
  await expect
    .poll(
      () =>
        k.evaluate(async (app) => {
          await app.sync.sync()
          return (await app.db.outbox.count()) + (await app.db.blobs.where('pending').equals(1).count())
        }),
      { timeout: 30_000 },
    )
    .toBe(0)
}
