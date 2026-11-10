// The table the demo photos are taken on: gingham cloths, crockery, cutlery and the
// little things that stand around a plate. All seen straight from above.

import { Brush, darken, deg, lighten, mix, TAU, type Ctx } from './brush'

export type ClothName = 'rose' | 'sage' | 'butter' | 'sky' | 'lilac' | 'peach'

const CLOTHS: Record<ClothName, readonly [ground: string, stripe: string]> = {
  rose: ['#fdf3f4', '#eeb1bd'],
  sage: ['#f5f8f0', '#afc49d'],
  butter: ['#fffae8', '#edd47c'],
  sky: ['#f1f8fb', '#9ccbe2'],
  lilac: ['#f8f4fc', '#c3b1df'],
  peach: ['#fef4ec', '#f2b692'],
}

export const CLOTH_NAMES = Object.keys(CLOTHS) as ClothName[]

const SHADOW = '#3b2620'
const CHINA = '#fffdf9'
const STEEL = '#d9d4cf'

/** A pastel gingham tablecloth that covers everything the camera can see. */
export function cloth(b: Brush, name: ClothName, check = 132): void {
  const [ground, stripe] = CLOTHS[name]
  const reach = 1300
  const { c } = b
  c.fillStyle = ground
  c.fillRect(-reach, -reach, reach * 2, reach * 2)
  const offset = b.rng() * check
  c.fillStyle = stripe
  c.globalAlpha = 0.46
  for (let at = -reach + offset; at < reach; at += check) {
    c.fillRect(at, -reach, check / 2, reach * 2)
    c.fillRect(-reach, at, reach * 2, check / 2)
  }
  // The weave: fine threads, barely visible.
  c.globalAlpha = 0.07
  c.fillStyle = '#ffffff'
  for (let at = -reach; at < reach; at += check / 8) c.fillRect(at, -reach, 2.2, reach * 2)
  c.globalAlpha = 0.05
  c.fillStyle = darken(stripe, 0.4)
  for (let at = -reach; at < reach; at += check / 8) c.fillRect(-reach, at, reach * 2, 1.6)
  c.globalAlpha = 1
}

/** The soft shadow a round thing throws on the cloth. */
function roundShadow(b: Brush, x: number, y: number, r: number, depth = 1): void {
  b.oval(x + 10 * depth, y + 16 * depth, r + 22 * depth, r + 20 * depth, 0, SHADOW, 0.07)
  b.oval(x + 9 * depth, y + 14 * depth, r + 12 * depth, r + 11 * depth, 0, SHADOW, 0.08)
  b.oval(x + 7 * depth, y + 10 * depth, r + 4 * depth, r + 4 * depth, 0, SHADOW, 0.1)
}

export interface PlateLook {
  /** Colour of the china. */
  china?: string
  /** A painted line near the edge. */
  band?: string
  /** How wide the flat middle is, as a share of the radius. */
  well?: number
}

/** A flat plate. The food goes within about 0.66 of the radius. */
export function plate(b: Brush, r = 335, { china = CHINA, band, well = 0.7 }: PlateLook = {}): void {
  roundShadow(b, 0, 0, r)
  b.circle(0, 0, r, darken(china, 0.1))
  b.circle(0, 0, r - 4, china)
  if (band) {
    b.ring(0, 0, r - 24, 7, band, 0.9)
    b.ring(0, 0, r - 38, 2, band, 0.55)
  }
  b.circle(0, 0, r * well + 5, darken(china, 0.09))
  b.circle(0, 0, r * well, mix(china, '#f1e9e1', 0.5))
  b.shine(0, 0, r - 16, 195, 255, 9, 0.75)
  b.shine(0, 0, r * well - 12, 20, 70, 6, 0.4)
}

