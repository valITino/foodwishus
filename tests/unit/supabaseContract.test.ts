// The real cloud cannot be reached from the test machine, so this test stands in a small
// local server that speaks Supabase's HTTP dialect and checks two things:
//
//   1. Every database function the app calls exists in supabase/migrations, with exactly
//      the parameter names the app sends. A typo here would only show up on a real phone.
//   2. The app understands the answers: wrong PIN, paused name, taken name and so on.

import { readdirSync, readFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { SupabaseBackend } from '../../src/data/supabaseBackend'

// ------------------------------------------------- what the migrations define --

interface Signature {
  /** Every parameter, in order. */
  params: string[]
  /** Parameters the caller must send (no default). */
  required: string[]
}

/** The public functions that exist after all migrations have run. */
function functionsInMigrations(): Map<string, Signature> {
  const dir = join(__dirname, '../../supabase/migrations')
  const found = new Map<string, Signature>()
  for (const file of readdirSync(dir).sort()) {
    const sql = readFileSync(join(dir, file), 'utf8')
    const statement = /(create\s+(?:or\s+replace\s+)?function|drop\s+function)\s+public\.(\w+)\s*\(([^)]*)\)/gi
    for (const [, verb, name, args] of sql.matchAll(statement)) {
      if (/^drop/i.test(verb)) {
        found.delete(name)
        continue
      }
      const parts = args.split(',').map((a) => a.trim()).filter(Boolean)
      found.set(name, {
        params: parts.map((a) => a.split(/\s+/)[0]),
        required: parts.filter((a) => !/\sdefault\s/i.test(a)).map((a) => a.split(/\s+/)[0]),
      })
    }
  }
  return found
}

// ------------------------------------------------------- the stand-in server --

