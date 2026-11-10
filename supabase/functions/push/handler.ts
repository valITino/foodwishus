// The push function without its Deno wrapper (index.ts), so the whole of it can run in
// the unit tests against a stand-in database and a stand-in push service.
//
// It receives one event from the database (0007_push.sql), looks up who should hear about
// it, sends each of their devices one notification, and forgets devices the push service
// reports as gone.

import { langOf, parseEvent, plan, type Answer, type Device, type Meal, type Person, type PushEvent } from './logic.ts'
import { sendWebPush, type Vapid } from './webpush.ts'

export interface PushConfig {
  supabaseUrl: string
  /** Reads past row-level security. Never leaves the function. */
  serviceRoleKey: string
  /** The database sends this with every event. A call without it is refused. */
  pushSecret: string
  vapid: Vapid
}

export interface Tools {
  fetch: typeof fetch
  now: () => Date
}

/** The header the database trigger puts the shared secret in. */
export const SECRET_HEADER = 'x-push-secret'

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Compare without giving away, through timing, how much of a guess was right. */
async function sameSecret(given: string, expected: string): Promise<boolean> {
  const digest = async (text: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
  const [a, b] = await Promise.all([digest(given), digest(expected)])
  let difference = 0
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i]
  return difference === 0
}

type Row = Record<string, unknown>

/** A thin reader for the database's REST API, with the service role's rights. */
function database(config: PushConfig, send: typeof fetch) {
  const base = `${config.supabaseUrl.replace(/\/+$/, '')}/rest/v1`
  const headers = { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` }
  return {
    async rows(query: string): Promise<Row[]> {
      const response = await send(`${base}/${query}`, { headers })
      if (!response.ok) throw new Error(`database said ${response.status} to ${query.split('?')[0]}`)
      return (await response.json()) as Row[]
    },
    async forget(deviceIds: string[]): Promise<void> {
      if (deviceIds.length === 0) return
      const response = await send(`${base}/push_subscriptions?id=in.(${deviceIds.join(',')})`, { method: 'DELETE', headers })
      if (!response.ok) throw new Error(`database said ${response.status} to deleting devices`)
    },
  }
}

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)

async function lookUp(event: PushEvent, db: ReturnType<typeof database>): Promise<{ people: Person[]; devices: Device[]; meal: Meal | null; answer: Answer | null }> {
  const [members, servings, subscriptions, reviews] = await Promise.all([
    db.rows(`members?household_id=eq.${event.householdId}&deleted_at=is.null&select=id,name,prefs,disabled_at`),
    db.rows(`servings?id=eq.${event.servingId}&household_id=eq.${event.householdId}&select=id,status,deleted_at,dish_id,menu_id,cooked_by,proposed_by,planned_date,planned_slot,proposed_at,served_at`),
    db.rows(`push_subscriptions?household_id=eq.${event.householdId}&select=id,member_id,endpoint,p256dh,auth,muted_types`),
    event.reviewId
      ? db.rows(`reviews?id=eq.${event.reviewId}&serving_id=eq.${event.servingId}&household_id=eq.${event.householdId}&select=id,chef_reply,chef_reaction,deleted_at`)
      : Promise.resolve([] as Row[]),
  ])

  const serving = servings[0]
  let name: string | null = null
  if (serving) {
    const source = text(serving.dish_id) ? `dishes?id=eq.${serving.dish_id as string}` : text(serving.menu_id) ? `menus?id=eq.${serving.menu_id as string}` : null
    if (source) name = text((await db.rows(`${source}&household_id=eq.${event.householdId}&deleted_at=is.null&select=name`))[0]?.name)
  }
  const review = reviews[0]

  return {
    people: members.map((m) => ({ id: String(m.id), name: String(m.name ?? ''), lang: langOf(m.prefs), paused: m.disabled_at != null })),
    devices: subscriptions.map((s) => ({
      id: String(s.id),
      memberId: String(s.member_id),
      endpoint: String(s.endpoint),
      p256dh: String(s.p256dh),
      auth: String(s.auth),
      mutedTypes: Array.isArray(s.muted_types) ? (s.muted_types as string[]) : [],
    })),
    meal: serving
      ? {
          status: String(serving.status),
          deleted: serving.deleted_at != null,
          name,
          cookId: text(serving.cooked_by) ?? text(serving.proposed_by),
          plannedDate: text(serving.planned_date),
          plannedSlot: text(serving.planned_slot),
          proposedAt: text(serving.proposed_at),
          servedAt: text(serving.served_at),
        }
      : null,
    answer: review ? { hasReaction: review.chef_reaction != null, hasReply: text(review.chef_reply)?.trim() ? true : false, deleted: review.deleted_at != null } : null,
  }
}

export async function handlePush(request: Request, config: PushConfig, tools: Tools = { fetch, now: () => new Date() }): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'post_only' })
  // A function without its secrets refuses everything rather than waving calls through.
  if (!config.pushSecret || config.pushSecret.length < 16 || !config.supabaseUrl || !config.serviceRoleKey || !config.vapid.publicKey || !config.vapid.privateKey || !config.vapid.subject) {
    return json(500, { error: 'not_set_up' })
  }
  const given = request.headers.get(SECRET_HEADER)
  if (!given || !(await sameSecret(given, config.pushSecret))) return json(401, { error: 'wrong_secret' })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'not_json' })
  }
  const event = parseEvent(body)
  if (!event) return json(400, { error: 'not_an_event' })

  try {
    const db = database(config, tools.fetch)
    const kitchen = await lookUp(event, db)
    const deliveries = plan(event, kitchen, tools.now())

    const gone: string[] = []
    let sent = 0
    let failed = 0
    await Promise.all(
      deliveries.map(async ({ device, message, urgency, topic, ttl }) => {
        try {
          const answer = await sendWebPush(device, JSON.stringify(message), config.vapid, { ttl, urgency, topic }, tools.fetch, tools.now())
          // The browser threw the subscription away (app removed, data cleared): forget the device.
          if (answer.status === 404 || answer.status === 410) gone.push(device.id)
          else if (answer.ok) sent += 1
          else failed += 1
        } catch {
          // One unreachable push service must not keep the other devices waiting.
          failed += 1
        }
      }),
    )
    await db.forget(gone)
    return json(200, { type: event.type, sent, gone: gone.length, failed })
  } catch (error) {
    return json(502, { error: 'failed', message: error instanceof Error ? error.message : String(error) })
  }
}
