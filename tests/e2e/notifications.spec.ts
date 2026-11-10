import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'

// Notifications, installing and the update note, as a person meets them in Settings.
// Two phones against the pretend cloud: Mia cooks, Leo eats. The dev server has no
// service worker and no push service, so the browser's part is stood in for here (the
// worker itself is tested against the production build in tests/pwa). What the cloud
// would hand to the push service is read from the pretend cloud instead of a lock screen.

/** The example key from RFC 8292. Good enough to subscribe a stand-in with. */
const KEY = 'BA1Hxzyi1RUM1b5wjxsn7nGxAszw2u61m164i3MrAIxHF6YK5h4SDYic-dRuU_RCPCfA5aq9ojSwk5Y2EmClBPs'

interface Kit {
  db: { outbox: { count(): Promise<number> }; servings: { toArray(): Promise<{ id: string; status: string }[]> } }
  sync: { sync(): Promise<void> }
  actions: {
    createDish(input: { name: string }): Promise<{ id: string }>
    proposeServing(input: { dishId: string }): Promise<{ id: string }>
    planServing(id: string, day: string, slot: string): Promise<void>
    markServed(id: string): Promise<void>
  }
  announceUpdate(): void
}
const kit = (page: Page) => page.waitForFunction(() => Boolean((window as unknown as { __foodwishus?: Kit }).__foodwishus))

interface Sent {
  endpoint: string
  message: { type: string; title: string; body: string; tag: string; url: string }
}
interface Pushes {
  sent: Sent[]
  devices: { endpoint: string; mutedTypes: string[] }[]
}

const devices: BrowserContext[] = []
test.afterEach(async () => {
  for (const context of devices.splice(0)) await context.close()
})

interface PhoneOptions {
  /** The build's VAPID key. Leave out for "notifications are not set up yet". */
  key?: string
  /** What the browser already thinks about notifications from this site. */
  permission?: 'default' | 'granted' | 'denied'
  /** What the person answers when the browser asks. */
  answer?: 'granted' | 'denied' | 'default'
  lang?: 'en' | 'de'
  theme?: 'light' | 'dark'
  /** Runs as an installed app. */
  installed?: boolean
}

/**
 * A phone whose browser has a push service that works without a network: it remembers
 * the permission and the subscription between page loads, and counts how often it asked.
 */
async function openPhone(browser: Browser, name: string, options: PhoneOptions = {}): Promise<Page> {
  const context = await browser.newContext()
  devices.push(context)
  await context.addInitScript(
    ([who, key, permission, answer, lang, theme, installed]) => {
      if (!localStorage.getItem('foodwishus.lang')) localStorage.setItem('foodwishus.lang', lang)
      if (!localStorage.getItem('foodwishus.theme')) localStorage.setItem('foodwishus.theme', theme)
      if (!localStorage.getItem('rig.permission')) localStorage.setItem('rig.permission', permission)
      const bump = (counter: string) => localStorage.setItem(counter, String(Number(localStorage.getItem(counter) ?? 0) + 1))
      Object.assign(window, {
        __foodwishusPush: {
          vapidKey: key,
          device: {
            supported: () => true,
            permission: () => localStorage.getItem('rig.permission'),
            askPermission: async () => {
              bump('rig.asked')
              localStorage.setItem('rig.permission', answer)
              return answer
            },
            current: async () => JSON.parse(localStorage.getItem('rig.subscription') ?? 'null'),
            subscribe: async () => {
              if (localStorage.getItem('rig.permission') !== 'granted') throw new Error('no permission')
              const subscription = { endpoint: `https://push.example.test/send/${who}`, p256dh: `key-of-${who}`, auth: 'secret' }
              localStorage.setItem('rig.subscription', JSON.stringify(subscription))
              return subscription
            },
            unsubscribe: async () => localStorage.removeItem('rig.subscription'),
          },
        },
      })
      if (installed) {
        const real = window.matchMedia.bind(window)
        window.matchMedia = (query: string) => (query === '(display-mode: standalone)' ? ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList) : real(query))
      }
    },
    [name, options.key ?? '', options.permission ?? 'default', options.answer ?? 'granted', options.lang ?? 'en', options.theme ?? 'light', options.installed ?? false] as const,
  )
  return context.newPage()
}

