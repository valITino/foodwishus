import { expect, test, workerInCharge } from './fixtures'

// What Chrome needs to offer "Install app": a manifest it can read without complaints,
// under the right address, with icons that exist, and a service worker in charge.

test('Chrome finds the app installable: manifest, icons and worker are in order', async ({ page, context }) => {
  await page.goto('./')
  await expect(page.getByTestId('welcome')).toBeVisible()
  await workerInCharge(page)
  const home = new URL('./', page.url()).href

  const tools = await context.newCDPSession(page)
  const seen = (await tools.send('Page.getAppManifest')) as { url: string; errors: unknown[]; data?: string }
  expect(seen.url).toBe(`${home}manifest.webmanifest`)
  expect(seen.errors).toEqual([])
  // The only thing in the way is the test itself: its browser window is a private one.
  const { installabilityErrors } = (await tools.send('Page.getInstallabilityErrors')) as { installabilityErrors: { errorId: string }[] }
  expect(installabilityErrors.map((e) => e.errorId).filter((id) => id !== 'in-incognito')).toEqual([])
  // Installed, it is this app and no other on the same site.
  expect(((await tools.send('Page.getAppId')) as { appId?: string }).appId).toBe(home)

  const manifest = (await (await page.request.get(`${home}manifest.webmanifest`)).json()) as {
    name: string
    short_name: string
    start_url: string
    scope: string
    display: string
    theme_color: string
    background_color: string
    icons: { src: string; sizes: string; type: string; purpose: string }[]
  }
  expect(manifest).toMatchObject({ name: 'FoodwishUs', short_name: 'FoodwishUs', display: 'standalone' })
  // Start and scope sit under the app's own path, wherever it is hosted.
  expect(new URL(manifest.start_url, seen.url).href).toBe(home)
  expect(new URL(manifest.scope, seen.url).href).toBe(home)
  // The colours of the paper and of the awning, from the design tokens.
  expect(manifest.background_color.toLowerCase()).toBe('#fff8f0')
  expect(manifest.theme_color.toLowerCase()).toBe('#f6d5dc')

  expect(manifest.icons.map((icon) => `${icon.purpose} ${icon.sizes}`).sort()).toEqual(['any 192x192', 'any 512x512', 'maskable 192x192', 'maskable 512x512'])
  for (const icon of manifest.icons) {
    const size = await page.evaluate(async (url) => {
      const image = await createImageBitmap(await (await fetch(url)).blob())
      return `${image.width}x${image.height}`
    }, new URL(icon.src, seen.url).href)
    expect(size, icon.src).toBe(icon.sizes)
  }
})

// Installed on Android, the app shows up in other apps' share sheets (Pinterest, the
// browser). A shared link opens the app's start address with the text behind a question
// mark; the app turns that into the page that reads recipe links.
test('a link shared to the installed app opens the link reader, with or without a connection', async ({ page, context }) => {
  await page.addInitScript(() => localStorage.setItem('foodwishus.prefs', '{"demoData":true,"demoEmpty":true}'))
  await page.goto('./')
  await workerInCharge(page)
  const home = new URL('./', page.url()).href

  const manifest = (await (await page.request.get(`${home}manifest.webmanifest`)).json()) as { share_target: { action: string; method: string; params: Record<string, string> } }
  // The share lands on the app's own start address, inside its scope.
  expect(new URL(manifest.share_target.action, `${home}manifest.webmanifest`).href).toBe(home)
  expect(manifest.share_target.method).toBe('GET')
  // Chrome reads the manifest, share target included, without complaints.
  const tools = await context.newCDPSession(page)
  expect(((await tools.send('Page.getAppManifest')) as { errors: unknown[] }).errors).toEqual([])

  const shared = `${home}?${manifest.share_target.params.text}=${encodeURIComponent('Look at this pin: https://pin.it/AbC')}`
  await page.goto(shared)
  await expect(page.getByRole('heading', { level: 1, name: 'Recipe from a link' })).toBeVisible()
  await expect(page.getByLabel('Link to the recipe')).toHaveValue('https://pin.it/AbC')
  expect(page.url()).toBe(`${home}#/recipes/import?link=${encodeURIComponent('https://pin.it/AbC')}`)

  // Shared on the train: the app still opens on the reader, and the link is kept.
  await context.setOffline(true)
  await page.goto(shared)
  await expect(page.getByRole('heading', { level: 1, name: 'Recipe from a link' })).toBeVisible()
  await expect(page.getByLabel('Link to the recipe')).toHaveValue('https://pin.it/AbC')
})
