import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { helperHandler, type Ticket } from '../../supabase/functions/ai/handler'
import { pretendFetch, pretendHelper } from '../../src/data/fake/pretendWeb'
import { SupabaseBackend } from '../../src/data/supabaseBackend'

// The app's real Supabase client, calling the real helper function, with a small server
// on this machine standing in for Supabase itself (its login service and its function
// gateway). This is where the two halves meet before they meet in the real project:
// the address, the headers, the body, and what the client makes of a refusal.

const KEY = 'sb_publishable_test'
const USER = '7b0c5f6e-1111-4222-8333-444455556666'
const base64Url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
const TOKEN = `${base64Url({ alg: 'ES256', typ: 'JWT' })}.${base64Url({ sub: USER, role: 'authenticated', is_anonymous: true, exp: Math.floor(Date.now() / 1000) + 3600 })}.c2lnbmF0dXJl`

let server: Server
let address = ''
let ticket: Ticket = { ok: true, left: 39 }
let deployed = true
const seen: { path: string; method: string; authorization?: string; apikey?: string }[] = []

const body = (request: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let text = ''
    request.on('data', (chunk: Buffer) => (text += chunk.toString('utf8')))
    request.on('end', () => resolve(text))
  })

beforeAll(async () => {
  const handle = helperHandler({
    fetch: pretendFetch(),
    askFetch: pretendHelper(),
    apiKey: 'a-claude-key',
    ticket: async (authorization, apikey) => (authorization === `Bearer ${TOKEN}` && apikey === KEY ? ticket : { ok: false, code: 'not_signed_in' }),
  })
  server = createServer(async (request, response) => {
    const path = (request.url ?? '').split('?')[0]
    seen.push({ path, method: request.method ?? '', authorization: request.headers.authorization, apikey: String(request.headers.apikey ?? '') })
    const text = await body(request)
    const send = (status: number, answer: unknown, headers: Record<string, string> = {}) => {
      response.writeHead(status, { 'content-type': 'application/json', ...headers })
      response.end(typeof answer === 'string' ? answer : JSON.stringify(answer))
    }
    // The login service: every device gets its own invisible login.
    if (path === '/auth/v1/signup') {
      return send(200, { access_token: TOKEN, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refresh-me', user: { id: USER, aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } })
    }
    // The function gateway.
    if (path === '/functions/v1/ai') {
      if (!deployed) return send(404, { code: 'NOT_FOUND', message: 'Requested function was not found' })
      const answer = await handle(new Request(`${address}${path}`, { method: request.method, headers: request.headers as Record<string, string>, body: request.method === 'POST' ? text : undefined }))
      return send(answer.status, await answer.text(), Object.fromEntries(answer.headers))
    }
    send(404, { message: 'nothing here' })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  address = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

beforeEach(() => {
  ticket = { ok: true, left: 39 }
  deployed = true
  seen.length = 0
})

const ask = (link: string) => new SupabaseBackend(address, KEY).askHelper({ job: 'recipe-from-link', link, lang: 'de', translate: true, metric: true, photo: true, knownTags: ['Suppe'] })
const outcome = (link: string) => ask(link).then(() => 'read', (error: { kind: string; code: string }) => `${error.kind}:${error.code}`)

describe('the app asks the helper through the real Supabase client', () => {
  it('logs the device in, sends its login and the project key, and gets a card with the picture', async () => {
    const result = await ask('https://www.lecker-kochen.ch/rezepte/rueeblisuppe')
    expect(result).toMatchObject({ ok: true, by: 'helper', left: 39, source: { url: 'https://www.lecker-kochen.ch/rezepte/rueeblisuppe', site: 'Lecker Kochen' } })
    expect(result.card.name).toBe('Rüeblisuppe mit Ingwer')
    expect(result.card.ingredientLines).toHaveLength(6)
    expect(result.photo?.type).toBe('image/jpeg')

    const call = seen.find((request) => request.path === '/functions/v1/ai' && request.method === 'POST')
    expect(call).toMatchObject({ authorization: `Bearer ${TOKEN}`, apikey: KEY })
  })

  it("hears the helper's own no as its word", async () => {
    expect(await outcome('https://sunnykitchen.com/shop')).toBe('rejected:not_a_recipe')
    expect(await outcome('http://192.168.1.1/admin')).toBe('rejected:blocked')
    ticket = { ok: false, code: 'limit' }
    expect(await outcome('https://sunnykitchen.com/cornbread')).toBe('rejected:limit')
    ticket = { ok: false, code: 'not_member' }
    expect(await outcome('https://sunnykitchen.com/cornbread')).toBe('rejected:not_member')
  })

  it('knows a helper that was never deployed', async () => {
    deployed = false
    expect(await outcome('https://sunnykitchen.com/cornbread')).toBe('rejected:helper_off')
  })
})
