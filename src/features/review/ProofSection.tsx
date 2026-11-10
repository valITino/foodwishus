// Proof or it didn't happen: the camera, the gallery as a second way, the polaroids
// and the moment the meal was eaten.

import { useRef, useState, type ChangeEvent } from 'react'
import { addProofPhoto, removeProofPhoto } from '../../data/actions'
import { prepareImage } from '../../data/photos'
import type { Day, ID, ISO, PhotoSource, ProofPhoto, Serving } from '../../data/types'
import { useCopy, useLang, useT } from '../../i18n'
import { formatDay, formatTime, toDay } from '../../lib/dates'
import { Button, buzz, Field, Polaroid, Sheet, toast } from '../../ui/components'
import { Mascot } from '../../ui/deco/Deco'
import { Icon } from '../../ui/deco/Icon'
import { TextAction, useWhen } from '../planning/shared'
import { reviewCopy } from './copy'
import { captureTime, fromLocalInput, readExifDate, sortProof, tiltOf, toLocalInput } from './logic'
import { PhotoViewer, ProofPolaroid, type ViewedPhoto } from './parts'

const TAPES = ['sage', 'butter', 'rose'] as const

interface Props {
  serving: Serving
  mealName: string
  /** The dishes that get a verdict: one for a dish, the courses for a menu. */
  dishIds: ID[]
  dishName: (id: ID) => string
  isMenu: boolean
  today: Day
  /** The camera button is the screen's main button until there is a photo. */
  main: boolean
  /** When the meal was eaten, as far as we know. Null before the first photo. */
  eatenAt: ISO | null
  onEatenAt: (moment: ISO) => void
  /** The first photo of this meal has just been saved. */
  onFirstPhoto?: () => void
}

