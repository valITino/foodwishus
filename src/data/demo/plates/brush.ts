// A small painting kit on top of the canvas: soft organic shapes, scattered crumbs,
// leaves and strands. The plate painters in dishes.ts are written with it.

import type { Rng } from '../random'

/** A canvas on the page or one in a background worker: both paint the same way. */
export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
export type Point = readonly [x: number, y: number]

export const TAU = Math.PI * 2
export const deg = (degrees: number): number => (degrees * Math.PI) / 180

function channels(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

/** A colour between two colours: 0 gives the first, 1 the second. */
export function mix(from: string, to: string, amount: number): string {
  const a = channels(from)
  const b = channels(to)
  const part = (i: number): string =>
    Math.round(a[i] + (b[i] - a[i]) * amount)
      .toString(16)
      .padStart(2, '0')
  return `#${part(0)}${part(1)}${part(2)}`
}

export const lighten = (color: string, amount: number): string => mix(color, '#fffaf2', amount)
/** Shadows are warm cocoa, never grey. */
export const darken = (color: string, amount: number): string => mix(color, '#3b2620', amount)

export interface BlobOptions {
  /** How much the edge wanders: 0 is a perfect circle. */
  wobble?: number
  points?: number
  /** Below 1 flattens the shape into an oval. */
  squash?: number
  turn?: number
  alpha?: number
}

export class Brush {
  /** Canvas pixels per world unit, for things the canvas measures in pixels (shadows). */
  pixels = 1

  constructor(
    readonly c: Ctx,
    readonly rng: Rng,
  ) {}

  private paint(color: string, alpha: number): void {
    this.c.globalAlpha = alpha
    this.c.fillStyle = color
    this.c.fill()
    this.c.globalAlpha = 1
  }

  private ink(color: string, width: number, alpha: number): void {
    this.c.globalAlpha = alpha
    this.c.strokeStyle = color
    this.c.lineWidth = width
    this.c.lineCap = 'round'
    this.c.lineJoin = 'round'
    this.c.stroke()
    this.c.globalAlpha = 1
  }

  circle(x: number, y: number, r: number, color: string, alpha = 1): void {
    this.c.beginPath()
    this.c.arc(x, y, r, 0, TAU)
    this.paint(color, alpha)
  }

  oval(x: number, y: number, rx: number, ry: number, turn: number, color: string, alpha = 1): void {
    this.c.beginPath()
    this.c.ellipse(x, y, rx, ry, turn, 0, TAU)
    this.paint(color, alpha)
  }

  /** A circle drawn as a line. */
  ring(x: number, y: number, r: number, width: number, color: string, alpha = 1): void {
    this.c.beginPath()
    this.c.arc(x, y, r, 0, TAU)
    this.ink(color, width, alpha)
  }

  arc(x: number, y: number, r: number, from: number, to: number, width: number, color: string, alpha = 1): void {
    this.c.beginPath()
    this.c.arc(x, y, r, from, to)
    this.ink(color, width, alpha)
  }

  /** A rounded rectangle around its centre. */
  box(x: number, y: number, w: number, h: number, radius: number, turn: number, color: string, alpha = 1): void {
    this.c.save()
    this.c.translate(x, y)
    this.c.rotate(turn)
    this.c.beginPath()
    this.c.roundRect(-w / 2, -h / 2, w, h, Math.min(radius, w / 2, h / 2))
    this.paint(color, alpha)
    this.c.restore()
  }

  /** Trace a soft, slightly irregular closed shape. Fill it with blob(). */
  blobPath(x: number, y: number, r: number, { wobble = 0.12, points = 10, squash = 1, turn = 0 }: BlobOptions = {}): void {
    const start = this.rng() * TAU
    const cos = Math.cos(turn)
    const sin = Math.sin(turn)
    const edge: Point[] = []
    for (let i = 0; i < points; i++) {
      const angle = start + (i / points) * TAU
      const reach = r * (1 + (this.rng() * 2 - 1) * wobble)
      const px = Math.cos(angle) * reach
      const py = Math.sin(angle) * reach * squash
      edge.push([x + px * cos - py * sin, y + px * sin + py * cos])
    }
    const between = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const first = between(edge[points - 1], edge[0])
    this.c.beginPath()
    this.c.moveTo(first[0], first[1])
    for (let i = 0; i < points; i++) {
      const next = between(edge[i], edge[(i + 1) % points])
      this.c.quadraticCurveTo(edge[i][0], edge[i][1], next[0], next[1])
    }
    this.c.closePath()
  }

  blob(x: number, y: number, r: number, color: string, options: BlobOptions = {}): void {
    this.blobPath(x, y, r, options)
    this.paint(color, options.alpha ?? 1)
  }

  /** A smooth line through the given points. */
  line(points: readonly Point[], width: number, color: string, alpha = 1): void {
    if (points.length < 2) return
    this.c.beginPath()
    this.c.moveTo(points[0][0], points[0][1])
    for (let i = 1; i < points.length - 1; i++) {
      const midX = (points[i][0] + points[i + 1][0]) / 2
      const midY = (points[i][1] + points[i + 1][1]) / 2
      this.c.quadraticCurveTo(points[i][0], points[i][1], midX, midY)
    }
    const end = points[points.length - 1]
    this.c.lineTo(end[0], end[1])
    this.ink(color, width, alpha)
  }

  /** A filled shape with straight edges. */
  shape(points: readonly Point[], color: string, alpha = 1): void {
    this.c.beginPath()
    points.forEach(([x, y], i) => (i ? this.c.lineTo(x, y) : this.c.moveTo(x, y)))
    this.c.closePath()
    this.paint(color, alpha)
  }

  /** A pointed leaf growing from (x, y). */
  leaf(x: number, y: number, length: number, turn: number, color: string, vein?: string, plump = 0.42): void {
    this.c.save()
    this.c.translate(x, y)
    this.c.rotate(turn)
    this.c.beginPath()
    this.c.moveTo(0, 0)
    this.c.quadraticCurveTo(length * 0.45, -length * plump, length, 0)
    this.c.quadraticCurveTo(length * 0.45, length * plump, 0, 0)
    this.paint(color, 1)
    if (vein) {
      this.c.beginPath()
      this.c.moveTo(length * 0.12, 0)
      this.c.lineTo(length * 0.85, 0)
      this.ink(vein, Math.max(1.2, length * 0.04), 0.7)
    }
    this.c.restore()
  }

  /** A random point inside a circle. */
  spot(radius: number, cx = 0, cy = 0): Point {
    const angle = this.rng() * TAU
    const reach = Math.sqrt(this.rng()) * radius
    return [cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach]
  }

  /** Call draw at random points inside a circle. */
  scatter(count: number, radius: number, draw: (x: number, y: number, i: number) => void, cx = 0, cy = 0): void {
    for (let i = 0; i < count; i++) {
      const [x, y] = this.spot(radius, cx, cy)
      draw(x, y, i)
    }
  }

  /** Call draw at evenly spaced points on a circle, each nudged a little. */
  around(count: number, radius: number, draw: (x: number, y: number, angle: number, i: number) => void, cx = 0, cy = 0, loose = 0.12): void {
    const start = this.rng() * TAU
    for (let i = 0; i < count; i++) {
      const angle = start + ((i + (this.rng() - 0.5) * loose * 4) / count) * TAU
      const reach = radius * (1 + (this.rng() - 0.5) * loose)
      draw(cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach, angle, i)
    }
  }

  /** Draw with the origin moved and turned. */
  at(x: number, y: number, turn: number, draw: () => void, scale = 1): void {
    this.c.save()
    this.c.translate(x, y)
    this.c.rotate(turn)
    if (scale !== 1) this.c.scale(scale, scale)
    draw()
    this.c.restore()
  }

  /** Draw only inside a circle. */
  inside(x: number, y: number, r: number, draw: () => void): void {
    this.c.save()
    this.c.beginPath()
    this.c.arc(x, y, r, 0, TAU)
    this.c.clip()
    draw()
    this.c.restore()
  }

  /** Everything drawn inside casts a soft shadow, as if it lay on the plate. */
  lifted(draw: () => void, height = 5, strength = 0.28): void {
    this.c.save()
    this.c.shadowColor = `rgba(59, 38, 32, ${strength})`
    this.c.shadowBlur = height * 1.6 * this.pixels
    this.c.shadowOffsetX = height * 0.5 * this.pixels
    this.c.shadowOffsetY = height * 0.9 * this.pixels
    draw()
    this.c.restore()
  }

  /** Small dots of several colours: pepper, crumbs, sugar. */
  specks(count: number, radius: number, colors: readonly string[], size: number, cx = 0, cy = 0, alpha = 1): void {
    this.scatter(count, radius, (x, y) => this.circle(x, y, size * (0.6 + this.rng() * 0.8), this.rng.pick(colors), alpha), cx, cy)
  }

  /** Chopped herbs: tiny leaves, every one turned differently. */
  herbs(count: number, radius: number, color: string, size = 12, cx = 0, cy = 0): void {
    this.scatter(count, radius, (x, y) => this.leaf(x, y, size * (0.7 + this.rng() * 0.7), this.rng() * TAU, this.rng.chance(0.5) ? color : darken(color, 0.18)), cx, cy)
  }

  /** Little cubes: bacon, croutons, feta, potatoes. */
  cubes(count: number, radius: number, size: number, colors: readonly string[], cx = 0, cy = 0): void {
    this.scatter(
      count,
      radius,
      (x, y) => {
        const color = this.rng.pick(colors)
        const s = size * (0.75 + this.rng() * 0.5)
        const turn = this.rng() * TAU
        this.box(x, y, s, s * (0.8 + this.rng() * 0.3), s * 0.22, turn, color)
        this.box(x - s * 0.12, y - s * 0.12, s * 0.5, s * 0.4, s * 0.15, turn, lighten(color, 0.35), 0.7)
      },
      cx,
      cy,
    )
  }

  /** A glossy highlight: a pale curved stroke. */
  shine(x: number, y: number, r: number, from: number, to: number, width: number, alpha = 0.5): void {
    this.arc(x, y, r, deg(from), deg(to), width, '#ffffff', alpha)
  }
}
