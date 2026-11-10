// Supabase Edge Function "push": turns one kitchen event into notifications on the
// partner's devices. Deploy with JWT verification off: the database calls it with a
// shared secret instead (see README.md in this folder). All the work is in handler.ts.

import { handlePush } from './handler.ts'

const env = (name: string): string => Deno.env.get(name) ?? ''

Deno.serve((request: Request) =>
  handlePush(request, {
    supabaseUrl: env('SUPABASE_URL'),
    serviceRoleKey: env('SUPABASE_SERVICE_ROLE_KEY'),
    pushSecret: env('PUSH_SECRET'),
    vapid: {
      publicKey: env('VAPID_PUBLIC_KEY'),
      privateKey: env('VAPID_PRIVATE_KEY'),
      subject: env('VAPID_SUBJECT'),
    },
  }),
)
