// A background worker that paints the demo photos, so the app stays smooth while
// seventy pictures develop. The page sends one job at a time and gets the image
// bytes back. See photos.ts.

import { paintPhoto, type PaintedPhoto, type PhotoSpec } from './paint'

export interface PaintRequest {
  id: string
  spec: PhotoSpec
}

export type PaintReply = ({ id: string; ok: true } & PaintedPhoto) | { id: string; ok: false; reason: string }

const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = (event: MessageEvent<PaintRequest>) => {
  const { id, spec } = event.data
  paintPhoto(spec).then(
    (photo) => scope.postMessage({ id, ok: true, ...photo } satisfies PaintReply),
    (error: unknown) => scope.postMessage({ id, ok: false, reason: String(error) } satisfies PaintReply),
  )
}