/** A bowl. `fill` paints what is in it, inside a circle of radius `inner`. */
export function bowl(b: Brush, r: number, china: string, fill: (inner: number) => void): void {
  const inner = r * 0.8
  roundShadow(b, 0, 0, r, 1.2)
  b.circle(0, 0, r, darken(china, 0.12))
  b.circle(0, 0, r - 4, china)
  b.circle(0, 0, r * 0.88, darken(china, 0.1))
  b.inside(0, 0, inner, () => {
    fill(inner)
    // The wall of the bowl shades what is inside.
    b.arc(0, 0, inner - 2, deg(150), deg(300), 22, SHADOW, 0.13)
    b.arc(0, 0, inner - 2, deg(-30), deg(100), 10, '#ffffff', 0.12)
  })
  b.shine(0, 0, r - 12, 200, 250, 8, 0.8)
}

/** A black iron pan with its handle pointing to the lower right. */
export function pan(b: Brush, r: number, fill: (inner: number) => void): void {
  const iron = '#2e2a29'
  const turn = deg(b.rng.between(28, 50))
  b.at(0, 0, turn, () => {
    b.box(r + 150, 12, 330, 62, 26, 0, SHADOW, 0.12)
    b.box(r + 140, 0, 330, 54, 24, 0, iron)
    b.box(r + 150, -8, 250, 12, 6, 0, '#57504d', 0.8)
    b.circle(r + 280, 0, 11, '#151312')
  })
  roundShadow(b, 0, 0, r, 1.3)
  b.circle(0, 0, r, iron)
  b.ring(0, 0, r - 7, 5, '#5a5350', 0.7)
  b.circle(0, 0, r * 0.9, '#3a3533')
  const inner = r * 0.87
  b.inside(0, 0, inner, () => {
    fill(inner)
    b.arc(0, 0, inner - 2, deg(150), deg(300), 20, '#000000', 0.16)
  })
  b.shine(0, 0, r - 8, 205, 240, 5, 0.35)
}

/** An oven dish with two handles. `fill` paints inside a box of the given size. */
export function ovenDish(b: Brush, w: number, h: number, color: string, fill: (w: number, h: number) => void): void {
  b.box(12, 18, w + 30, h + 26, 60, 0, SHADOW, 0.1)
  b.box(8, 12, w + 14, h + 12, 56, 0, SHADOW, 0.12)
  b.box(-w / 2 - 22, 0, 70, h * 0.42, 22, 0, darken(color, 0.12))
  b.box(w / 2 + 22, 0, 70, h * 0.42, 22, 0, darken(color, 0.12))
  b.box(0, 0, w, h, 54, 0, darken(color, 0.12))
  b.box(0, 0, w - 8, h - 8, 50, 0, color)
  b.box(0, 0, w - 46, h - 46, 34, 0, darken(color, 0.16))
  b.c.save()
  b.c.beginPath()
  b.c.roundRect(-(w - 54) / 2, -(h - 54) / 2, w - 54, h - 54, 30)
  b.c.clip()
  fill(w - 54, h - 54)
  b.c.restore()
  b.line(
    [
      [-w / 2 + 60, -h / 2 + 14],
      [0, -h / 2 + 11],
      [w / 2 - 120, -h / 2 + 14],
    ],
    6,
    '#ffffff',
    0.55,
  )
}

/** A wooden board. */
export function board(b: Brush, w: number, h: number, turn = 0, round = false): void {
  const wood = '#cfa272'
  b.at(0, 0, turn, () => {
    if (round) {
      roundShadow(b, 0, 0, w / 2, 0.9)
      b.circle(0, 0, w / 2, darken(wood, 0.2))
      b.circle(0, 0, w / 2 - 5, wood)
    } else {
      b.box(10, 16, w + 16, h + 14, 44, 0, SHADOW, 0.1)
      b.box(7, 10, w + 4, h + 4, 40, 0, SHADOW, 0.13)
      b.box(0, 0, w, h, 38, 0, darken(wood, 0.2))
      b.box(0, -3, w - 6, h - 10, 34, 0, wood)
    }
    b.c.save()
    b.c.beginPath()
    if (round) b.c.arc(0, 0, w / 2 - 8, 0, TAU)
    else b.c.roundRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 16, 30)
    b.c.clip()
    // Wood grain.
    for (let y = -h / 2; y < h / 2; y += b.rng.between(16, 34)) {
      const bend = b.rng.between(-12, 12)
      b.line(
        [
          [-w / 2, y],
          [-w / 6, y + bend],
          [w / 6, y - bend * 0.6],
          [w / 2, y + bend * 0.3],
        ],
        b.rng.between(1.5, 4),
        b.rng.chance(0.5) ? darken(wood, 0.16) : lighten(wood, 0.3),
        0.5,
      )
    }
    b.c.restore()
    if (!round) {
      b.circle(w / 2 - 42, 0, 15, darken(wood, 0.45))
      b.circle(w / 2 - 42, 2, 12, '#e9dccb', 0.5)
    }
  })
}