type Reply = { status?: number; body: unknown }
const calls: { fn: string; args: Record<string, unknown> }[] = []
const patches: { table: string; body: Record<string, unknown> }[] = []
let answers: Record<string, Reply> = {}
let patchAnswer: Reply = { status: 204, body: null }
let server: Server
let url = ''

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (c: Buffer) => (raw += c.toString('utf8')))
    req.on('end', () => resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {}))
  })
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const path = (req.url ?? '').split('?')[0]
    const body = await readJson(req)
    const send = (reply: Reply) => {
      res.statusCode = reply.status ?? 200
      res.setHeader('content-type', 'application/json')
      res.end(reply.body === null ? '' : JSON.stringify(reply.body))
    }
    if (path === '/auth/v1/signup') {
      const exp = Math.floor(Date.now() / 1000) + 3600
      const id = '11111111-1111-4111-8111-111111111111'
      return send({
        body: {
          access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: id, role: 'authenticated', exp })}.sig`,
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: exp,
          refresh_token: 'refresh',
          user: { id, aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
        },
      })
    }
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.slice('/rest/v1/rpc/'.length)
      calls.push({ fn, args: body })
      return send(answers[fn] ?? { body: null })
    }
    if (path.startsWith('/rest/v1/') && (req.method === 'PATCH' || req.method === 'POST')) {
      patches.push({ table: path.slice('/rest/v1/'.length), body })
      return send(patchAnswer)
    }
    send({ status: 404, body: { message: 'not found' } })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>((resolve) => void server.close(() => resolve())))

beforeEach(() => {
  calls.length = 0
  patches.length = 0
  answers = {}
  patchAnswer = { status: 204, body: null }
})

const backend = () => new SupabaseBackend(url, 'sb_publishable_test')
const refuse = (message: string, code = 'P0001'): Reply => ({ status: 400, body: { code, message, details: null, hint: null } })
const seat = { household_id: 'h1', member_id: 'm1' }

// ----------------------------------------------------------------- the tests --

describe('the app and the database agree on every function', () => {
  it('calls only functions that exist, with the parameter names they declare', async () => {
    const defined = functionsInMigrations()
    answers = {
      my_membership: { body: { ...seat, paused: false } },
      kitchen_exists: { body: true },
      create_household: { body: seat },
      create_invite: { body: { code: 'ABCDEFGHJK', kind: 'join', expires_at: '2026-11-12T10:00:00Z' } },
      peek_invite: { body: { kind: 'join', kitchen_name: 'Casa', host: null, profile: null } },
      join_household: { body: { ...seat, kind: 'join' } },
      sign_in_with_pin: { body: { ok: true, ...seat } },
      sign_out_other_devices: { body: 2 },
      sign_out_member: { body: 1 },
      sync_pull: { body: { server_time: '2026-11-10T10:00:00Z', seat: 'ok' } },
    }
    const b = backend()
    const me = { name: 'Leo', avatar: 'fork', color: 'sage', accessory: 'bow', status: 'Always Huuungryyyyy', defaultRole: 'taster' as const }
    await b.membership()
    await b.kitchenExists()
    await b.createHousehold('Casa', me, '314159')
    await b.createInvite('join')
    await b.createInvite('restore', 'm2')
    await b.peekInvite('ABCDE-FGHJK')
    await b.joinHousehold('ABCDEFGHJK', me, '314159')
    await b.signInWithPin('Leo', '314159')
    await b.setPin('864209')
    await b.signOutDevice()
    await b.signOutOtherDevices()
    await b.setMemberPaused('m2', true)
    await b.signOutMember('m2')
    await b.pull(null)
    await b.savePushSubscription({ endpoint: 'https://push.example.test/send/abc', p256dh: 'BPublicKey', auth: 'AuthSecret', mutedTypes: ['served'], userAgent: 'Test browser' })
    await b.savePushSubscription({ endpoint: 'https://push.example.test/send/abc', p256dh: 'BPublicKey', auth: 'AuthSecret', mutedTypes: [] })
    await b.setPushMuted('https://push.example.test/send/abc', ['proposed', 'replied'])
    await b.removePushSubscription('https://push.example.test/send/abc')

    const used = new Set(calls.map((c) => c.fn))
    expect([...used].sort()).toEqual(
      [
        'create_household',
        'create_invite',
        'join_household',
        'kitchen_exists',
        'my_membership',
        'peek_invite',
        'remove_push_subscription',
        'save_push_subscription',
        'set_member_paused',
        'set_pin',
        'set_push_muted',
        'sign_in_with_pin',
        'sign_out_device',
        'sign_out_member',
        'sign_out_other_devices',
        'sync_pull',
      ].sort(),
    )
    for (const { fn, args } of calls) {
      const signature = defined.get(fn)
      expect(signature, `${fn} is not defined in supabase/migrations`).toBeDefined()
      const sent = Object.keys(args)
      expect(sent.filter((name) => !signature!.params.includes(name)), `${fn} was sent parameters it does not have`).toEqual([])
      expect(signature!.required.filter((name) => !sent.includes(name)), `${fn} is missing required parameters`).toEqual([])
    }
    // Nothing the app could call is left over from the recovery-key days.
    expect([...defined.keys()].filter((name) => /recover/.test(name))).toEqual([])
  })

  it('signs a device up for notifications with the names the database expects', async () => {
    const b = backend()
    await b.savePushSubscription({ endpoint: 'https://push.example.test/send/abc', p256dh: 'BPublicKey', auth: 'AuthSecret', mutedTypes: ['served', 'replied'], userAgent: 'Test browser' })
    await b.setPushMuted('https://push.example.test/send/abc', [])
    await b.removePushSubscription('https://push.example.test/send/abc')
    expect(calls).toEqual([
      { fn: 'save_push_subscription', args: { p_endpoint: 'https://push.example.test/send/abc', p_p256dh: 'BPublicKey', p_auth: 'AuthSecret', p_muted_types: ['served', 'replied'], p_user_agent: 'Test browser' } },
      { fn: 'set_push_muted', args: { p_endpoint: 'https://push.example.test/send/abc', p_muted_types: [] } },
      { fn: 'remove_push_subscription', args: { p_endpoint: 'https://push.example.test/send/abc' } },
    ])
    // The table itself is closed to the app (0007): nothing may go around the functions.
    expect(patches).toEqual([])
  })

  it('sends the profile in the database\'s spelling', async () => {
    answers = { create_household: { body: seat } }
    await backend().createHousehold('Casa', { name: 'Leo', accessory: 'bow', status: 'Hungry', defaultRole: 'taster' }, '314159')
    expect(calls[0].args).toEqual({ p_household_name: 'Casa', p_member: { name: 'Leo', accessory: 'bow', status: 'Hungry', default_role: 'taster' }, p_pin: '314159' })
  })
})

describe('the app understands the database\'s answers', () => {
  it('reads who is logged in, paused or not', async () => {
    answers = { my_membership: { body: { ...seat, paused: true } } }
    expect(await backend().membership()).toEqual({ householdId: 'h1', memberId: 'm1', paused: true })
    answers = { my_membership: { body: { ...seat, paused: false } } }
    expect(await backend().membership()).toEqual({ householdId: 'h1', memberId: 'm1' })
    answers = { my_membership: { body: null } }
    expect(await backend().membership()).toBeNull()
  })

  it('turns a wrong PIN, a paused name and a paused profile into the matching refusals', async () => {
    const b = backend()
    answers = { sign_in_with_pin: { body: { ok: false, reason: 'wrong', tries_left: 3 } } }
    await expect(b.signInWithPin('Leo', '000001')).rejects.toMatchObject({ kind: 'rejected', code: 'pin_wrong', details: { triesLeft: 3 } })
    answers = { sign_in_with_pin: { body: { ok: false, reason: 'locked', retry_at: '2026-11-10T12:15:00+00:00' } } }
    await expect(b.signInWithPin('Leo', '000001')).rejects.toMatchObject({ code: 'pin_locked', details: { retryAt: '2026-11-10T12:15:00+00:00' } })
    answers = { sign_in_with_pin: { body: { ok: false, reason: 'paused' } } }
    await expect(b.signInWithPin('Leo', '314159')).rejects.toMatchObject({ code: 'account_paused' })
    answers = { sign_in_with_pin: { body: { ok: true, ...seat } } }
    await expect(b.signInWithPin('Leo', '314159')).resolves.toEqual({ householdId: 'h1', memberId: 'm1' })
  })

  it('passes on the database\'s own refusals by name', async () => {
    const b = backend()
    for (const code of ['pin_invalid', 'pin_too_simple', 'name_taken', 'invite_invalid', 'kitchen_full', 'kitchen_already_exists', 'already_in_kitchen']) {
      answers = { join_household: refuse(code) }
      await expect(b.joinHousehold('ABCDEFGHJK', { name: 'Leo' }, '314159'), code).rejects.toMatchObject({ kind: 'rejected', code })
    }
    for (const code of ['admin_only', 'not_yourself', 'member_not_found', 'not_in_kitchen']) {
      answers = { set_member_paused: refuse(code) }
      await expect(b.setMemberPaused('m2', true), code).rejects.toMatchObject({ kind: 'rejected', code })
    }
    for (const code of ['not_in_kitchen', 'push_invalid']) {
      answers = { save_push_subscription: refuse(code) }
      await expect(b.savePushSubscription({ endpoint: 'https://push.example.test/x', p256dh: 'k', auth: 'a', mutedTypes: [] }), code).rejects.toMatchObject({ kind: 'rejected', code })
    }
    answers = { set_push_muted: refuse('push_missing') }
    await expect(b.setPushMuted('https://push.example.test/x', ['served'])).rejects.toMatchObject({ kind: 'rejected', code: 'push_missing' })
  })

  it('shows who invites before the code is used', async () => {
    answers = { peek_invite: { body: { kind: 'restore', kitchen_name: 'Casa', host: { name: 'Mia', avatar: 'whisk', color: 'rose', accessory: 'bow', default_role: 'chef' }, profile: { name: 'Leo', avatar: 'fork', color: 'sage', accessory: null, default_role: 'taster' } } } }
    expect(await backend().peekInvite('abcde-fghjk')).toEqual({
      kind: 'restore',
      kitchenName: 'Casa',
      host: { name: 'Mia', avatar: 'whisk', color: 'rose', accessory: 'bow', defaultRole: 'chef' },
      profile: { name: 'Leo', avatar: 'fork', color: 'sage', accessory: null, defaultRole: 'taster' },
    })
  })

  it('learns from a pull whether the device still has its seat', async () => {
    const b = backend()
    for (const state of ['ok', 'paused', 'gone'] as const) {
      answers = { sync_pull: { body: { server_time: '2026-11-10T10:00:00Z', seat: state, members: [{ id: 'm1', household_id: 'h1', is_admin: true, disabled_at: null, default_role: 'taster', prefs: { lang: 'de' } }] } } }
      const pulled = await b.pull(null)
      expect(pulled.seat).toBe(state)
      expect(pulled.tables.members).toEqual([{ id: 'm1', householdId: 'h1', isAdmin: true, disabledAt: null, defaultRole: 'taster', prefs: { lang: 'de' } }])
    }
  })

  it('explains a refused rename as "name taken"', async () => {
    patchAnswer = { status: 409, body: { code: '23505', message: 'duplicate key value violates unique constraint "members_household_name_key"', details: null, hint: null } }
    await expect(backend().push({ table: 'members', kind: 'patch', id: 'm1', data: { name: 'Mia' } })).rejects.toMatchObject({ kind: 'rejected', code: 'name_taken' })
  })

  it('sends profile changes with the database\'s column names and never its clock', async () => {
    await backend().push({ table: 'members', kind: 'patch', id: 'm1', data: { defaultRole: 'chef', prefs: { showCalories: false }, updatedAt: '2026-01-01T00:00:00Z' } })
    expect(patches).toEqual([{ table: 'members', body: { default_role: 'chef', prefs: { showCalories: false } } }])
  })
})
