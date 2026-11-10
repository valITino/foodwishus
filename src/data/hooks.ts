// React hooks over the local database. Screens re-render by themselves when data
// changes, whether the change came from this phone or from the partner's.

import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from './app'
import { META } from './db'
import type { ID, Member } from './types'

/** Rows that are not soft-deleted. */
export const alive = <T extends { deletedAt: string | null }>(rows: T[]): T[] => rows.filter((r) => !r.deletedAt)

export function useMe(): { householdId: ID; memberId: ID; member: Member | undefined } | null | undefined {
  return useLiveQuery(async () => {
    const [householdId, memberId] = await Promise.all([db.getMeta<ID>(META.householdId), db.getMeta<ID>(META.memberId)])
    if (!householdId || !memberId) return null
    return { householdId, memberId, member: await db.members.get(memberId) }
  }, [])
}

/** An object URL for a photo stored on this phone, or null while it has not arrived yet. */
export function usePhotoUrl(photoId: ID | null | undefined, variant: 'thumb' | 'full' = 'thumb'): string | null {
  const entry = useLiveQuery(() => (photoId ? db.blobs.get(photoId) : undefined), [photoId])
  const blob = entry ? (variant === 'thumb' ? (entry.thumb ?? entry.full) : (entry.full ?? entry.thumb)) : null
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
}