/** The red fondue pot with its handle. `fill` paints the cheese. */
export function caquelon(b: Brush, r: number, fill: (inner: number) => void): void {
  const enamel = '#c4424a'
  const turn = deg(b.rng.between(15, 40))
  b.at(0, 0, turn, () => {
    b.box(r + 110, 12, 240, 70, 30, 0, SHADOW, 0.12)
    b.box(r + 100, 0, 240, 62, 28, 0, darken(enamel, 0.15))
    b.box(r + 110, -8, 170, 14, 7, 0, lighten(enamel, 0.35), 0.6)
  })
  roundShadow(b, 0, 0, r, 1.4)
  b.circle(0, 0, r, darken(enamel, 0.18))
  b.circle(0, 0, r - 5, enamel)
  b.ring(0, 0, r - 14, 5, lighten(enamel, 0.3), 0.5)
  b.circle(0, 0, r * 0.86, '#f3e7cf')
  const inner = r * 0.83
  b.inside(0, 0, inner, () => {
    fill(inner)
    b.arc(0, 0, inner - 2, deg(150), deg(300), 22, SHADOW, 0.14)
  })
  b.shine(0, 0, r - 12, 200, 245, 7, 0.55)
}

/** A cup on a saucer, handle to the right. `fill` paints the drink. */
export function cup(b: Brush, r: number, china: string, fill: (inner: number) => void, saucer = true): void {
  if (saucer) {
    roundShadow(b, 0, 0, r * 1.62, 0.8)
    b.circle(0, 0, r * 1.62, darken(china, 0.1))
    b.circle(0, 0, r * 1.62 - 4, china)
    b.circle(0, 0, r * 1.2, darken(china, 0.07))
    b.shine(0, 0, r * 1.62 - 14, 195, 250, 7, 0.7)
  }
  const turn = deg(b.rng.between(-30, 25))
  b.at(0, 0, turn, () => {
    b.box(r + 34, 0, 84, 40, 20, 0, darken(china, 0.14))
    b.box(r + 34, 0, 62, 20, 10, 0, saucer ? darken(china, 0.07) : '#00000000')
  })
  roundShadow(b, 0, 0, r, 0.7)
  b.circle(0, 0, r, darken(china, 0.12))
  b.circle(0, 0, r - 4, china)
  const inner = r * 0.86
  b.circle(0, 0, inner + 3, darken(china, 0.12))
  b.inside(0, 0, inner, () => {
    fill(inner)
    b.arc(0, 0, inner - 2, deg(150), deg(300), 16, SHADOW, 0.16)
  })
  b.shine(0, 0, r - 8, 200, 250, 5, 0.8)
}

/** A drinking glass seen from above. `fill` paints what is in it. */
export function glass(b: Brush, x: number, y: number, r: number, fill?: (inner: number) => void): void {
  b.at(x, y, 0, () => {
    b.oval(9, 14, r + 12, r + 11, 0, SHADOW, 0.07)
    b.oval(6, 9, r + 3, r + 3, 0, SHADOW, 0.08)
    b.circle(0, 0, r, '#e8f1f2', 0.75)
    b.ring(0, 0, r - 3, 6, '#ffffff', 0.85)
    const inner = r * 0.82
    if (fill) b.inside(0, 0, inner, () => fill(inner))
    else b.circle(0, 0, inner, '#d3e9ee', 0.8)
    b.arc(0, 0, inner - 4, deg(150), deg(290), 9, '#6d8f99', 0.16)
    b.shine(0, 0, r - 4, 200, 260, 5, 0.95)
    b.shine(0, 0, inner * 0.6, 20, 65, 5, 0.5)
  })
}

