// A workbench for the sync engine, only reachable in development (#/lab).
// The end-to-end test drives two of these as "her phone" and "his phone".

import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { backend, boot, db, joinKitchen, startKitchen, store, sync, useSyncStatus } from '../../data/app'
import { isBackendError } from '../../data/backend'
import { alive, useMe, usePhotoUrl } from '../../data/hooks'
import { addPhotoFromFile } from '../../data/photos'
import { newId, nowIso, type Dish } from '../../data/types'
import { Button, Card, Field, SyncPill } from '../../ui/components'

function Thumb({ id }: { id: string }) {
  const url = usePhotoUrl(id)
  return url ? (
    <img data-testid="photo" src={url} alt="" className="size-16 rounded-xl object-cover" />
  ) : (
    <span data-testid="photo-missing" className="grid size-16 place-items-center rounded-xl bg-blush text-2xs">
      …
    </span>
  )
}

export function SyncLab() {
  const status = useSyncStatus()
  const me = useMe()
  const dishes = useLiveQuery(async () => alive(await db.dishes.toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [])
  const photos = useLiveQuery(async () => alive(await db.photos.toArray()), [])
  const members = useLiveQuery(() => db.members.toArray(), [])
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [invite, setInvite] = useState('')
  const [dishName, setDishName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    void boot()
    // Lets the end-to-end test wait for exact moments instead of guessing with timers.
    Object.assign(window, { __foodwishus: { db, sync, store } })
  }, [])

  const guard = (fn: () => Promise<void>) => async () => {
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(isBackendError(e) ? e.code : String(e))
    }
  }

  const addDish = guard(async () => {
    if (!me || !dishName.trim()) return
    const at = nowIso()
    const dish: Dish = {
      id: newId(),
      householdId: me.householdId,
      name: dishName.trim(),
      description: null,
      course: 'main',
      tags: [],
      effort: null,
      recipe: {},
      nutrition: {},
      coverPhotoId: null,
      icon: null,
      createdBy: me.memberId,
      archived: false,
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    }
    await store.put('dishes', dish)
    setDishName('')
  })

  return (
    <main className="app-column flex min-h-dvh flex-col gap-4 p-4">
      <h1 className="text-xl">Sync lab</h1>
      <div className="flex items-center gap-3">
        <SyncPill status={status} />
        <span data-testid="pending" className="text-xs">
          {status.pending + status.uploads}
        </span>
        <Button variant="secondary" onClick={() => void sync.sync()}>
          Sync now
        </Button>
      </div>
      {error && (
        <p data-testid="error" className="text-sm font-bold text-cherry">
          {error}
        </p>
      )}

      {me === null && (
        <Card className="flex flex-col gap-3">
          <Field label="Your name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button onClick={guard(async () => void (await startKitchen('Our kitchen', { name, defaultRole: 'chef' })))}>Start our kitchen</Button>
          <Field label="Invite code" value={code} onChange={(e) => setCode(e.target.value)} />
          <Button variant="secondary" onClick={guard(() => joinKitchen(code, { name, defaultRole: 'taster' }))}>
            Join with code
          </Button>
        </Card>
      )}

      {me && (
        <>
          <Card className="flex flex-col gap-2">
            <p data-testid="members" className="text-sm font-bold">
              {(members ?? []).map((m) => m.name).sort().join(' + ')}
            </p>
            <Button variant="secondary" onClick={guard(async () => setInvite((await backend.createInvite('join')).code))}>
              Create invite code
            </Button>
            {invite && (
              <p data-testid="invite-code" className="font-display text-xl tracking-widest">
                {invite}
              </p>
            )}
          </Card>

          <Card className="flex flex-col gap-3">
            <Field label="New dish" value={dishName} onChange={(e) => setDishName(e.target.value)} />
            <Button onClick={addDish}>Add dish</Button>
            <ul data-testid="dishes" className="flex flex-col gap-2">
              {(dishes ?? []).map((d) => (
                <li key={d.id} data-testid="dish" className="flex items-center gap-2">
                  <input
                    aria-label={`Name of ${d.name}`}
                    className="min-h-11 flex-1 rounded-field border border-line-strong bg-surface px-3 text-sm font-bold"
                    defaultValue={d.name}
                    key={d.name}
                    onBlur={(e) => e.target.value !== d.name && void store.patch('dishes', d.id, { name: e.target.value })}
                  />
                  <input
                    aria-label={`Note for ${d.name}`}
                    className="min-h-11 w-28 rounded-field border border-line-strong bg-surface px-3 text-sm"
                    defaultValue={d.description ?? ''}
                    key={`${d.id}-${d.description}`}
                    placeholder="note"
                    onBlur={(e) => e.target.value !== (d.description ?? '') && void store.patch('dishes', d.id, { description: e.target.value })}
                  />
                </li>
              ))}
            </ul>
          </Card>

          <Card className="flex flex-col gap-3">
            <label className="text-xs font-extrabold" htmlFor="lab-photo">
              Add a photo
            </label>
            <input
              id="lab-photo"
              data-testid="photo-input"
              type="file"
              accept="image/*"
              onChange={guard(async () => {
                const input = document.getElementById('lab-photo') as HTMLInputElement
                const file = input.files?.[0]
                if (file) await addPhotoFromFile(store, file, { kind: 'proof', source: 'gallery' })
                input.value = ''
              })}
            />
            <div className="flex flex-wrap gap-2">
              {(photos ?? []).map((p) => (
                <Thumb key={p.id} id={p.id} />
              ))}
            </div>
          </Card>
        </>
      )}
    </main>
  )
}
