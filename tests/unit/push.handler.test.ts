import { beforeEach, describe, expect, it } from 'vitest'
import { handlePush, SECRET_HEADER, type PushConfig } from '../../supabase/functions/push/handler'
import { fromBase64Url, toBase64Url } from '../../supabase/functions/push/webpush'

// The whole push function, minus its Deno wrapper, run against a stand-in database
// (Supabase's REST dialect) and a stand-in push service. Nothing here leaves the machine.

const SUPABASE = 'https://project.supabase.test'
const SERVICE_KEY = 'service-role-key-for-tests'
const SECRET = 'a-shared-secret-of-decent-length-0123456789'
const H = '11111111-1111-4111-8111-111111111111'
const MIA = '22222222-2222-4222-8222-222222222222'
const LEO = '33333333-3333-4333-8333-333333333333'
const MEAL = '0f8fad5b-d9cb-469f-a165-70867728950e'
const DISH = '55555555-5555-4555-8555-555555555555'
const MENU = '66666666-6666-4666-8666-666666666666'
const REVIEW = '44444444-4444-4444-8444-444444444444'
const NOW = new Date('2026-11-10T17:30:00Z')

type Bytes = Uint8Array<ArrayBuffer>
type Row = Record<string, unknown>
interface Browser {
  id: string
  endpoint: string
  keys: CryptoKeyPair
  publicKey: Bytes
  auth: Bytes
}

const utf8 = (text: string): Bytes => new TextEncoder().encode(text)

async function makeBrowser(name: string): Promise<Browser> {
  const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  return { id: crypto.randomUUID(), endpoint: `https://push.service.test/send/${name}`, keys, publicKey: new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)), auth: crypto.getRandomValues(new Uint8Array(16)) }
}

async function hkdf(salt: Bytes, secret: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8))
}

/** What the browser would read: opens a sealed message with the subscription's own keys. */
async function open(body: Uint8Array, browser: Browser): Promise<Record<string, string>> {
  const salt = body.slice(0, 16)
  const sender = body.slice(21, 21 + body[20])
  const senderKey = await crypto.subtle.importKey('raw', sender, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: senderKey }, browser.keys.privateKey, 256))
  const info = new Uint8Array([...utf8('WebPush: info\0'), ...browser.publicKey, ...sender])
  const ikm = await hkdf(browser.auth, shared, info, 32)
  const key = await crypto.subtle.importKey('raw', await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16), 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12) }, key, body.slice(21 + body[20])))
  return JSON.parse(new TextDecoder().decode(plain.slice(0, plain.lastIndexOf(2)))) as Record<string, string>
}

// ------------------------------------------------------------ the stand-ins --

let tables: Record<string, Row[]>
let pushes: { endpoint: string; headers: Record<string, string>; body: Uint8Array }[]
let dbCalls: { method: string; url: string; headers: Record<string, string> }[]
let pushStatus: Record<string, number>
let dbDown = false
let config: PushConfig
let leoPhone: Browser
let leoTablet: Browser
let miaPhone: Browser

/** Just enough of PostgREST: eq, in and is.null filters on one table. */
function query(table: string, params: URLSearchParams): Row[] {
  let rows = tables[table] ?? []
  for (const [column, filter] of params) {
    if (column === 'select') continue
    if (filter.startsWith('eq.')) rows = rows.filter((row) => String(row[column]) === filter.slice(3))
    else if (filter.startsWith('in.(')) rows = rows.filter((row) => filter.slice(4, -1).split(',').includes(String(row[column])))
    else if (filter === 'is.null') rows = rows.filter((row) => row[column] == null)
    else throw new Error(`the stand-in database does not know the filter ${filter}`)
  }
  return rows
}

const world = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = new URL(String(input))
  const headers = (init.headers ?? {}) as Record<string, string>
  if (url.origin === SUPABASE) {
    dbCalls.push({ method: init.method ?? 'GET', url: url.pathname + url.search, headers })
    if (dbDown) return new Response('{"message":"down"}', { status: 503 })
    const table = url.pathname.replace('/rest/v1/', '')
    if (init.method === 'DELETE') {
      const gone = new Set(query(table, url.searchParams))
      tables[table] = tables[table].filter((row) => !gone.has(row))
      return new Response(null, { status: 204 })
    }
    return new Response(JSON.stringify(query(table, url.searchParams)), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  if (url.origin === 'https://push.service.test') {
    pushes.push({ endpoint: url.href, headers, body: init.body as Uint8Array })
    const status = pushStatus[url.href] ?? 201
    if (status === 0) throw new TypeError('fetch failed')
    return new Response(null, { status })
  }
  throw new Error(`a test must never reach ${url.origin}`)
}) as typeof fetch

