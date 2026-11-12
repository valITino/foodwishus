import { describe, expect, it } from 'vitest'
import { helperResult, SupabaseBackend } from '../../src/data/supabaseBackend'

// Points at a port nothing listens on, so these tests can never reach a real project.
const unreachable = () => new SupabaseBackend('http://127.0.0.1:9', 'sb_publishable_test')

describe('Supabase backend when the cloud cannot be reached', () => {
  it('reports "offline" when signing in fails, so the sync engine simply tries again later', async () => {
    await expect(unreachable().ensureSession()).rejects.toMatchObject({ name: 'BackendError', kind: 'network' })
  })

  it('reports "offline" for pulls and pushes too', async () => {
    const backend = unreachable()
    await expect(backend.pull(null)).rejects.toMatchObject({ kind: 'network' })
    await expect(backend.push({ table: 'dishes', kind: 'patch', id: crypto.randomUUID(), data: { name: 'x' } })).rejects.toMatchObject({ kind: 'network' })
  })
})

describe("the helper's answer, whichever way it arrives", () => {
  const card = { ok: true as const, card: { name: 'Zopf' }, source: { url: 'https://x.ch/zopf', site: null }, photo: null, by: 'page' as const, left: 3 }
  const failed = (response: Response) => ({ name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: response })
  const outcome = (data: unknown, error: unknown) => helperResult(data, error).then((value) => value, (e) => `${e.kind}:${e.code}`)

  it('passes a card on', async () => {
    expect(await outcome(card, null)).toBe(card)
  })

  it("turns the helper's own no into its word", async () => {
    expect(await outcome({ ok: false, code: 'not_a_recipe' }, null)).toBe('rejected:not_a_recipe')
    expect(await outcome(null, failed(new Response(JSON.stringify({ ok: false, code: 'not_member' }), { status: 403 })))).toBe('rejected:not_member')
    expect(await outcome(null, null)).toBe('rejected:helper_down')
  })

  it('knows a helper that is not deployed from one that is down, and both from being offline', async () => {
    expect(await outcome(null, failed(new Response('{"code":"NOT_FOUND","message":"Requested function was not found"}', { status: 404 })))).toBe('rejected:helper_off')
    expect(await outcome(null, failed(new Response('<html>Bad gateway</html>', { status: 502 })))).toBe('network:offline')
    expect(await outcome(null, failed(new Response('<html>Teapot</html>', { status: 418 })))).toBe('rejected:helper_down')
    expect(await outcome(null, { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' })).toBe('network:offline')
  })
})
