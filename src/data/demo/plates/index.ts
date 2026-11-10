// Paints a stand-in "photo" for the demo kitchen: one dish on a gingham tablecloth,
// seen from above, the way he would snap it with his phone before the first bite.

import type { DishKey } from '../content'
import { makeRng } from '../random'
import { Brush, deg, type Ctx } from './brush'
import { ARTS } from './dishes'
import { candle, cloth, CLOTH_NAMES, coffee, fork, glass, knife, light, napkin, spoon, sprig } from './table'

export interface PlateOptions {
  art: DishKey
  /** Every seed gives a slightly different photo of the same dish. */
  seed: number
  light: 'morning' | 'day' | 'evening'
  /** A cover photo for the recipe book: closer, tidier, nothing else on the table. */
  cover?: boolean
  /** The dish went wrong, and it shows. */
  disaster?: boolean
}

const NAPKINS = ['#fffdf9', '#f6d5dc', '#dbe6d2', '#f8ecc0', '#d3e8f2']

/** Paint the whole photo onto a canvas of the given size. */
export function paintPlate(c: Ctx, width: number, height: number, options: PlateOptions): void {
  const rng = makeRng(`plate/${options.art}/${options.seed}`)
  const art = ARTS[options.art]
  const b = new Brush(c, rng)
  const cover = options.cover === true
  const wide = width > height * 1.1
  const tall = height > width * 1.1

  // The camera: never quite straight, never quite centred.
  const unit = Math.min(width, height) / 1000
  // Wide things (a board, a roasting tin) are photographed from a little further away.
  const fit = Math.min(1, 345 / (art.reach ?? 345))
  const zoom = (cover ? rng.between(1.16, 1.24) : rng.between(1.02, 1.16)) * fit
  const tilt = deg(rng.between(-5, 5))
  const shiftX = cover ? 0 : rng.between(-34, 34)
  const shiftY = cover ? 0 : rng.between(-40, 40)
  b.pixels = unit * zoom

  c.save()
  c.fillStyle = '#fff8f0'
  c.fillRect(0, 0, width, height)
  c.translate(width / 2 + shiftX * unit, height / 2 + shiftY * unit)
  c.rotate(tilt)
  c.scale(unit * zoom, unit * zoom)

  cloth(b, rng.pick(CLOTH_NAMES), rng.pick([118, 132, 150]))

  if (!cover) {
    // Where things stand depends on which way the phone was held.
    const far = (art.reach ?? 345) - 345
    const side: [number, number] = tall ? [-260, -490 - far] : wide ? [-545 - far, -60] : [-400, -400]
    const extra: [number, number] = tall ? [280, -500 - far] : wide ? [540 + far, -260] : [410, -410]
    const out = wide ? 500 : 448
    // In a landscape photo the side dish stands on the left, so the cutlery moves to the right.
    const crowded = wide && art.side !== undefined
    const left = crowded ? out : -out
    const right = crowded ? out + 78 : out

    if (art.cutlery !== 'none' && rng.chance(0.55)) napkin(b, crowded ? out + 40 : -out - 6, 60, deg(rng.between(-5, 5)), rng.pick(NAPKINS))
    if (art.cutlery === 'knife-fork') {
      fork(b, left, 40, deg(rng.between(-5, 5)))
      knife(b, right, 40, deg(rng.between(-5, 5)))
    } else if (art.cutlery === 'fork') {
      fork(b, crowded || rng.chance(0.5) ? out : -out, 40, deg(rng.between(-6, 6)))
    } else if (art.cutlery === 'spoon') {
      spoon(b, out, 40, deg(rng.between(-6, 6)))
    } else if (art.cutlery === 'dessert') {
      fork(b, out - 30, 50, deg(rng.between(-8, 8)))
    }

    if (art.side) b.at(side[0], side[1], 0, () => art.side?.(b))
    const [ex, ey] = art.side ? extra : rng.chance(0.5) ? extra : side
    if (options.light === 'morning' && rng.chance(0.7)) coffee(b, ex, ey)
    else if (options.light === 'evening' && rng.chance(0.55)) candle(b, ex, ey)
    else if (rng.chance(0.6)) glass(b, ex, ey, 92)
    else if (rng.chance(0.4)) sprig(b, ex - 60, ey + 20, deg(rng.between(-40, 40)))
  }

  art.paint(b, { disaster: options.disaster === true })
  c.restore()
  light(c, width, height, options.light)
}

/** The size of a demo photo: phone portrait for the camera, landscape from the gallery, square covers. */
export function photoSize(kind: 'proof' | 'cover', source: 'camera' | 'gallery'): [width: number, height: number] {
  if (kind === 'cover') return [1200, 1200]
  return source === 'gallery' ? [1200, 900] : [900, 1200]
}