const subscription = (browser: Browser, memberId: string, muted: string[] = []): Row => ({
  id: browser.id,
  household_id: H,
  member_id: memberId,
  endpoint: browser.endpoint,
  p256dh: toBase64Url(browser.publicKey),
  auth: toBase64Url(browser.auth),
  muted_types: muted,
})

beforeEach(async () => {
  const vapidKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  config = {
    supabaseUrl: SUPABASE,
    serviceRoleKey: SERVICE_KEY,
    pushSecret: SECRET,
    vapid: {
      publicKey: toBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', vapidKeys.publicKey))),
      privateKey: (await crypto.subtle.exportKey('jwk', vapidKeys.privateKey)).d as string,
      subject: 'mailto:kitchen@example.org',
    },
  }
  leoPhone = await makeBrowser('leo-phone')
  leoTablet = await makeBrowser('leo-tablet')
  miaPhone = await makeBrowser('mia-phone')
  pushes = []
  dbCalls = []
  pushStatus = {}
  dbDown = false
  tables = {
    members: [
      { id: MIA, household_id: H, name: 'Mia', prefs: { lang: 'en' }, disabled_at: null, deleted_at: null },
      { id: LEO, household_id: H, name: 'Leo', prefs: { lang: 'de', theme: 'dark' }, disabled_at: null, deleted_at: null },
    ],
    servings: [
      { id: MEAL, household_id: H, status: 'served', deleted_at: null, dish_id: DISH, menu_id: null, cooked_by: MIA, proposed_by: MIA, planned_date: '2026-11-10', planned_slot: 'dinner', proposed_at: '2026-11-09T10:00:00Z', served_at: '2026-11-10T17:29:30Z' },
    ],
    dishes: [{ id: DISH, household_id: H, name: 'Älplermagronen', deleted_at: null }],
    menus: [{ id: MENU, household_id: H, name: 'Sunday roast', deleted_at: null }],
    reviews: [{ id: REVIEW, household_id: H, serving_id: MEAL, chef_reply: null, chef_reaction: 6, deleted_at: null }],
    push_subscriptions: [subscription(leoPhone, LEO), subscription(leoTablet, LEO), subscription(miaPhone, MIA)],
  }
})

const eventBody = (changes: Row = {}) => ({ type: 'served', household_id: H, actor_id: MIA, serving_id: MEAL, review_id: null, ...changes })

function call(body: unknown, options: { secret?: string | null; method?: string } = {}): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (options.secret !== null) headers[SECRET_HEADER] = options.secret ?? SECRET
  const method = options.method ?? 'POST'
  const request = new Request('https://project.supabase.test/functions/v1/push', { method, headers, body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined })
  return handlePush(request, config, { fetch: world, now: () => NOW })
}

// ---------------------------------------------------------------- the tests --

describe('who may call the function', () => {
  it('refuses a call without the shared secret, or with a wrong one, before looking anything up', async () => {
    expect((await call(eventBody(), { secret: null })).status).toBe(401)
    expect((await call(eventBody(), { secret: 'guess' })).status).toBe(401)
    expect((await call(eventBody(), { secret: `${SECRET}x` })).status).toBe(401)
    expect((await call(eventBody(), { secret: '' })).status).toBe(401)
    expect(dbCalls).toEqual([])
    expect(pushes).toEqual([])
  })

  it('refuses everything while its own secrets are missing, even a call with an empty secret', async () => {
    for (const broken of [{ pushSecret: '' }, { pushSecret: 'short' }, { serviceRoleKey: '' }, { supabaseUrl: '' }, { vapid: { ...config.vapid, privateKey: '' } }, { vapid: { ...config.vapid, subject: '' } }] as Partial<PushConfig>[]) {
      const request = new Request('https://project.supabase.test/functions/v1/push', { method: 'POST', headers: { [SECRET_HEADER]: broken.pushSecret ?? SECRET }, body: JSON.stringify(eventBody()) })
      const answer = await handlePush(request, { ...config, ...broken }, { fetch: world, now: () => NOW })
      expect(answer.status).toBe(500)
    }
    expect(dbCalls).toEqual([])
    expect(pushes).toEqual([])
  })

  it('answers only to POST, and only to events it knows', async () => {
    expect((await call(null, { method: 'GET' })).status).toBe(405)
    expect((await call('not json')).status).toBe(400)
    expect((await call({ type: 'served' })).status).toBe(400)
    expect((await call(eventBody({ type: 'burnt' }))).status).toBe(400)
    expect((await call(eventBody({ serving_id: `${MEAL}&or=(id.neq.x)` }))).status).toBe(400)
    expect(dbCalls).toEqual([])
  })
})

