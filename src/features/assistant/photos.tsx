// Photos to show Fork: of the fridge, of a recipe, of a dish. Chosen for one question,
// shrunk and sent with it, and kept nowhere. The pantry, the recipe reader and the talk
// with Fork all pick them the same way, with these parts.

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Button, IconButton } from '../../ui/components'
import { Icon } from '../../ui/deco/Icon'

export interface PickedPhoto {
  id: string
  file: File
  /** A preview that lives as long as the photo is picked. */
  url: string
}

let counter = 0

/** The photos somebody picked, at most `max`. Their previews are let go with them. */
export function usePickedPhotos(max: number) {
  const [picked, setPicked] = useState<PickedPhoto[]>([])
  const live = useRef<PickedPhoto[]>([])
  live.current = picked
  // Leaving the screen lets every preview go.
  useEffect(() => () => live.current.forEach((photo) => URL.revokeObjectURL(photo.url)), [])

  return {
    picked,
    full: picked.length >= max,
    /** Add pictures, as many as there is room for. Files that are no pictures are left out. */
    add(files: File[]) {
      setPicked((before) => [
        ...before,
        ...files
          .filter((file) => file.type.startsWith('image/'))
          .slice(0, Math.max(0, max - before.length))
          .map((file) => ({ id: `p${++counter}`, file, url: URL.createObjectURL(file) })),
      ])
    },
    remove(id: string) {
      setPicked((before) => {
        before.filter((photo) => photo.id === id).forEach((photo) => URL.revokeObjectURL(photo.url))
        return before.filter((photo) => photo.id !== id)
      })
    },
    clear() {
      setPicked((before) => {
        before.forEach((photo) => URL.revokeObjectURL(photo.url))
        return []
      })
    },
  }
}

export interface PhotoWords {
  /** "Take a photo" */
  take: string
  /** "Choose photos" */
  choose: string
  /** "Photo 2 of 3" */
  shown: (n: number, of: number) => string
  /** "Remove photo 2" */
  remove: (n: number) => string
}

/** The two ways to a photo: the camera, or pictures that are on the phone already. */
export function PhotoButtons({ words, onFiles, disabled, testId }: { words: PhotoWords; onFiles: (files: File[]) => void; disabled?: boolean; testId: string }) {
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    if (files.length > 0) onFiles(files)
  }
  return (
    <div className="flex flex-col gap-2">
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden data-testid={`${testId}-camera`} onChange={onChange} />
      <input ref={gallery} type="file" accept="image/*" multiple hidden data-testid={`${testId}-gallery`} onChange={onChange} />
      <Button variant="secondary" block icon={<Icon name="camera" size={20} />} disabled={disabled} onClick={() => camera.current?.click()}>
        {words.take}
      </Button>
      <Button variant="secondary" block disabled={disabled} onClick={() => gallery.current?.click()}>
        {words.choose}
      </Button>
    </div>
  )
}

/** The picked photos in a row, each with a way out. */
export function PhotoStrip({ picked, words, onRemove, size = 80 }: { picked: PickedPhoto[]; words: PhotoWords; onRemove?: (id: string) => void; size?: number }) {
  if (picked.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-4 pr-3 pt-3" data-testid="picked-photos">
      {picked.map((photo, index) => (
        <li key={photo.id} className="relative">
          <img src={photo.url} alt={words.shown(index + 1, picked.length)} width={size} height={size} className="rounded-2xl border border-line object-cover" style={{ width: size, height: size }} />
          {onRemove && <IconButton icon="close" tone="paper" label={words.remove(index + 1)} onClick={() => onRemove(photo.id)} className="absolute -right-3 -top-3" />}
        </li>
      ))}
    </ul>
  )
}
