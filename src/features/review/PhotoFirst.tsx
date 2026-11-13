// The photo first. Two short ways into the verdict that start with the camera:
//   EarlyProof   a meal that is planned or wished for and already on the table
//   usePlate     nothing was entered at all: the photo, then "What is on the plate?"
// Both end in the verdict flow, with the photo already in.

import { useEffect, useRef, useState, type ReactElement } from 'react'
import { navigate } from '../../app/router'
import { addProofPhoto, createDish, logMeal } from '../../data/actions'
import type { ID, Serving, Slot } from '../../data/types'
import { useCopy, useLang, useT } from '../../i18n'
import { formatTime, zurichHour } from '../../lib/dates'
import { Button, buzz, cx, Sheet, toast } from '../../ui/components'
import { Icon } from '../../ui/deco/Icon'
import { planningCopy } from '../planning/copy'
import { plateChoices, slotForHour } from '../planning/logic'
import { MealOptions, useBook, type MealPick } from '../planning/MealPicker'
import { SlotChips, useKitchen, type Kitchen } from '../planning/shared'
import { readShot, type Shot } from './capture'
import { reviewCopy } from './copy'

/** A hidden camera field and the way to open it: the camera comes up at once, without a page in between. */
function useCamera(testId: string, onFile: (file: File) => void): { field: ReactElement; open: () => void } {
  const ref = useRef<HTMLInputElement>(null)
  const field = (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      capture="environment"
      hidden
      data-testid={testId}
      onChange={(event) => {
        const file = event.target.files?.[0]
        // Empty the field, so the very same photo can be taken or chosen again.
        event.target.value = ''
        if (file) onFile(file)
      }}
    />
  )
  return { field, open: () => ref.current?.click() }
}

// --------------------------------------------------- a meal that is on its way --

/**
 * The cook has not tapped "Served", but the plate is there. One tap opens the camera, the
 * photo goes to this meal, and the verdict flow opens with it. Once a photo is in, the
 * same button leads back to the verdict that was started.
 */
export function EarlyProof({ serving, className }: { serving: Serving; className?: string }) {
  const c = useCopy(reviewCopy)
  const [busy, setBusy] = useState(false)
  const started = serving.proofPhotos.length > 0
  const toFlow = () => navigate(`/review/${serving.id}`)

  async function attach(file: File) {
    setBusy(true)
    try {
      await addProofPhoto(serving.id, await readShot(file, 'camera'))
      buzz(14)
      toFlow()
    } catch {
      toast(c.proof.unreadable, 'oops')
      setBusy(false)
    }
  }
  const camera = useCamera('early-camera', (file) => void attach(file))

  return (
    <div className={cx('flex flex-col gap-2', className)} data-testid="early-proof">
      {!started && <p className="text-center text-xs text-ink-soft">{c.today.earlyHint}</p>}
      <Button variant="secondary" block icon={started ? undefined : <Icon name="camera" size={20} />} disabled={busy} onClick={started ? toFlow : camera.open}>
        {started ? c.meal.continueAction : c.today.early}
      </Button>
      {camera.field}
    </div>
  )
}

// ------------------------------------------------------- nothing was entered --

/** The little frame of the photo that was just taken, or a blank one while it is being shrunk. */
function Snapshot({ url, alt, developing }: { url: string | null; alt: string; developing: string }) {
  return (
    <span className="block shrink-0 -rotate-3 rounded-[2px] bg-[#fffefa] p-1 pb-3 shadow-paper" data-testid="plate-photo">
      {url ? (
        <img src={url} alt={alt} className="block size-16 rounded-[1px] object-cover" />
      ) : (
        <span role="status" aria-label={developing} className="block size-16 animate-pulse rounded-[1px] bg-[#f6ebe4]" />
      )}
    </span>
  )
}