// ---------------------------------------------------------------- cutlery --

function handleShadow(b: Brush, w: number, h: number): void {
  b.box(5, 8, w, h, w / 2, 0, SHADOW, 0.13)
}

export function fork(b: Brush, x: number, y: number, turn: number): void {
  b.at(x, y, turn, () => {
    handleShadow(b, 22, 250)
    b.box(0, 60, 22, 250, 11, 0, STEEL)
    b.box(-4, 60, 5, 220, 3, 0, '#f4f1ee', 0.8)
    b.box(0, -100, 58, 84, 20, 0, STEEL)
    for (const tine of [-21, -7, 7, 21]) {
      b.box(tine + 4, -176, 9, 92, 5, 0, SHADOW, 0.1)
      b.box(tine, -180, 9, 96, 5, 0, STEEL)
    }
    b.box(-14, -104, 6, 60, 3, 0, '#f4f1ee', 0.7)
  })
}

export function knife(b: Brush, x: number, y: number, turn: number): void {
  b.at(x, y, turn, () => {
    handleShadow(b, 26, 240)
    b.box(0, 70, 26, 230, 13, 0, STEEL)
    b.c.beginPath()
    b.c.moveTo(-13, -40)
    b.c.lineTo(13, -40)
    b.c.lineTo(13, -210)
    b.c.quadraticCurveTo(10, -262, -13, -250)
    b.c.closePath()
    b.c.fillStyle = '#e6e2de'
    b.c.fill()
    b.box(-6, -140, 5, 170, 3, 0, '#ffffff', 0.7)
    b.box(-5, 70, 5, 200, 3, 0, '#f4f1ee', 0.8)
  })
}

export function spoon(b: Brush, x: number, y: number, turn: number, size = 1): void {
  b.at(
    x,
    y,
    turn,
    () => {
      handleShadow(b, 20, 250)
      b.box(0, 60, 20, 250, 10, 0, STEEL)
      b.box(-4, 60, 5, 210, 3, 0, '#f4f1ee', 0.8)
      b.oval(5, -112, 46, 66, 0, SHADOW, 0.12)
      b.oval(0, -120, 44, 64, 0, STEEL)
      b.oval(0, -116, 33, 51, 0, '#c4beb8')
      b.oval(-10, -134, 12, 24, deg(15), '#f4f1ee', 0.7)
    },
    size,
  )
}

// ------------------------------------------------------------------ props --

export function napkin(b: Brush, x: number, y: number, turn: number, color: string): void {
  b.at(x, y, turn, () => {
    b.box(8, 12, 190, 330, 10, 0, SHADOW, 0.1)
    b.box(0, 0, 190, 330, 8, 0, color)
    b.box(-60, 0, 70, 330, 8, 0, darken(color, 0.06))
    b.c.setLineDash([12, 9])
    b.line(
      [
        [-80, -150],
        [-80, 150],
      ],
      2.5,
      darken(color, 0.3),
      0.6,
    )
    b.c.setLineDash([])
  })
}

/** A tea light in its little tin, burning. */
export function candle(b: Brush, x: number, y: number): void {
  b.at(x, y, 0, () => {
    b.circle(0, 0, 120, '#ffdf9a', 0.16)
    b.circle(0, 0, 80, '#ffe7b0', 0.2)
    b.oval(6, 9, 50, 49, 0, SHADOW, 0.12)
    b.circle(0, 0, 46, '#cfc9c2')
    b.circle(0, 0, 40, '#fff4dc')
    b.circle(0, 0, 14, '#f2dfb2')
    b.leaf(-2, 9, 26, deg(-80), '#f6a53a')
    b.leaf(-1, 6, 16, deg(-80), '#fff3c4')
    b.circle(0, 1, 3, '#3b2620')
  })
}