/** Mia opens the kitchen, Leo joins with her code: the short way, through the workbench. */
async function pair(mia: Page, leo: Page): Promise<void> {
  await mia.goto('/#/lab')
  await mia.getByLabel('Your name').fill('Mia')
  await mia.getByRole('button', { name: 'Start our kitchen' }).click()
  await expect(mia.getByTestId('members')).toHaveText('Mia')
  await mia.getByRole('button', { name: 'Create invite code' }).click()
  const code = (await mia.getByTestId('invite-code').textContent()) ?? ''
  await leo.goto('/#/lab')
  await leo.getByLabel('Your name').fill('Leo')
  await leo.getByLabel('Invite code').fill(code)
  await leo.getByRole('button', { name: 'Join with code' }).click()
  await expect(leo.getByTestId('members')).toHaveText('Leo + Mia')
  await expect(mia.getByTestId('members')).toHaveText('Leo + Mia')
}

async function openNotifications(page: Page): Promise<void> {
  await page.goto('/#/settings')
  await page.getByRole('button', { name: /^(Notifications|Benachrichtigungen)/ }).click()
  await expect(page).toHaveURL(/#\/settings\/notifications$/)
}

const asked = (page: Page) => page.evaluate(() => Number(localStorage.getItem('rig.asked') ?? 0))
const deviceCard = (page: Page) => page.getByTestId('notifications-device')
const toast = (page: Page, text: string) => page.getByText(text, { exact: true }).last()

/** Run something with the app's own actions on this phone, then wait until the cloud has it. */
async function act<T>(page: Page, what: (app: Kit) => Promise<T>): Promise<T> {
  await kit(page)
  const result = await page.evaluate(what as (app: unknown) => Promise<T>, await page.evaluateHandle(() => (window as unknown as { __foodwishus: Kit }).__foodwishus))
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const app = (window as unknown as { __foodwishus: Kit }).__foodwishus
        await app.sync.sync()
        return app.db.outbox.count()
      }),
    )
    .toBe(0)
  return result
}

