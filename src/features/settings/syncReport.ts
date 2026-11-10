// "Copy details": a short plain-text report about sync, to paste into a message when
// something needs looking at. It holds no names, dishes or notes, only counts, codes and
// the first characters of the ids. Always in English, because support reads it.

import type { SyncStatus } from '../../data/sync'

export interface SyncReportInput {
  version: string
  /** Which cloud the app talks to: "supabase" or the pretend one. */
  backend: string
  /** The moment the report was made (ISO). */
  now: string
  status: SyncStatus
  online: boolean
  demo: boolean
  lang: string
  theme: string
  /** How many people are in the kitchen on this phone's copy. */
  members: number
  householdId?: string
  memberId?: string
  userAgent: string
  /** Changes the cloud refused and that were set aside. */
  refused: { table: string; kind: string; lastError?: string; failedAt: string }[]
}

const short = (id: string | undefined) => (id ? id.slice(0, 8) : 'none')

export function syncReport(input: SyncReportInput): string {
  const { status } = input
  const lines = [
    'FoodwishUs sync report',
    `App: ${input.version} (${input.backend}${input.demo ? ', demo kitchen' : ''})`,
    `Made: ${input.now}`,
    `State: ${status.state}`,
    `Online: ${input.online ? 'yes' : 'no'}`,
    `Last sync: ${status.lastSyncAt ?? 'never'}`,
    `Changes waiting: ${status.pending}`,
    `Photos waiting: ${status.uploads}`,
    `Refused changes: ${status.stuck}`,
    `Last error: ${status.lastError ?? 'none'}`,
    `Kitchen: ${short(input.householdId)}, people: ${input.members}, me: ${short(input.memberId)}`,
    `Language: ${input.lang}, theme: ${input.theme}`,
    `Phone: ${input.userAgent}`,
  ]
  for (const item of input.refused.slice(0, 10)) {
    lines.push(`Refused: ${item.kind} ${item.table}, ${item.lastError ?? 'no reason given'}, ${item.failedAt}`)
  }
  if (input.refused.length > 10) lines.push(`and ${input.refused.length - 10} more refused changes`)
  return lines.join('\n')
}
