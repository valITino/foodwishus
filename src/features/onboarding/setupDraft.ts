// What someone has filled in so far while opening or joining a kitchen. It is kept on
// this device so that a reload, or the app being closed for a moment, does not throw the
// avatar and the status line away. The PIN is never part of it.

import { defaultDraft, type ProfileDraft } from '../profile/draft'

const SLOT = 'foodwishus.setupDraft'
/** An abandoned draft is forgotten after a day. */
const MAX_AGE_MS = 24 * 3_600_000

export interface Setup {
  /** Which wizard the draft belongs to. */
  flow: 'start' | 'join'
  /** For "join": the code it was filled in for. */
  code: string
  /** The step that was showing, counted from 0. */
  step: number
  /** False until "Who are you at the table?" was answered (or preselected by an invite). */
  roleChosen: boolean
  profile: ProfileDraft
  kitchenName: string
}

export function freshSetup(flow: Setup['flow'], code = ''): Setup {
  return { flow, code, step: 0, roleChosen: false, profile: defaultDraft('chef'), kitchenName: '' }
}

const isText = (value: unknown): value is string => typeof value === 'string'

/** Read a saved draft, or null when there is none, it is too old or it does not look right. */
export function parseSetup(raw: string | null, now = Date.now()): Setup | null {
  if (!raw) return null
  try {
    const saved = JSON.parse(raw) as { at?: number; setup?: Partial<Setup> }
    const s = saved.setup
    const p = s?.profile
    if (!s || !p || typeof saved.at !== 'number' || now - saved.at > MAX_AGE_MS) return null
    if ((s.flow !== 'start' && s.flow !== 'join') || (p.role !== 'chef' && p.role !== 'taster')) return null
    if (![p.name, p.avatar, p.color, p.status, s.code, s.kitchenName].every(isText)) return null
    return {
      flow: s.flow,
      code: s.code as string,
      step: Number.isInteger(s.step) && (s.step as number) >= 0 ? (s.step as number) : 0,
      roleChosen: s.roleChosen === true,
      profile: { name: p.name, role: p.role, avatar: p.avatar, color: p.color, accessory: isText(p.accessory) ? p.accessory : null, status: p.status },
      kitchenName: s.kitchenName as string,
    }
  } catch {
    return null
  }
}

export function loadSetup(): Setup | null {
  try {
    return parseSetup(localStorage.getItem(SLOT))
  } catch {
    return null
  }
}

export function saveSetup(setup: Setup): void {
  try {
    localStorage.setItem(SLOT, JSON.stringify({ at: Date.now(), setup }))
  } catch {
    /* private mode: the draft lives on in memory until the app closes */
  }
}

export function clearSetup(): void {
  try {
    localStorage.removeItem(SLOT)
  } catch {
    /* nothing to clear */
  }
}