test('turning notifications on, hearing from the kitchen, muting a kind and turning them off', async ({ browser, request }) => {
  await request.post('/__cloud/reset')
  const mia = await openPhone(browser, 'mia-phone', { key: KEY })
  const leo = await openPhone(browser, 'leo-phone', { key: KEY })
  await pair(mia, leo)
  const pushes = async (): Promise<Pushes> => ((await (await request.get('/__cloud/pushes')).json()) as { result: Pushes }).result
  let mealId = ''

  await test.step('nothing asks for permission by itself', async () => {
    await leo.goto('/#/')
    await expect(leo.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await leo.goto('/#/settings')
    await expect(leo.getByTestId('notifications-state')).toHaveText('Off on this device.')
    await openNotifications(leo)
    await expect(deviceCard(leo)).toHaveAttribute('data-status', 'off')
    await expect(deviceCard(leo)).toContainText('Hear it right away when Mia proposes, plans or serves something')
    await expect(leo.getByTestId('notification-kinds')).toHaveCount(0)
    expect(await asked(leo)).toBe(0)
    expect((await pushes()).devices).toEqual([])
  })

  await test.step('one tap asks, and the device is signed up', async () => {
    await leo.getByRole('button', { name: 'Turn on notifications' }).click()
    await expect(toast(leo, 'Notifications turned on')).toBeVisible()
    await expect(deviceCard(leo)).toHaveAttribute('data-status', 'on')
    await expect(leo.getByTestId('notifications-tag')).toHaveText('On')
    await expect(deviceCard(leo)).toContainText('This device rings when Mia proposes')
    expect(await asked(leo)).toBe(1)
    expect((await pushes()).devices).toEqual([{ endpoint: 'https://push.example.test/send/leo-phone', memberId: expect.any(String), mutedTypes: [] }])

    // One switch for each kind of news, all on.
    const kinds = leo.getByTestId('notification-kinds').getByRole('switch')
    await expect(kinds).toHaveCount(5)
    for (const name of ['A new dish or menu on the wishlist', 'A meal is planned', 'Served, proof needed', 'A verdict is handed in', 'An answer to your verdict']) {
      await expect(leo.getByRole('switch', { name })).toBeChecked()
    }
    // Every control is big enough for a thumb.
    for (const control of await leo.getByTestId('notifications-page').getByRole('button').all()) {
      expect((await control.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
    }
    for (const control of await kinds.all()) expect((await control.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  })

  await test.step('she proposes and serves: he is told, she is not', async () => {
    mealId = await act(mia, async (app) => {
      const dish = await app.actions.createDish({ name: 'Älplermagronen' })
      return (await app.actions.proposeServing({ dishId: dish.id })).id
    })
    await act(mia, async (app) => {
      const meal = (await app.db.servings.toArray())[0]
      await app.actions.markServed(meal.id)
    })
    const { sent } = await pushes()
    expect(sent.map((p) => [p.endpoint, p.message.type])).toEqual([
      ['https://push.example.test/send/leo-phone', 'proposed'],
      ['https://push.example.test/send/leo-phone', 'served'],
    ])
    expect(sent[1].message).toEqual({ type: 'served', title: 'Served!', body: 'Mia served Älplermagronen. Proof needed!', tag: `meal-${mealId}`, url: `/review/${mealId}` })
    // The page the notification opens exists, and is the one with the camera.
    await leo.goto(`/#${sent[1].message.url}`)
    await expect(leo.getByRole('heading', { level: 1, name: 'Proof and verdict' })).toBeVisible()
  })

  await test.step('a muted kind stays quiet, and the choice survives a reload', async () => {
    await openNotifications(leo)
    await leo.getByRole('switch', { name: 'A new dish or menu on the wishlist' }).click()
    await expect(leo.getByRole('switch', { name: 'A new dish or menu on the wishlist' })).not.toBeChecked()
    await expect.poll(async () => (await pushes()).devices[0]?.mutedTypes).toEqual(['proposed'])

    await act(mia, async (app) => {
      const dish = await app.actions.createDish({ name: 'Rösti' })
      await app.actions.proposeServing({ dishId: dish.id })
    })
    expect((await pushes()).sent).toHaveLength(2)

    await leo.reload()
    await expect(deviceCard(leo)).toHaveAttribute('data-status', 'on')
    await expect(leo.getByRole('switch', { name: 'A new dish or menu on the wishlist' })).not.toBeChecked()
    await expect(leo.getByRole('switch', { name: 'Served, proof needed' })).toBeChecked()
    expect(await asked(leo)).toBe(1)
  })

  await test.step('Settings shows the state at a glance', async () => {
    await leo.getByRole('button', { name: 'Back' }).click()
    await expect(leo.getByTestId('notifications-state')).toHaveText('On for this device.')
  })

  await test.step('turning them off removes the device from the cloud', async () => {
    await openNotifications(leo)
    await leo.getByRole('button', { name: 'Turn off notifications' }).click()
    await expect(toast(leo, 'Notifications turned off')).toBeVisible()
    await expect(deviceCard(leo)).toHaveAttribute('data-status', 'off')
    await expect(leo.getByRole('button', { name: 'Turn on notifications' })).toBeVisible()
    expect((await pushes()).devices).toEqual([])
    expect(await leo.evaluate(() => localStorage.getItem('rig.subscription'))).toBeNull()
  })
})

test('logging a device out takes its notifications along', async ({ browser, request }) => {
  await request.post('/__cloud/reset')
  const mia = await openPhone(browser, 'mia-phone', { key: KEY })
  const leo = await openPhone(browser, 'leo-phone', { key: KEY, permission: 'granted' })
  await pair(mia, leo)
  const pushes = async (): Promise<Pushes> => ((await (await request.get('/__cloud/pushes')).json()) as { result: Pushes }).result

  await openNotifications(leo)
  await leo.getByRole('button', { name: 'Turn on notifications' }).click()
  await expect(deviceCard(leo)).toHaveAttribute('data-status', 'on')
  // Permission was there already: no question needed.
  expect(await asked(leo)).toBe(0)
  expect((await pushes()).devices).toHaveLength(1)

  await leo.goto('/#/settings/pin')
  await leo.getByRole('button', { name: 'Log out', exact: true }).click()
  await expect(leo.getByTestId('welcome')).toBeVisible()
  expect((await pushes()).devices).toEqual([])
  expect(await leo.evaluate(() => [localStorage.getItem('rig.subscription'), localStorage.getItem('foodwishus.push')])).toEqual([null, null])

  // Nothing reaches the device she no longer shares a kitchen with.
  await act(mia, async (app) => {
    const dish = await app.actions.createDish({ name: 'Fondue' })
    await app.actions.proposeServing({ dishId: dish.id })
  })
  expect((await pushes()).sent).toEqual([])
})

test('a blocked browser gets told how to unblock, in words, and nothing to tap', async ({ browser, request }) => {
  await request.post('/__cloud/reset')
  const mia = await openPhone(browser, 'mia-phone', { key: KEY, answer: 'denied', lang: 'de', theme: 'dark' })
  const leo = await openPhone(browser, 'leo-phone', { key: KEY })
  await pair(mia, leo)

  await openNotifications(mia)
  await expect(mia.getByRole('heading', { level: 1, name: 'Benachrichtigungen' })).toBeVisible()
  await mia.getByRole('button', { name: 'Benachrichtigungen einschalten' }).click()
  await expect(deviceCard(mia)).toHaveAttribute('data-status', 'blocked')
  await expect(mia.getByTestId('notifications-tag')).toHaveText('Blockiert')
  await expect(deviceCard(mia).getByRole('note')).toContainText('Tippe auf das Symbol links neben der Adresse, dann auf «Berechtigungen», dann auf «Benachrichtigungen»')
  await expect(deviceCard(mia).getByRole('button')).toHaveCount(0)
  await expect(mia.getByTestId('notification-kinds')).toHaveCount(0)
  expect(await asked(mia)).toBe(1)

  // Still blocked after a reload, without asking again.
  await mia.reload()
  await expect(deviceCard(mia)).toHaveAttribute('data-status', 'blocked')
  expect(await asked(mia)).toBe(1)
  await mia.goto('/#/settings')
  await expect(mia.getByTestId('notifications-state')).toHaveText('Im Browser blockiert.')

  // Unblocked in the browser's settings: coming back to the page offers the button again.
  await openNotifications(mia)
  await mia.evaluate(() => {
    localStorage.setItem('rig.permission', 'default')
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(mia.getByRole('button', { name: 'Benachrichtigungen einschalten' })).toBeVisible()
})

test('a closed question is not a no: the page says what to do', async ({ browser, request }) => {
  await request.post('/__cloud/reset')
  const mia = await openPhone(browser, 'mia-phone', { key: KEY, answer: 'default' })
  const leo = await openPhone(browser, 'leo-phone', { key: KEY })
  await pair(mia, leo)
  await openNotifications(mia)
  await mia.getByRole('button', { name: 'Turn on notifications' }).click()
  await expect(mia.getByRole('alert')).toHaveText('The question was closed without an answer. Tap again and choose "Allow".')
  await expect(deviceCard(mia)).toHaveAttribute('data-status', 'off')
  await expect(mia.getByRole('button', { name: 'Turn on notifications' })).toBeEnabled()
})

test('without a key the page says notifications are not set up yet, and offers nothing to tap', async ({ browser, request }) => {
  await request.post('/__cloud/reset')
  const mia = await openPhone(browser, 'mia-phone')
  const leo = await openPhone(browser, 'leo-phone')
  await pair(mia, leo)

  await mia.goto('/#/settings')
  await expect(mia.getByTestId('notifications-state')).toHaveText('Not set up yet.')
  await openNotifications(mia)
  await expect(deviceCard(mia)).toHaveAttribute('data-status', 'unconfigured')
  await expect(deviceCard(mia)).toContainText('Notifications are not set up for this kitchen yet.')
  await expect(mia.getByTestId('notifications-page').getByRole('button')).toHaveCount(0)
  await expect(mia.getByTestId('notifications-page').getByRole('switch')).toHaveCount(0)
  expect(await asked(mia)).toBe(0)
})

test('the demo kitchen has no notifications to offer', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('foodwishus.prefs', '{"demoData":true,"demoEmpty":true}')
    localStorage.setItem('foodwishus.lang', 'en')
  })
  await page.goto('/#/settings')
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'This device' })).toBeVisible()
  await expect(page.getByTestId('notifications-state')).toHaveCount(0)
  await expect(page.getByTestId('install-card')).toBeVisible()
  // Its address leads back to Settings.
  await page.goto('/#/settings/notifications')
  await expect(page.getByTestId('notifications-page')).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
})

test.describe('installing', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('foodwishus.prefs', '{"demoData":true,"demoEmpty":true}')
      if (!localStorage.getItem('foodwishus.lang')) localStorage.setItem('foodwishus.lang', 'en')
    })
  })

  /** Chrome's offer to install, as a page sees it. Records what happens to it. */
  const offerInstall = (page: Page, outcome: 'accepted' | 'dismissed') =>
    page.evaluate((answer) => {
      const offer = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt: async () => void Object.assign(window, { promptShown: true }),
        userChoice: Promise.resolve({ outcome: answer }),
      })
      window.dispatchEvent(offer)
      // Chrome's own banner stays away only if the page asked for that.
      Object.assign(window, { bannerPrevented: offer.defaultPrevented })
    }, outcome)

  test('without an offer from the browser, one sentence says where to find it', async ({ page }) => {
    await page.goto('/#/settings')
    const card = page.getByTestId('install-card')
    await expect(card.getByRole('heading', { name: 'Install FoodwishUs' })).toBeVisible()
    await expect(card).toContainText('open the Chrome menu (the three dots) and tap "Install app" or "Add to Home screen"')
    await expect(card.getByRole('button')).toHaveCount(0)

    await page.getByRole('radio', { name: 'Deutsch' }).click()
    await expect(card.getByRole('heading', { name: 'FoodwishUs installieren' })).toBeVisible()
    await expect(card).toContainText('tippe auf «App installieren» oder «Zum Startbildschirm hinzufügen»')
  })

  test("with Chrome's offer it is one tap, and the card goes away once installed", async ({ page }) => {
    await page.goto('/#/settings')
    const card = page.getByTestId('install-card')
    await expect(card).toBeVisible()
    await offerInstall(page, 'accepted')
    expect(await page.evaluate(() => (window as unknown as { bannerPrevented: boolean }).bannerPrevented)).toBe(true)
    await expect(card).toContainText('It opens like any other app, also without a connection.')

    const button = card.getByRole('button', { name: 'Install FoodwishUs' })
    expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
    // Nothing pops up until the tap.
    expect(await page.evaluate(() => (window as unknown as { promptShown?: boolean }).promptShown)).toBeUndefined()
    await button.click()
    expect(await page.evaluate(() => (window as unknown as { promptShown?: boolean }).promptShown)).toBe(true)
    await expect(page.getByText('Installed', { exact: true }).last()).toBeVisible()
    await expect(card).toHaveCount(0)
  })

  test('"not now" in Chrome\'s prompt leaves the manual way', async ({ page }) => {
    await page.goto('/#/settings')
    const card = page.getByTestId('install-card')
    await offerInstall(page, 'dismissed')
    await card.getByRole('button', { name: 'Install FoodwishUs' }).click()
    await expect(card.getByRole('button')).toHaveCount(0)
    await expect(card).toContainText('open the Chrome menu')
  })

  test('an app that already runs installed shows no card, and no banner anywhere', async ({ browser }) => {
    const page = await openPhone(browser, 'installed', { installed: true })
    await page.addInitScript(() => localStorage.setItem('foodwishus.prefs', '{"demoData":true,"demoEmpty":true}'))
    await page.goto('/#/settings')
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Sync' })).toBeVisible()
    await expect(page.getByTestId('install-card')).toHaveCount(0)
    // In the demo kitchen that leaves the section empty, so it is not shown at all.
    await expect(page.getByRole('heading', { name: 'This device' })).toHaveCount(0)
    await page.goto('/#/')
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await expect(page.getByText(/install/i)).toHaveCount(0)
  })
})

