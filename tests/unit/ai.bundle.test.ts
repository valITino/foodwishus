import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { pretendFetch, pretendHelper } from '../../src/data/fake/pretendWeb'

// The helper is deployed as ONE file: `npm run build:ai` bundles it into
// supabase/functions/ai/dist/index.js. This test builds that very file, loads it the way
// Supabase's runtime would (with a stand-in for the `Deno` it expects) and runs real
// requests through it: the database, the web and the Claude API are stood in for.

const root = join(__dirname, '../..')
const file = join(root, 'supabase/functions/ai/dist/index.js')
const SUPABASE = 'https://project.supabase.test'
const ANON = 'the-functions-own-project-key'
const APP_KEY = 'sb_publishable_the_key_the_app_sends'
const CLAUDE_KEY = 'a-claude-key-that-lives-only-in-the-secrets'
const LOGIN = 'Bearer a-login-of-somebody-in-the-kitchen'

type Served = (request: Request) => Promise<Response>
let printed = ''
let bundle = ''
let withKey: Served
let withoutKey: Served

let ticket: () => Response = () => new Response('39')
const ticketCalls: Record<string, string>[] = []
const claudeCalls: { key?: string; version?: string; model?: string; system?: string }[] = []
const pages: string[] = []

/** Everything outside the function: the database's ticket counter, the Claude API, the web. */
const world = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = String(input)
  if (url === `${SUPABASE}/rest/v1/rpc/ai_ticket`) {
    ticketCalls.push(init.headers as Record<string, string>)
    return ticket()
  }
  if (url === 'https://api.anthropic.com/v1/messages') return pretendHelper({ asked: claudeCalls })(url, init as never)
  if (url.startsWith(SUPABASE)) throw new Error(`the helper has no business at ${url}`)
  return pretendFetch(pages)(url, init as never)
}) as typeof fetch

async function load(env: Record<string, string>): Promise<Served> {
  let served: Served | undefined
  vi.stubGlobal('Deno', { env: { get: (name: string) => env[name] }, serve: (handler: Served) => void (served = handler) })
  await import(/* @vite-ignore */ `${pathToFileURL(file).href}?built=${Date.now()}-${Object.keys(env).length}`)
  if (!served) throw new Error('the bundle did not call Deno.serve')
  return served
}

const post = (served: Served, body: unknown, headers: Record<string, string> = { authorization: LOGIN, apikey: APP_KEY }) =>
  served(new Request(`${SUPABASE}/functions/v1/ai`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }))
const recipe = (link: string, more: object = {}) => ({ job: 'recipe-from-link', link, lang: 'de', translate: true, metric: true, photo: false, knownTags: [], ...more })

beforeAll(async () => {
  printed = execFileSync('node', ['tools/build-ai.mjs'], { cwd: root, encoding: 'utf8' })
  bundle = readFileSync(file, 'utf8')
  vi.stubGlobal('fetch', world)
  withKey = await load({ SUPABASE_URL: SUPABASE, SUPABASE_ANON_KEY: ANON, ANTHROPIC_API_KEY: CLAUDE_KEY })
  withoutKey = await load({ SUPABASE_URL: SUPABASE, SUPABASE_ANON_KEY: ANON })
}, 60_000)