describe('"Served, proof needed!"', () => {
  it('tells the other person once per device, in their language, and nobody else', async () => {
    const answer = await call(eventBody())
    expect(answer.status).toBe(200)
    expect(await answer.json()).toEqual({ type: 'served', sent: 2, gone: 0, failed: 0 })

    expect(pushes.map((p) => p.endpoint).sort()).toEqual([leoPhone.endpoint, leoTablet.endpoint].sort())
    const onPhone = pushes.find((p) => p.endpoint === leoPhone.endpoint)!
    expect(await open(onPhone.body, leoPhone)).toEqual({
      type: 'served',
      title: 'Serviert!',
      body: 'Mia hat Älplermagronen serviert. Beweisfoto bitte!',
      tag: `meal-${MEAL}`,
      url: `/review/${MEAL}`,
    })
    expect(onPhone.headers).toMatchObject({ 'Content-Encoding': 'aes128gcm', TTL: '21600', Urgency: 'high', Topic: MEAL.replaceAll('-', '') })
    // Signed as us, for this push service.
    const [, token, key] = /^vapid t=(.+), k=(.+)$/.exec(onPhone.headers.Authorization) as RegExpExecArray
    expect(key).toBe(config.vapid.publicKey)
    expect(JSON.parse(new TextDecoder().decode(fromBase64Url(token.split('.')[1])))).toMatchObject({ aud: 'https://push.service.test', sub: 'mailto:kitchen@example.org' })
  })

  it('reads the kitchen with the service role, and only this kitchen', async () => {
    await call(eventBody())
    expect(dbCalls.length).toBeGreaterThan(0)
    for (const { headers, url } of dbCalls) {
      expect(headers).toMatchObject({ apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` })
      expect(url).toContain(H)
    }
    // The service role key never travels to the push service.
    for (const push of pushes) expect(JSON.stringify(push.headers)).not.toContain(SERVICE_KEY)
  })

  it('skips a device that muted this kind, and a paused profile altogether', async () => {
    tables.push_subscriptions = [subscription(leoPhone, LEO, ['served']), subscription(leoTablet, LEO, ['planned'])]
    expect(await (await call(eventBody())).json()).toMatchObject({ sent: 1 })
    expect(pushes.map((p) => p.endpoint)).toEqual([leoTablet.endpoint])

    pushes = []
    tables.members[1].disabled_at = '2026-11-01T00:00:00Z'
    expect(await (await call(eventBody())).json()).toMatchObject({ sent: 0 })
    expect(pushes).toEqual([])
  })

  it('forgets a device the push service reports as gone, and only that one', async () => {
    pushStatus[leoPhone.endpoint] = 410
    expect(await (await call(eventBody())).json()).toEqual({ type: 'served', sent: 1, gone: 1, failed: 0 })
    expect(tables.push_subscriptions.map((s) => s.endpoint).sort()).toEqual([leoTablet.endpoint, miaPhone.endpoint].sort())
    expect(dbCalls.filter((c) => c.method === 'DELETE').map((c) => c.url)).toEqual([`/rest/v1/push_subscriptions?id=in.(${leoPhone.id})`])

    pushStatus = { [leoTablet.endpoint]: 404 }
    await call(eventBody())
    expect(tables.push_subscriptions.map((s) => s.endpoint)).toEqual([miaPhone.endpoint])
  })

  it('keeps a device when the push service is merely busy or unreachable', async () => {
    pushStatus[leoPhone.endpoint] = 429
    pushStatus[leoTablet.endpoint] = 0
    expect(await (await call(eventBody())).json()).toEqual({ type: 'served', sent: 0, gone: 0, failed: 2 })
    expect(tables.push_subscriptions).toHaveLength(3)
    expect(dbCalls.filter((c) => c.method === 'DELETE')).toEqual([])
  })

  it('says nothing when "Served" has been taken back in the meantime', async () => {
    tables.servings[0].status = 'planned'
    expect(await (await call(eventBody())).json()).toEqual({ type: 'served', sent: 0, gone: 0, failed: 0 })
    expect(pushes).toEqual([])
  })

  it('says nothing about a meal of another kitchen, or from somebody who is not in this one', async () => {
    const elsewhere = '77777777-7777-4777-8777-777777777777'
    expect(await (await call(eventBody({ household_id: elsewhere }))).json()).toMatchObject({ sent: 0 })
    expect(await (await call(eventBody({ actor_id: elsewhere }))).json()).toMatchObject({ sent: 0 })
    expect(pushes).toEqual([])
  })
})

describe('the other four', () => {
  it('a proposal goes to the eater with a question', async () => {
    tables.servings[0].status = 'wishlist'
    tables.members[1].prefs = {}
    await call(eventBody({ type: 'proposed' }))
    expect(await open(pushes[0].body, pushes[0].endpoint === leoPhone.endpoint ? leoPhone : leoTablet)).toMatchObject({
      title: 'New on the wishlist',
      body: 'Mia put Älplermagronen on the wishlist. How much do you want it?',
      url: `/serving/${MEAL}`,
    })
    expect(pushes[0].headers).toMatchObject({ Urgency: 'normal', TTL: String(48 * 3600) })
  })

  it('a plan names the day; a menu goes by its own name', async () => {
    Object.assign(tables.servings[0], { status: 'planned', planned_date: '2026-11-13', dish_id: null, menu_id: MENU })
    await call(eventBody({ type: 'planned' }))
    const push = pushes.find((p) => p.endpoint === leoPhone.endpoint)!
    expect((await open(push.body, leoPhone)).body).toBe('Mia hat Sunday roast für Freitag zum Abendessen eingeplant. Bring Hunger mit.')
  })

  it('the verdict goes to the cook', async () => {
    tables.servings[0].status = 'eaten'
    expect(await (await call(eventBody({ type: 'reviewed', actor_id: LEO }))).json()).toMatchObject({ sent: 1 })
    expect(pushes.map((p) => p.endpoint)).toEqual([miaPhone.endpoint])
    expect(await open(pushes[0].body, miaPhone)).toMatchObject({ title: 'The verdict is in', body: 'Leo ate Älplermagronen and handed in the verdict. Dare to look?', url: `/serving/${MEAL}` })
  })

  it("the cook's answer goes back to the eater, face or words", async () => {
    tables.servings[0].status = 'eaten'
    tables.members[1].prefs = { lang: 'en' }
    await call(eventBody({ type: 'replied', review_id: REVIEW }))
    expect((await open(pushes.find((p) => p.endpoint === leoPhone.endpoint)!.body, leoPhone)).body).toBe('Mia reacted to your verdict on Älplermagronen.')

    pushes = []
    tables.reviews[0].chef_reply = 'Glad you liked it'
    await call(eventBody({ type: 'replied', review_id: REVIEW }))
    expect((await open(pushes.find((p) => p.endpoint === leoPhone.endpoint)!.body, leoPhone)).body).toBe('Mia answered your verdict on Älplermagronen.')

    // An answer that has been emptied again is not announced.
    pushes = []
    Object.assign(tables.reviews[0], { chef_reply: null, chef_reaction: null })
    expect(await (await call(eventBody({ type: 'replied', review_id: REVIEW }))).json()).toMatchObject({ sent: 0 })
  })
})

describe('when something breaks', () => {
  it('reports a database that is down instead of pretending all went well', async () => {
    dbDown = true
    const answer = await call(eventBody())
    expect(answer.status).toBe(502)
    expect(pushes).toEqual([])
  })

  it('a device with broken keys does not keep the others from hearing', async () => {
    tables.push_subscriptions[0].p256dh = 'not-a-key'
    expect(await (await call(eventBody())).json()).toEqual({ type: 'served', sent: 1, gone: 0, failed: 1 })
    expect(pushes.map((p) => p.endpoint)).toEqual([leoTablet.endpoint])
  })
})
