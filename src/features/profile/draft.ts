// A profile while it is being edited: the same shape in onboarding and in Settings.
// Pure helpers only, so they can be unit tested without a browser.

import type { ProfileChanges } from '../../data/actions'
import type { ProfileInput } from '../../data/backend'
import type { Member, Role } from '../../data/types'

export const PLATE_COLORS = ['rose', 'sage', 'butter', 'sky'] as const
export const NAME_MAX = 40
export const STATUS_MAX = 60

export interface ProfileDraft {
  name: string
  role: Role
  avatar: string
  color: string
  accessory: string | null
  status: string
}

/** A friendly starting point: the Chef gets the whisk, the Taster gets Fork. */
export function defaultDraft(role: Role): ProfileDraft {
  return role === 'chef'
    ? { name: '', role, avatar: 'whisk', color: 'rose', accessory: null, status: '' }
    : { name: '', role, avatar: 'fork', color: 'sage', accessory: null, status: '' }
}

export function draftFromMember(member: Pick<Member, 'name' | 'defaultRole' | 'avatar' | 'color' | 'accessory' | 'status'>): ProfileDraft {
  return {
    name: member.name,
    role: member.defaultRole,
    avatar: member.avatar,
    color: member.color,
    accessory: member.accessory ?? null,
    status: member.status ?? '',
  }
}

/** Cut a text to a length without leaving half an emoji behind. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text
  let cut = text.slice(0, max)
  const last = cut.charCodeAt(cut.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1)
  return cut
}

/** The part of a profile the pairing calls accept. Status and accessory are saved right after. */
export function toProfileInput(draft: ProfileDraft): ProfileInput {
  return { name: clip(draft.name.trim(), NAME_MAX), avatar: draft.avatar, color: draft.color, defaultRole: draft.role }
}

/** What pairing cannot carry: saved with updateMyProfile once the phone is in the kitchen. */
export function extrasOf(draft: ProfileDraft): ProfileChanges {
  return { status: clip(draft.status.trim(), STATUS_MAX) || null, accessory: draft.accessory }
}

/** Only the fields that differ from the saved profile, so a save sends as little as possible. */
export function changesBetween(saved: ProfileDraft, draft: ProfileDraft): ProfileChanges {
  const changes: ProfileChanges = {}
  const name = clip(draft.name.trim(), NAME_MAX)
  const status = clip(draft.status.trim(), STATUS_MAX)
  if (name !== saved.name) changes.name = name
  if (draft.role !== saved.role) changes.defaultRole = draft.role
  if (draft.avatar !== saved.avatar) changes.avatar = draft.avatar
  if (draft.color !== saved.color) changes.color = draft.color
  if (draft.accessory !== saved.accessory) changes.accessory = draft.accessory
  if (status !== saved.status.trim()) changes.status = status || null
  return changes
}

export const isReady = (draft: ProfileDraft): boolean => draft.name.trim().length > 0

/** The next suggestion in the list after the current status. Goes round and round. */
export function nextSuggestion(suggestions: readonly string[], current: string): string {
  if (suggestions.length === 0) return current
  const at = suggestions.indexOf(current.trim())
  return suggestions[(at + 1) % suggestions.length]
}
