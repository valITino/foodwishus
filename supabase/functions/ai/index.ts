// Supabase Edge Function "ai": the kitchen's helper. It reads a recipe from a pasted
// link and writes a recipe card (see README.md in this folder). All the work is in
// handler.ts; the instructions for the AI are in skills/.
//
// Secrets (Dashboard, Edge Functions, Secrets):
//   ANTHROPIC_API_KEY   the Claude API key. Without it, pages that carry their own
//                       recipe data are still read, word for word.
//   AI_MODEL            optional, to use another model than the default.
// Supabase gives every function SUPABASE_URL and SUPABASE_ANON_KEY.

import { helperHandler, type Ticket } from './handler.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

/** Ask the database, as the caller: is this somebody from the kitchen, and is there a ticket left today? */
async function ticket(authorization: string): Promise<Ticket> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/ai_ticket`, { method: 'POST', headers: { apikey: anonKey, authorization, 'content-type': 'application/json' }, body: '{}' })
  if (response.status === 401) return { ok: false, code: 'not_signed_in' }
  if (!response.ok) {
    const problem = await response.text()
    return { ok: false, code: problem.includes('ai_limit') ? 'limit' : 'not_member' }
  }
  const left = Number(await response.json())
  return { ok: true, left: Number.isFinite(left) ? left : 0 }
}

Deno.serve(
  helperHandler({
    fetch: (url, init) => fetch(url, init),
    askFetch: (url, init) => fetch(url, init),
    apiKey: Deno.env.get('ANTHROPIC_API_KEY') || null,
    model: Deno.env.get('AI_MODEL') || undefined,
    ticket,
  }),
)