function PlateSheet({ shot, kitchen, onClose }: { shot: Promise<Shot> | null; kitchen: Kitchen; onClose: () => void }) {
  const t = useT()
  const lang = useLang()
  const c = useCopy(reviewCopy)
  const slotLabel = useCopy(planningCopy).serving.slotLabel
  const [ready, setReady] = useState<{ shot: Shot; url: string } | null>(null)
  const [chosenSlot, setChosenSlot] = useState<Slot | null>(null)
  const [busy, setBusy] = useState(false)
  // The latest words and the latest way out, for a photo that turns out to be unreadable a moment later.
  const failed = useRef(() => {})
  failed.current = () => {
    toast(c.proof.unreadable, 'oops')
    onClose()
  }

  useEffect(() => {
    setReady(null)
    setChosenSlot(null)
    setBusy(false)
    if (!shot) return
    let live = true
    let url: string | null = null
    shot.then(
      (done) => {
        if (!live) return
        url = URL.createObjectURL(done.image.thumb)
        setReady({ shot: done, url })
      },
      () => {
        if (live) failed.current()
      },
    )
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [shot])

  const { dishes, menus } = useBook(kitchen)
  const { partner, meId } = kitchen
  const choices = plateChoices(kitchen.servings, dishes, menus, { id: meId, alone: partner === null }, kitchen.today)
  const slot = chosenSlot ?? slotForHour(zurichHour(ready?.shot.takenAt ?? new Date()))

  /** The photo goes to the meal that was tapped, or to a new one that is on the table now, and the verdict flow opens. */
  async function pick(picked: MealPick) {
    if (busy || !shot) return
    setBusy(true)
    // An unreadable photo has said so already, and has closed the sheet.
    const photo = await shot.catch(() => null)
    if (!photo) return
    try {
      let id: ID
      if ('serving' in picked) id = picked.serving.id
      else {
        const what = 'newName' in picked ? { dishId: (await createDish({ name: picked.newName })).id } : picked
        // Whoever takes this photo eats: the other one cooked.
        id = (await logMeal({ ...what, servedAt: photo.takenAt, slot, cookedBy: partner?.id ?? meId })).id
      }
      await addProofPhoto(id, photo)
      buzz(14)
      onClose()
      navigate(`/review/${id}`)
    } catch {
      toast(t.common.somethingWrong, 'oops')
      setBusy(false)
    }
  }

  return (
    <Sheet open={shot !== null} onClose={onClose} title={c.plate.title}>
      <div className="flex items-center gap-4 pt-1">
        <Snapshot url={ready?.url ?? null} alt={c.plate.photoAlt} developing={c.proof.developing} />
        <div className="min-w-0">
          <p className="text-sm font-bold">{partner ? c.plate.eat(partner.name) : c.flow.cookedByMe}</p>
          {ready && <p className="mt-0.5 text-xs text-ink-soft">{c.plate.taken(formatTime(ready.shot.takenAt, lang))}</p>}
        </div>
      </div>

      <p className="mb-1.5 mt-4 text-xs font-extrabold">{slotLabel}</p>
      <SlotChips label={slotLabel} value={slot} onChange={setChosenSlot} />

      <MealOptions kitchen={kitchen} choices={choices} day={kitchen.today} openLabel={c.plate.open} busy={busy} onPick={(picked) => void pick(picked)} onLeave={onClose} />
    </Sheet>
  )
}

/**
 * "Take a photo and rate" where nothing was entered: the camera opens at once, and the
 * sheet that follows asks what is on the plate. A meal from the list gets the photo; a
 * dish from the recipe book becomes a meal that is on the table now, cooked by the other
 * one. Then the verdict flow takes over.
 *
 * `shoot` must be called from a tap. `parts` go anywhere on the page that stays mounted.
 */
export function usePlate(id: string): { shoot: () => void; parts: ReactElement } {
  const kitchen = useKitchen()
  const [shot, setShot] = useState<Promise<Shot> | null>(null)
  const camera = useCamera(`${id}-camera`, (file) => {
    const reading = readShot(file, 'camera')
    // The sheet says so when the photo cannot be read; nobody else needs to hear it.
    reading.catch(() => {})
    setShot(reading)
  })
  return {
    shoot: camera.open,
    parts: (
      <>
        {camera.field}
        {kitchen && <PlateSheet shot={shot} kitchen={kitchen} onClose={() => setShot(null)} />}
      </>
    ),
  }
}