/** A cup of coffee at the edge of a breakfast photo. */
export function coffee(b: Brush, x: number, y: number): void {
  b.at(x, y, 0, () =>
    cup(b, 78, CHINA, (r) => {
      b.circle(0, 0, r, '#4b2e22')
      b.ring(0, 0, r - 10, 9, '#a8744c', 0.75)
      b.blob(-6, -4, r * 0.42, '#c79462', { wobble: 0.3, alpha: 0.5 })
    }),
  )
}

/** A small side bowl, for apple sauce, ketchup or jam. */
export function sideBowl(b: Brush, x: number, y: number, r: number, china: string, sauce: string): void {
  b.at(x, y, 0, () =>
    bowl(b, r, china, (inner) => {
      b.circle(0, 0, inner, sauce)
      b.blob(-inner * 0.15, -inner * 0.15, inner * 0.6, lighten(sauce, 0.25), { wobble: 0.25, alpha: 0.7 })
      b.shine(0, 0, inner * 0.55, 200, 250, 6, 0.4)
    }),
  )
}

/** A sprig of herbs lying on the cloth. */
export function sprig(b: Brush, x: number, y: number, turn: number, color = '#6f8f58'): void {
  b.at(x, y, turn, () => {
    b.line(
      [
        [0, 0],
        [40, -8],
        [90, 4],
        [140, -4],
      ],
      4,
      darken(color, 0.25),
    )
    for (let i = 0; i < 6; i++) {
      const at = 18 + i * 21
      b.leaf(at, -2, 34, deg(-55), color, darken(color, 0.3))
      b.leaf(at + 8, 0, 34, deg(50), lighten(color, 0.12), darken(color, 0.3))
    }
  })
}

/** Slices of bread, for dipping. */
export function breadSlices(b: Brush, x: number, y: number, turn: number, count = 2): void {
  b.at(x, y, turn, () => {
    for (let i = 0; i < count; i++) {
      const dx = i * 46 - (count - 1) * 23
      const dy = i * 30 - (count - 1) * 15
      b.lifted(() => b.blob(dx, dy, 84, '#b9824a', { wobble: 0.08, squash: 0.74, points: 12, turn: 0.2 * i }), 4)
      b.blob(dx, dy, 74, '#f3dfb8', { wobble: 0.08, squash: 0.72, points: 12, turn: 0.2 * i })
      b.specks(22, 52, ['#e4c898', '#fbeccd'], 4, dx, dy, 0.9)
    }
  })
}

/** Evening light is warm and low; morning light is clear. Every photo darkens a little towards its corners. */
export function light(c: Ctx, width: number, height: number, mood: 'morning' | 'day' | 'evening'): void {
  const reach = Math.hypot(width, height) / 2
  c.save()
  if (mood === 'evening') {
    c.globalCompositeOperation = 'multiply'
    c.fillStyle = '#ffe2bd'
    c.globalAlpha = 0.5
    c.fillRect(0, 0, width, height)
  } else if (mood === 'morning') {
    c.globalCompositeOperation = 'soft-light'
    c.fillStyle = '#fff6dc'
    c.globalAlpha = 0.35
    c.fillRect(0, 0, width, height)
  }
  c.globalCompositeOperation = 'source-over'
  c.globalAlpha = 1
  const shade = c.createRadialGradient(width * 0.46, height * 0.44, reach * 0.45, width / 2, height / 2, reach * 1.05)
  shade.addColorStop(0, 'rgba(59, 38, 32, 0)')
  shade.addColorStop(1, mood === 'evening' ? 'rgba(59, 38, 32, 0.34)' : 'rgba(59, 38, 32, 0.15)')
  c.fillStyle = shade
  c.fillRect(0, 0, width, height)
  // A soft glow where the lamp (or the window) is.
  const glow = c.createRadialGradient(width * 0.3, height * 0.26, 0, width * 0.3, height * 0.26, reach * 0.7)
  glow.addColorStop(0, mood === 'evening' ? 'rgba(255, 236, 200, 0.16)' : 'rgba(255, 255, 255, 0.14)')
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)')
  c.fillStyle = glow
  c.fillRect(0, 0, width, height)
  c.restore()
}
