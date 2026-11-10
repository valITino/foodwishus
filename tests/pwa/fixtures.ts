import { test as base, expect, type Page, type Worker } from '@playwright/test'

// Shared by the installed-app tests. The production build talks to the real cloud, so
// every browser here is fenced in: a request that does not go to the preview server is
// cut off before it leaves the machine.

export const test = base.extend({
  context: async ({ context, baseURL }, use) => {
    const home = new URL(baseURL as string).host
    await context.route(
      (url) => url.host !== home,
      (route) => route.abort('blockedbyclient'),
    )
    await context.addInitScript(() => {
      if (!localStorage.getItem('foodwishus.lang')) localStorage.setItem('foodwishus.lang', 'en')
      if (!localStorage.getItem('foodwishus.theme')) localStorage.setItem('foodwishus.theme', 'light')
    })
    await use(context)
  },
})

export { expect }

/** The build this page belongs to, as written into index.html. */
export const pageVersion = (page: Page): Promise<string | null> => page.evaluate(() => document.querySelector('meta[name="app-version"]')?.getAttribute('content') ?? null)

/** Wait until the service worker has saved the app and is in charge of this page. */
export async function workerInCharge(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }))
  })
}

/** The service worker itself, to look around inside it. */
export async function theWorker(page: Page): Promise<Worker> {
  const context = page.context()
  await workerInCharge(page)
  const found = context.serviceWorkers().find((w) => w.url().endsWith('/sw.js'))
  return found ?? context.waitForEvent('serviceworker')
}