beforeEach(() => {
  ticket = () => new Response('39')
  ticketCalls.length = 0
  claudeCalls.length = 0
  pages.length = 0
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('the one file that gets deployed as the helper', () => {
  it('stands alone, and carries no key and nothing of the pretend web', () => {
    expect(bundle).not.toMatch(/^\s*(import|export)\s/m)
    expect(bundle).not.toContain('@__PURE__')
    expect(bundle).not.toMatch(/sk-ant-|pretend/i)
    // It asks its environment for the two things Supabase gives every function and the two secrets the owner may set.
    expect([...new Set([...bundle.matchAll(/Deno\.env\.get\("(\w+)"\)/g)].map(([, name]) => name))].sort()).toEqual(['AI_MODEL', 'ANTHROPIC_API_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_URL'])
    // Readable: not minified.
    expect(bundle.split('\n').length).toBeGreaterThan(400)
    // Four jobs and their instructions. Much more than this would mean something else got bundled in.
    expect(bundle.length).toBeLessThan(70_000)
  })

  it('is the file whose size and checksum the build prints', () => {
    const bytes = Buffer.from(bundle, 'utf8')
    expect(printed).toContain('supabase/functions/ai/dist/index.js')
    expect(printed).toContain(`size    ${bytes.length} bytes`)
    expect(printed).toContain(`sha256  ${createHash('sha256').update(bytes).digest('hex')}`)
    // Building twice gives the same file, byte for byte.
    expect(execFileSync('node', ['tools/build-ai.mjs'], { cwd: root, encoding: 'utf8' })).toBe(printed)
    expect(readFileSync(file, 'utf8')).toBe(bundle)
  })

  it("lets the browser through: every header the Supabase client may send is allowed", async () => {
    const { corsHeaders } = await import('@supabase/supabase-js/cors')
    const preflight = await withKey(new Request(`${SUPABASE}/functions/v1/ai`, { method: 'OPTIONS', headers: { origin: 'https://valitino.github.io', 'access-control-request-method': 'POST' } }))
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe('*')
    const allowed = (preflight.headers.get('access-control-allow-headers') ?? '').split(',').map((name) => name.trim().toLowerCase())
    for (const name of corsHeaders['Access-Control-Allow-Headers'].split(',')) expect(allowed, name).toContain(name.trim().toLowerCase())
    expect(preflight.headers.get('access-control-allow-methods')).toContain('POST')
    // Answers carry the permission too, or the browser would hide them from the app.
    const answer = await post(withKey, recipe('https://sunnykitchen.com/cornbread'))
    expect(answer.headers.get('access-control-allow-origin')).toBe('*')
    expect(ticketCalls).toHaveLength(1)
  })

  it('refuses whoever comes without a login, before anything is asked or fetched', async () => {
    const response = await post(withKey, recipe('https://sunnykitchen.com/cornbread'), {})
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ ok: false, code: 'not_signed_in' })
    expect(ticketCalls).toHaveLength(0)
    expect(pages).toHaveLength(0)
    expect(claudeCalls).toHaveLength(0)
  })

  it("asks the database for a ticket as the caller, with the app's project key", async () => {
    await post(withKey, recipe('https://sunnykitchen.com/cornbread'))
    expect(ticketCalls).toEqual([{ apikey: APP_KEY, authorization: LOGIN, 'content-type': 'application/json' }])
    // Without a key from the app, the function's own is used.
    await post(withKey, recipe('https://sunnykitchen.com/cornbread'), { authorization: LOGIN })
    expect(ticketCalls[1].apikey).toBe(ANON)
  })

  it('turns a link into a recipe card, and the key travels in one header only', async () => {
    const response = await post(withKey, recipe('https://sunnykitchen.com/cornbread'))
    const answer = (await response.json()) as { ok: boolean; card: { name: string; ingredientLines: string[] }; by: string; left: number; source: { url: string } }
    expect(answer).toMatchObject({ ok: true, by: 'helper', left: 39, source: { url: 'https://sunnykitchen.com/cornbread' } })
    expect(answer.card.name).toBe('Maisbrot aus der Pfanne')
    expect(answer.card.ingredientLines[0]).toBe('210 g Maisgriess')
    expect(claudeCalls).toHaveLength(1)
    expect(claudeCalls[0]).toMatchObject({ key: CLAUDE_KEY, version: '2023-06-01', model: 'claude-haiku-5-5' })
    expect(claudeCalls[0].system).toContain('Write in German')
    expect(JSON.stringify(answer)).not.toContain(CLAUDE_KEY)
    // The web got the page, never the key or the login.
    expect(pages).toEqual(['https://sunnykitchen.com/cornbread'])
  })

  it('follows a pin to the recipe behind it and brings the picture when asked', async () => {
    const answer = (await (await post(withKey, recipe('https://pin.it/AbC', { photo: true }))).json()) as { ok: boolean; source: { url: string; site: string }; photo: { type: string; base64: string } | null }
    expect(answer).toMatchObject({ ok: true, source: { url: 'https://www.lecker-kochen.ch/rezepte/rueeblisuppe', site: 'Lecker Kochen' } })
    expect(answer.photo?.type).toBe('image/jpeg')
    expect(answer.photo?.base64.length).toBeGreaterThan(100)
  })

  it('says so when the day is used up, and when the caller has no seat in a kitchen', async () => {
    ticket = () => new Response(JSON.stringify({ code: 'P0001', message: 'ai_limit' }), { status: 400 })
    const usedUp = await post(withKey, recipe('https://sunnykitchen.com/cornbread'))
    expect([usedUp.status, await usedUp.json()]).toEqual([200, { ok: false, code: 'limit' }])

    ticket = () => new Response(JSON.stringify({ code: 'P0001', message: 'not_in_kitchen' }), { status: 400 })
    const noSeat = await post(withKey, recipe('https://sunnykitchen.com/cornbread'))
    expect([noSeat.status, await noSeat.json()]).toEqual([403, { ok: false, code: 'not_member' }])

    ticket = () => new Response('{"message":"JWT expired"}', { status: 401 })
    const expired = await post(withKey, recipe('https://sunnykitchen.com/cornbread'))
    expect(await expired.json()).toEqual({ ok: false, code: 'not_signed_in' })
    // None of them cost a page or a question.
    expect(pages).toHaveLength(0)
    expect(claudeCalls).toHaveLength(0)
  })

  it("without a key it still reads a page's own recipe data, and says what it cannot do", async () => {
    const own = (await (await post(withoutKey, recipe('https://www.lecker-kochen.ch/rezepte/rueeblisuppe'))).json()) as { ok: boolean; by: string; card: { name: string } }
    expect(own).toMatchObject({ ok: true, by: 'page', card: { name: 'Rüeblisuppe mit Ingwer' } })
    expect(await (await post(withoutKey, recipe('https://sunnykitchen.com/cornbread'))).json()).toEqual({ ok: false, code: 'helper_off' })
    expect(claudeCalls).toHaveLength(0)
  })

  it('never fetches an address that is not a public page', async () => {
    for (const link of ['http://localhost:54321/rest/v1/', 'http://169.254.169.254/latest/meta-data/', 'http://192.168.1.1/admin', `${SUPABASE}/rest/v1/members`]) {
      expect(await (await post(withKey, recipe(link))).json(), link).toEqual({ ok: false, code: 'blocked' })
    }
    expect(pages).toHaveLength(0)
  })
})
