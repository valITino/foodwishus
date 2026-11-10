// Turns one photo job into image bytes: a full-size JPEG and a thumbnail. Works on
// the page and inside a background worker, so it must not touch the document unless
// there is no other way.

import type { PhotoJob } from './history'
import { paintPlate, photoSize } from './plates'

export type PhotoSpec = Pick<PhotoJob, 'kind' | 'art' | 'seed' | 'light' | 'source' | 'disaster'>

export interface PaintedPhoto {
  full: Blob
  thumb: Blob
  width: number
  height: number
}

const THUMB_EDGE = 400

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement

function makeCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function toJpeg(canvas: AnyCanvas, quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/jpeg', quality })
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the demo photo.'))), 'image/jpeg', quality))
}

function context(canvas: AnyCanvas): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D {
  const c = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null
  if (!c) throw new Error('This browser cannot paint the demo photos.')
  return c
}

/** False where there is no canvas to paint on, for example in unit tests. */
export function canPaint(): boolean {
  try {
    if (typeof OffscreenCanvas !== 'undefined') return Boolean(new OffscreenCanvas(1, 1).getContext('2d'))
    if (typeof document !== 'undefined') return Boolean(document.createElement('canvas').getContext('2d'))
  } catch {
    /* fall through */
  }
  return false
}

/** Paint one photo and its thumbnail. */
export async function paintPhoto(spec: PhotoSpec): Promise<PaintedPhoto> {
  const [width, height] = photoSize(spec.kind, spec.source)
  const canvas = makeCanvas(width, height)
  paintPlate(context(canvas), width, height, { art: spec.art, seed: spec.seed, light: spec.light, cover: spec.kind === 'cover', disaster: spec.disaster })
  const full = await toJpeg(canvas, 0.82)

  const scale = THUMB_EDGE / Math.max(width, height)
  const small = makeCanvas(Math.round(width * scale), Math.round(height * scale))
  const sc = context(small)
  sc.imageSmoothingQuality = 'high'
  sc.drawImage(canvas, 0, 0, small.width, small.height)
  const thumb = await toJpeg(small, 0.74)
  // Hand the memory back right away; seventy canvases add up on a phone.
  canvas.width = canvas.height = small.width = small.height = 0
  return { full, thumb, width, height }
}