test('the update note: says a new version is ready, and "Later" puts it away', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('foodwishus.prefs', '{"demoData":true,"demoEmpty":true}')
    localStorage.setItem('foodwishus.lang', 'de')
  })
  await page.goto('/#/')
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
  const note = page.getByTestId('update-note')
  await expect(note).toHaveCount(0)

  await kit(page)
  await page.evaluate(() => (window as unknown as { __foodwishus: Kit }).__foodwishus.announceUpdate())
  await expect(note).toBeVisible()
  await expect(note).toContainText('Eine neue Version ist da.')
  const reload = note.getByRole('button', { name: 'Neu laden' })
  const later = note.getByRole('button', { name: 'Später' })
  for (const control of [reload, later]) expect((await control.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  // It floats above the tab bar without covering it.
  const [noteBox, tabsBox] = await Promise.all([note.boundingBox(), page.getByRole('navigation', { name: 'Main' }).boundingBox()])
  expect((noteBox?.y ?? 0) + (noteBox?.height ?? 0)).toBeLessThan(tabsBox?.y ?? 0)
  // It stays while the person moves around, and is never in the way of a sheet.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Rezepte' }).click()
  await expect(note).toBeVisible()

  await later.click()
  await expect(note).toHaveCount(0)

  // "Reload" reloads: the note is gone with the old page.
  await page.evaluate(() => {
    Object.assign(window, { beforeReload: true })
    ;(window as unknown as { __foodwishus: Kit }).__foodwishus.announceUpdate()
  })
  await reload.click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { beforeReload?: boolean }).beforeReload).catch(() => true)).toBeUndefined()
  await expect(note).toHaveCount(0)
})