export function ProofSection({ serving, mealName, dishIds, dishName, isMenu, today, main, eatenAt, onEatenAt, onFirstPhoto }: Props) {
  const t = useT()
  const lang = useLang()
  const c = useCopy(reviewCopy)
  const when = useWhen(today)
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  /** Which course the next photo shows. Unset for the whole table. */
  const course = useRef<ID | undefined>(undefined)
  const [developing, setDeveloping] = useState(0)
  const [fresh, setFresh] = useState<ID[]>([])
  const [viewing, setViewing] = useState<ViewedPhoto | null>(null)
  const [removing, setRemoving] = useState<ProofPhoto | null>(null)
  const [timeOpen, setTimeOpen] = useState(false)

  const photos = sortProof(serving.proofPhotos, dishIds)
  const [first, ...rest] = photos
  const eaten = serving.status === 'eaten'

  const timeOf = (photo: ProofPhoto) => formatTime(photo.takenAt, lang)
  const stampOf = (photo: ProofPhoto) => c.proof.caption(formatDay(toDay(photo.takenAt), lang, 'date-short'), timeOf(photo))
  const subjectOf = (photo: ProofPhoto) => (photo.courseDishId ? dishName(photo.courseDishId) : mealName)

  const view = (photo: ProofPhoto) => setViewing({ photoId: photo.photoId, alt: c.proof.photoOf(subjectOf(photo), stampOf(photo)), caption: stampOf(photo) })

  function shoot(courseDishId?: ID) {
    course.current = courseDishId
    camera.current?.click()
  }

  function pick() {
    course.current = undefined
    gallery.current?.click()
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>, source: PhotoSource) {
    const file = event.target.files?.[0]
    // Empty the field, so the very same photo can be chosen again after removing it.
    event.target.value = ''
    const courseDishId = course.current
    course.current = undefined
    if (!file) return
    setDeveloping((n) => n + 1)
    try {
      // A gallery photo knows when it was taken; a live one was taken now.
      const exif = source === 'gallery' ? readExifDate(new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer())) : null
      const takenAt = captureTime({ source, exif, lastModified: file.lastModified })
      const image = await prepareImage(file)
      const entry = await addProofPhoto(serving.id, { image, source, takenAt, courseDishId })
      setFresh((ids) => [...ids, entry.photoId])
      buzz(14)
      if (serving.proofPhotos.length === 0) onFirstPhoto?.()
    } catch {
      toast(c.proof.unreadable, 'oops')
    }
    setDeveloping((n) => n - 1)
  }

  async function remove(photo: ProofPhoto) {
    setRemoving(null)
    try {
      await removeProofPhoto(serving.id, photo.photoId)
      toast(c.proof.removed)
    } catch {
      toast(t.common.somethingWrong, 'oops')
    }
  }

  function askRemove(photo: ProofPhoto) {
    if (eaten && photos.length === 1) toast(c.proof.keepOne, 'oops')
    else setRemoving(photo)
  }

  function onTime(value: string) {
    const moment = fromLocalInput(value)
    if (!moment) return
    if (Date.parse(moment) > Date.now() + 60_000) toast(c.proof.timeFuture, 'oops')
    else onEatenAt(moment)
  }

  /** A blank polaroid for a photo that is still being shrunk and saved. */
  const blank = (width: string) => (
    <div className="shrink-0" style={{ width }} data-testid="proof-developing" role="status">
      <Polaroid caption={c.proof.developing} tilt={2} tape="butter">
        <div className="size-full animate-pulse bg-[#f6ebe4]" />
      </Polaroid>
    </div>
  )

  return (
    <section aria-labelledby="proof-title" data-testid="proof">
      <h2 id="proof-title" className="mb-4 px-1 text-lg">
        {isMenu ? c.proof.headingMenu : c.proof.heading}
      </h2>

      {photos.length === 0 ? (
        <div className="flex flex-col items-center">
          {developing > 0 ? (
            blank('15rem')
          ) : (
            <div className="w-[15rem]" data-testid="proof-empty">
              <Polaroid caption={c.proof.empty} tilt={-2}>
                <div className="grid size-full place-items-center bg-[#f6ebe4] pt-3 [--color-art-outline:#4a3833]">
                  <Mascot size={108} mood="love" label="" />
                </div>
              </Polaroid>
            </div>
          )}
          <p className="mt-5 max-w-[19rem] text-balance text-center text-sm text-ink-soft">{isMenu ? c.proof.emptyHintMenu : c.proof.emptyHint}</p>
          <Button size="lg" block variant={main ? 'primary' : 'secondary'} className="mt-4" icon={<Icon name="camera" size={22} />} disabled={developing > 0} onClick={() => shoot()}>
            {t.actions.takeProof}
          </Button>
          <TextAction className="mt-1.5" disabled={developing > 0} onClick={pick}>
            {c.proof.gallery}
          </TextAction>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <ProofPolaroid
            photo={first}
            alt={c.proof.photoOf(subjectOf(first), stampOf(first))}
            caption={stampOf(first)}
            width="15rem"
            variant="full"
            developing={fresh.includes(first.photoId)}
            label={first.courseDishId ? dishName(first.courseDishId) : undefined}
            onOpen={() => view(first)}
            openLabel={c.proof.look(subjectOf(first))}
            onRemove={() => askRemove(first)}
            removeLabel={c.proof.remove(timeOf(first))}
          />

          {(rest.length > 0 || developing > 0) && (
            <div className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-7">
              {rest.map((photo, index) => (
                <ProofPolaroid
                  key={photo.photoId}
                  photo={photo}
                  alt={c.proof.photoOf(subjectOf(photo), stampOf(photo))}
                  caption={timeOf(photo)}
                  width="7.75rem"
                  tilt={tiltOf(photo.photoId)}
                  tape={TAPES[index % TAPES.length]}
                  developing={fresh.includes(photo.photoId)}
                  label={photo.courseDishId ? dishName(photo.courseDishId) : undefined}
                  onOpen={() => view(photo)}
                  openLabel={c.proof.look(subjectOf(photo))}
                  onRemove={() => askRemove(photo)}
                  removeLabel={c.proof.remove(timeOf(photo))}
                />
              ))}
              {developing > 0 && blank('7.75rem')}
            </div>
          )}

          {eatenAt && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3">
              <p className="text-sm font-bold" data-testid="eaten-at">
                {c.proof.eatenAt(when.dayInline(toDay(eatenAt), 'long'), formatTime(eatenAt, lang))}
              </p>
              <TextAction aria-expanded={timeOpen} onClick={() => setTimeOpen((open) => !open)}>
                {c.proof.changeTime}
              </TextAction>
            </div>
          )}
          {eatenAt && timeOpen && (
            <Field
              className="mb-3 w-full"
              type="datetime-local"
              label={c.proof.timeField}
              hint={c.proof.timeHint}
              value={toLocalInput(eatenAt)}
              max={toLocalInput(new Date().toISOString())}
              onChange={(event) => onTime(event.target.value)}
            />
          )}

          <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <Button variant="secondary" icon={<Icon name="camera" size={20} />} disabled={developing > 0} onClick={() => shoot()}>
              {c.proof.another}
            </Button>
            <TextAction disabled={developing > 0} onClick={pick}>
              {c.proof.anotherGallery}
            </TextAction>
          </div>

          {isMenu && (
            <div className="mt-5 w-full">
              <p className="mb-2 px-1 text-xs font-extrabold">{c.proof.coursesLabel}</p>
              <div className="flex flex-wrap gap-2">
                {dishIds.map((id) => (
                  <button
                    key={id}
                    type="button"
                    aria-label={c.proof.courseShot(dishName(id))}
                    disabled={developing > 0}
                    onClick={() => shoot(id)}
                    className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border-[1.5px] border-line-strong bg-surface px-3.5 text-xs font-bold disabled:opacity-45"
                  >
                    <Icon name="camera" size={17} className="shrink-0" />
                    <span className="truncate">{dishName(id)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* The camera opens directly; the gallery is the quiet second way. */}
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden data-testid="camera-input" onChange={(event) => void onFile(event, 'camera')} />
      <input ref={gallery} type="file" accept="image/*" hidden data-testid="gallery-input" onChange={(event) => void onFile(event, 'gallery')} />

      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />

      <Sheet
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={c.proof.removeTitle}
        footer={
          <div className="flex flex-col gap-1">
            <Button size="lg" block onClick={() => removing && void remove(removing)}>
              {t.common.remove}
            </Button>
            <Button variant="quiet" onClick={() => setRemoving(null)}>
              {t.actions.cancel}
            </Button>
          </div>
        }
      >
        <p className="text-sm">{c.proof.removeBody}</p>
      </Sheet>
    </section>
  )
}
