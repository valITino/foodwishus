// How each dish of the demo kitchen looks on the table, seen from above. One painter
// per recipe card, all in the same flat, gouache-like style.

import type { DishKey } from '../content'
import { Brush, darken, deg, lighten, TAU, type Point } from './brush'
import { board, bowl, breadSlices, caquelon, cup, glass, ovenDish, pan, plate, sideBowl } from './table'

export type Cutlery = 'knife-fork' | 'fork' | 'spoon' | 'dessert' | 'none'

export interface Art {
  cutlery: Cutlery
  /** How far the dish reaches from the middle, when it is wider than a dinner plate. */
  reach?: number
  /** Something that stands next to the plate. Painted with its own origin. */
  side?: (b: Brush) => void
  paint: (b: Brush, o: { disaster: boolean }) => void
}

const CREAM = '#fffdf9'
const PARSLEY = '#5d8a45'
const BASIL = '#4f8a3c'
const CHIVE = '#6aa04a'
const PEPPER = ['#3b2620', '#5a4038']

// ------------------------------------------------------------ ingredients --

/** Pasta strands in a loose nest. */
function nest(b: Brush, radius: number, count: number, color: string, width: number): void {
  for (let i = 0; i < count; i++) {
    const points: Point[] = [b.spot(radius * 0.9)]
    let angle = b.rng() * TAU
    for (let k = 0; k < 5; k++) {
      angle += b.rng.between(0.7, 1.6)
      const reach = radius * b.rng.between(0.25, 0.95)
      points.push([Math.cos(angle) * reach, Math.sin(angle) * reach])
    }
    b.line(points, width + 3.5, darken(color, 0.22), 0.5)
    b.line(points, width, color)
    b.line(points, width * 0.32, lighten(color, 0.5), 0.75)
  }
}

/** Short bent tubes: macaroni and Hörnli. */
function elbows(b: Brush, radius: number, count: number, color: string, size: number): void {
  b.scatter(count, radius, (x, y) => {
    const from = b.rng() * TAU
    const to = from + b.rng.between(1.5, 2.7)
    b.arc(x, y, size, from, to, size * 0.72 + 3, darken(color, 0.2), 0.55)
    b.arc(x, y, size, from, to, size * 0.72, color)
    b.arc(x, y, size, from + 0.2, to - 0.2, size * 0.22, lighten(color, 0.5), 0.8)
  })
}

/** Rice: a white mound with visible grains. */
function rice(b: Brush, x: number, y: number, r: number, squash = 1): void {
  b.lifted(() => b.blob(x, y, r, '#f7f1e3', { wobble: 0.1, points: 14, squash }), 6, 0.22)
  b.scatter(
    Math.round(r * 1.5),
    r * 0.9,
    (gx, gy) => b.oval(gx, y + (gy - y) * squash, 7, 2.8, b.rng() * TAU, b.rng.chance(0.5) ? '#ffffff' : '#e6dcc6'),
    x,
    y,
  )
}

function friedEgg(b: Brush, x: number, y: number, size: number): void {
  b.lifted(() => b.blob(x, y, size, '#fffaf0', { wobble: 0.2, points: 9 }), 4, 0.25)
  b.blob(x + size * 0.05, y + size * 0.05, size * 0.8, '#fdf3df', { wobble: 0.2, alpha: 0.8 })
  b.circle(x + size * 0.06, y + size * 0.1, size * 0.36, '#d98a1c')
  b.circle(x + size * 0.04, y + size * 0.06, size * 0.34, '#f6b32a')
  b.shine(x + size * 0.04, y + size * 0.06, size * 0.22, 200, 260, size * 0.07, 0.7)
}

function lemonSlice(b: Brush, x: number, y: number, r: number): void {
  b.lifted(() => b.circle(x, y, r, '#f2c838'), 3)
  b.circle(x, y, r * 0.86, '#fbeb9a')
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * TAU
    b.line(
      [
        [x, y],
        [x + Math.cos(angle) * r * 0.82, y + Math.sin(angle) * r * 0.82],
      ],
      r * 0.07,
      '#fff7cf',
    )
  }
  b.circle(x, y, r * 0.12, '#fff7cf')
}

function potato(b: Brush, x: number, y: number, r: number, roasted = true): void {
  const skin = roasted ? '#d9a441' : '#e8cf7c'
  b.lifted(() => b.blob(x, y, r, darken(skin, 0.18), { wobble: 0.14, squash: 0.8, turn: b.rng() * TAU }), 4)
  b.blob(x - r * 0.06, y - r * 0.06, r * 0.84, skin, { wobble: 0.14, squash: 0.8, turn: b.rng() * TAU })
  b.blob(x - r * 0.2, y - r * 0.2, r * 0.4, lighten(skin, 0.4), { wobble: 0.3, alpha: 0.7 })
}

function mushroom(b: Brush, x: number, y: number, size: number, turn: number): void {
  b.at(x, y, turn, () => {
    b.lifted(() => {
      b.box(0, size * 0.35, size * 0.42, size * 0.8, size * 0.16, 0, '#e9dcc4')
      b.oval(0, -size * 0.1, size * 0.7, size * 0.42, 0, '#a57c56')
    }, 3)
    b.oval(0, -size * 0.16, size * 0.5, size * 0.2, 0, '#c29a72', 0.8)
  })
}

function basil(b: Brush, x: number, y: number, size: number, turn: number): void {
  b.lifted(() => b.leaf(x, y, size, turn, BASIL, darken(BASIL, 0.3), 0.55), 2.5)
  b.leaf(x + Math.cos(turn) * size * 0.2, y + Math.sin(turn) * size * 0.2, size * 0.5, turn - 0.25, lighten(BASIL, 0.25), undefined, 0.3)
}

function blueberry(b: Brush, x: number, y: number, r: number): void {
  b.lifted(() => b.circle(x, y, r, '#39446f'), 3)
  b.circle(x - r * 0.2, y - r * 0.2, r * 0.55, '#56639a', 0.8)
  b.circle(x + r * 0.15, y + r * 0.1, r * 0.22, '#232a48')
}

function raspberry(b: Brush, x: number, y: number, r: number): void {
  b.lifted(() => b.circle(x, y, r, '#b8284a'), 3)
  b.around(7, r * 0.6, (px, py) => b.circle(px, py, r * 0.3, '#de4a6a'), x, y)
  b.circle(x, y, r * 0.3, '#e86a84')
}

/** A swirl of cream on soup. */
function swirl(b: Brush, r: number, color: string, width: number, alpha = 0.9): void {
  const points: Point[] = []
  const start = b.rng() * TAU
  for (let i = 0; i <= 26; i++) {
    const angle = start + i * 0.42
    const reach = r * (0.12 + (i / 26) * 0.88)
    points.push([Math.cos(angle) * reach, Math.sin(angle) * reach])
  }
  b.line(points, width, color, alpha)
}

/** Browned patches on cheese and crusts. */
function browned(b: Brush, count: number, radius: number, colors: readonly string[], size: number, cx = 0, cy = 0): void {
  b.scatter(count, radius, (x, y) => b.blob(x, y, size * b.rng.between(0.5, 1.4), b.rng.pick(colors), { wobble: 0.35, points: 7, alpha: 0.75, squash: b.rng.between(0.6, 1) }), cx, cy)
}

function greenBeans(b: Brush, x: number, y: number, turn: number, count: number, length: number): void {
  b.at(x, y, turn, () => {
    for (let i = 0; i < count; i++) {
      const dy = (i - count / 2) * 13 + b.rng.between(-4, 4)
      const bend = b.rng.between(-14, 14)
      const points: Point[] = [
        [-length / 2 + b.rng.between(-12, 12), dy],
        [0, dy + bend],
        [length / 2 + b.rng.between(-12, 12), dy + b.rng.between(-6, 6)],
      ]
      b.line(points, 13, '#4d7a35', 0.9)
      b.line(points, 9, '#6fa04c')
      b.line(points, 3, '#a2c878', 0.7)
    }
  })
}

/** A wedge of cake or tart on a plate, its tip pointing to the lower left. */
function wedgePath(b: Brush, length: number, spread: number): void {
  b.c.beginPath()
  b.c.moveTo(0, 0)
  b.c.arc(0, 0, length, -spread / 2, spread / 2)
  b.c.closePath()
}

// ----------------------------------------------------------------- dishes --

export const ARTS: Record<DishKey, Art> = {

  alplermagronen: {
    cutlery: 'fork',
    side: (b) => sideBowl(b, 0, 0, 98, CREAM, '#e3cc7a'),
    paint: (b) => {
      plate(b, 335, { band: '#c8414b', well: 0.74 })
      b.lifted(() => b.blob(0, 0, 226, '#e2b955', { wobble: 0.05, points: 16 }), 3, 0.18)
      b.blob(0, 0, 220, '#f0cd72', { wobble: 0.05, points: 16 })
      b.cubes(16, 190, 46, ['#f6e3a0', '#f9ebb8'])
      elbows(b, 196, 100, '#f4cf68', 20)
      b.cubes(9, 170, 42, ['#f9ebb8'])
      elbows(b, 176, 30, '#f8da80', 20)
      // Melted cheese, then a generous pile of golden onions.
      b.scatter(9, 160, (x, y) => b.blob(x, y, b.rng.between(22, 42), '#fdf0bc', { wobble: 0.4, alpha: 0.55 }))
      b.lifted(() => {
        b.scatter(46, 128, (x, y) => {
          const from = b.rng() * TAU
          const color = b.rng.pick(['#a8601f', '#c0782a', '#8f4d18', '#d08f3a', '#b96c22'])
          b.arc(x, y, b.rng.between(15, 36), from, from + b.rng.between(2.4, 5), b.rng.between(7, 10), color)
        })
      }, 3)
      b.scatter(14, 110, (x, y) => {
        const from = b.rng() * TAU
        b.arc(x, y, b.rng.between(14, 26), from, from + 1.4, 3, '#f1c672', 0.9)
      })
      b.herbs(16, 195, CHIVE, 11)
      b.specks(46, 200, PEPPER, 2.3, 0, 0, 0.7)
    },
  },

  rosti: {
    cutlery: 'knife-fork',
    paint: (b) => {
      plate(b, 335, { band: '#8fa382' })
      b.lifted(() => b.blob(0, 0, 205, '#b46f1d', { wobble: 0.05, points: 18 }), 6)
      b.blob(0, 0, 192, '#dba032', { wobble: 0.05, points: 18 })
      // Grated potato, crisp at the edge.
      b.scatter(330, 196, (x, y) => {
        const far = Math.hypot(x, y) / 196
        const turn = b.rng() * TAU
        const length = b.rng.between(16, 34)
        const color = far > 0.82 ? b.rng.pick(['#a8641c', '#bf7a22', '#c98a2c']) : b.rng.pick(['#f0c252', '#e2a93a', '#f6d373', '#c98a2c'])
        b.line(
          [
            [x - Math.cos(turn) * length, y - Math.sin(turn) * length],
            [x + Math.cos(turn) * length, y + Math.sin(turn) * length],
          ],
          b.rng.between(4, 7),
          color,
          0.9,
        )
      })
      friedEgg(b, b.rng.between(-30, 30), b.rng.between(-30, 20), 96)
      b.herbs(34, 180, CHIVE, 11)
      b.specks(30, 90, PEPPER, 2.4)
    },
  },

  geschnetzeltes: {
    cutlery: 'knife-fork',
    paint: (b) => {
      plate(b, 335, { band: '#d9b25c' })
      // Rösti on one side.
      b.at(-88, 10, deg(b.rng.between(-10, 10)), () => {
        b.lifted(() => b.blob(0, 0, 122, '#b46f1d', { wobble: 0.08, squash: 1.25, points: 14 }), 5)
        b.blob(0, 0, 112, '#dba032', { wobble: 0.08, squash: 1.25, points: 14 })
        b.scatter(120, 118, (x, y) => {
          const turn = b.rng() * TAU
          b.line(
            [
              [x * 0.9 - Math.cos(turn) * 16, y * 1.2 - Math.sin(turn) * 16],
              [x * 0.9 + Math.cos(turn) * 16, y * 1.2 + Math.sin(turn) * 16],
            ],
            5,
            b.rng.pick(['#f0c252', '#c98a2c', '#f6d373', '#a8641c']),
            0.9,
          )
        })
      })
      // The cream sauce with veal and mushrooms.
      b.blob(84, 6, 150, '#ecd9b0', { wobble: 0.1, squash: 1.2, points: 14 })
      b.blob(80, 0, 120, '#f5e8c8', { wobble: 0.14, squash: 1.2, alpha: 0.7 })
      b.lifted(() => {
        b.scatter(13, 100, (x, y) => b.box(x, y * 1.25, b.rng.between(44, 66), b.rng.between(20, 28), 10, b.rng() * TAU, b.rng.pick(['#c49a74', '#b58a64', '#d2ab86'])), 84, 4)
      }, 4)
      b.scatter(9, 105, (x, y) => mushroom(b, x, y * 1.2, 34, b.rng() * TAU), 84, 4)
      b.scatter(5, 90, (x, y) => b.blob(x, y * 1.2, 26, '#f7eed6', { wobble: 0.4, alpha: 0.6 }), 84, 4)
      b.herbs(26, 120, PARSLEY, 12, 84, 0)
    },
  },

  hoernli: {
    cutlery: 'fork',
    side: (b) => sideBowl(b, 0, 0, 98, CREAM, '#e3cc7a'),
    paint: (b) => {
      plate(b, 335, { band: '#a9d4e8', well: 0.74 })
      b.lifted(() => b.blob(0, 0, 222, '#d9b45a', { wobble: 0.06, points: 16 }), 3, 0.18)
      b.blob(0, 0, 216, '#e8c670', { wobble: 0.06, points: 16 })
      elbows(b, 200, 210, '#f8e2a0', 15)
      // The mince sauce in the middle.
      b.lifted(() => b.blob(10, 6, 120, '#7b3f24', { wobble: 0.18, points: 12 }), 5)
      b.blob(6, 2, 104, '#96512c', { wobble: 0.2, points: 12 })
      b.specks(120, 100, ['#6b3520', '#a8623a', '#5a2b19', '#b8754a'], 7, 8, 4)
      b.cubes(10, 90, 12, ['#e0863a'], 8, 4)
      b.scatter(60, 130, (x, y) => b.box(x, y, b.rng.between(12, 24), 4, 2, b.rng() * TAU, '#fff3cf'))
      b.herbs(8, 100, PARSLEY, 10)
    },
  },

  fondue: {
    cutlery: 'none',
    reach: 350,
    side: (b) => {
      // A plate of bread cubes.
      plate(b, 150, { well: 0.78 })
      b.lifted(() => b.cubes(15, 86, 50, ['#f1ddb1', '#ecd3a0']), 4)
      b.scatter(12, 84, (x, y) => b.box(x, y, 34, 9, 4, b.rng() * TAU, '#b47f43', 0.85))
    },
    paint: (b) => {
      caquelon(b, 300, (r) => {
        b.circle(0, 0, r, '#f4dc8a')
        b.blob(-20, -20, r * 0.8, '#f9e9ae', { wobble: 0.16, alpha: 0.7 })
        swirl(b, r * 0.8, '#fff5cc', 16, 0.6)
        swirl(b, r * 0.86, '#e2c468', 7, 0.5)
        b.scatter(16, r * 0.82, (x, y) => {
          const size = b.rng.between(7, 17)
          b.ring(x, y, size, 3, '#d9b858', 0.8)
          b.circle(x - size * 0.2, y - size * 0.2, size * 0.5, '#fff8d8', 0.7)
        })
        b.specks(30, r * 0.8, PEPPER, 2.2, 0, 0, 0.5)
      })
      // Two long forks, one with bread on it.
      const turn = deg(b.rng.between(-150, -110))
      for (const [swing, loaded] of [
        [0, true],
        [0.7, false],
      ] as const) {
        b.at(0, 0, turn + swing, () => {
          b.line(
            [
              [70, 0],
              [470, 0],
            ],
            13,
            '#3b2620',
            0.14,
          )
          b.line(
            [
              [60, -6],
              [330, -6],
            ],
            7,
            '#d9d4cf',
          )
          b.box(400, -6, 150, 20, 10, 0, loaded ? '#3d6a8c' : '#b8433f')
          if (loaded) b.lifted(() => b.cubes(1, 2, 62, ['#f1ddb1'], 66, -6), 5)
        })
      }
    },
  },


  raclette: {
    cutlery: 'knife-fork',
    side: (b) => {
      // The little pan, with a slice waiting.
      b.at(0, 0, deg(-25), () => {
        b.box(8, 12, 190, 150, 26, 0, '#3b2620', 0.12)
        b.box(150, 0, 150, 34, 14, 0, '#3a3533')
        b.box(0, 0, 190, 150, 26, 0, '#2e2a29')
        b.box(0, 0, 164, 124, 18, 0, '#f4d262')
        browned(b, 7, 50, ['#e0a83c', '#c98a2c'], 14)
      })
    },
    paint: (b) => {
      plate(b, 335, { band: '#c8414b' })
      // Halved potatoes, skin on.
      const half = (x: number, y: number, turn: number): void => {
        b.at(x, y, turn, () => {
          b.lifted(() => b.oval(0, 0, 70, 52, 0, '#b08a44'), 5)
          b.oval(0, 0, 63, 45, 0, '#f3e2a2')
          b.oval(-8, -8, 44, 28, 0, '#fbf0c4', 0.8)
          b.specks(8, 40, ['#e6cf86'], 3)
        })
      }
      half(-118, -80, deg(20))
      half(-150, 50, deg(-30))
      half(-40, 130, deg(60))
      // The cheese, scraped over two more potatoes: molten, blistered, dusted with paprika.
      half(10, -40, deg(-10))
      half(70, 40, deg(40))
      b.lifted(() => b.blob(34, 0, 150, '#e0ad36', { wobble: 0.2, points: 11, squash: 0.86, turn: b.rng() * TAU }), 5, 0.26)
      b.blob(30, -4, 138, '#f4cf58', { wobble: 0.2, points: 11, squash: 0.86, turn: b.rng() * TAU })
      b.blob(18, -18, 96, '#fae28a', { wobble: 0.25, points: 10, squash: 0.8, alpha: 0.85 })
      browned(b, 14, 110, ['#dc9f34', '#c98a2c', '#b8742a'], 16, 32, 0)
      b.scatter(9, 100, (x, y) => {
        const size = b.rng.between(8, 16)
        b.ring(x, y, size, 3, '#e0ad36', 0.9)
        b.circle(x - size * 0.2, y - size * 0.2, size * 0.45, '#fff3c0', 0.8)
      }, 32, 0)
      b.shine(30, -4, 100, 200, 245, 9, 0.4)
      b.specks(60, 120, ['#c8414b', '#a8332f', '#d9573a'], 2.8, 32, 0, 0.85)
      b.specks(24, 120, PEPPER, 2.2, 32, 0, 0.7)
      // Gherkins and silverskin onions.
      for (let i = 0; i < 4; i++) {
        const x = -70 + i * 58 + b.rng.between(-8, 8)
        const y = -172 + b.rng.between(-14, 14)
        b.at(x, y, deg(b.rng.between(-50, 50)), () => {
          b.lifted(() => b.box(0, 0, 88, 32, 16, 0, '#58782f'), 4)
          b.box(-2, -3, 78, 22, 11, 0, '#7c9c44')
          b.box(-4, -8, 56, 5, 3, 0, '#a9c468', 0.8)
          for (let k = 0; k < 7; k++) b.circle(-30 + k * 10, b.rng.between(-4, 8), 2.6, '#58782f', 0.7)
        })
      }
      b.lifted(() => b.scatter(6, 46, (x, y) => b.circle(x, y, 18, '#f6f1e2'), 150, 150), 4)
      b.scatter(6, 46, (x, y) => b.circle(x - 4, y - 4, 6, '#ffffff', 0.9), 150, 150)
    },
  },


  rizcasimir: {
    cutlery: 'knife-fork',
    paint: (b) => {
      plate(b, 335, { china: '#cfe3ea', well: 0.76 })
      rice(b, 0, 0, 226)
      // Curry in the middle of the rice ring.
      b.lifted(() => b.blob(0, 0, 138, '#c98a1c', { wobble: 0.08, points: 14 }), 3, 0.2)
      b.blob(0, 0, 130, '#e4ae36', { wobble: 0.08, points: 14 })
      b.blob(-14, -14, 88, '#efc558', { wobble: 0.2, alpha: 0.7 })
      b.lifted(() => b.scatter(10, 92, (x, y) => b.blob(x, y, b.rng.between(22, 30), '#f3e2bc', { wobble: 0.25, squash: 0.75, turn: b.rng() * TAU })), 3)
      // Fried banana halves, curved and caramelised.
      for (const side of [-1, 1]) {
        b.at(side * 34, 14, side < 0 ? Math.PI : 0, () => {
          const [from, to] = [deg(-42), deg(42)]
          b.lifted(() => b.arc(0, 0, 150, from, to, 44, '#d49a30'), 4)
          b.arc(0, 0, 151, from + 0.02, to - 0.02, 32, '#f8de8c')
          b.arc(0, 0, 151, from + 0.1, to - 0.1, 5, '#e2b450', 0.8)
          b.scatter(5, 1, () => {
            const at = b.rng.between(from + 0.1, to - 0.1)
            b.blob(Math.cos(at) * 151, Math.sin(at) * 151, b.rng.between(8, 14), '#b8742a', { wobble: 0.4, alpha: 0.7 })
          })
        })
      }
      // A pineapple ring with its cherry, and toasted almonds.
      const [px, py] = [b.rng.between(-16, 16), b.rng.between(-10, 16)]
      b.lifted(() => b.circle(px, py, 62, '#e2ae24'), 4)
      b.circle(px, py, 54, '#f8d84a')
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * TAU
        b.line(
          [
            [px + Math.cos(angle) * 22, py + Math.sin(angle) * 22],
            [px + Math.cos(angle) * 54, py + Math.sin(angle) * 54],
          ],
          3,
          '#e2b02a',
          0.8,
        )
      }
      b.circle(px, py, 20, '#e4ae36')
      b.lifted(() => b.circle(px, py, 17, '#b3202f'), 3)
      b.circle(px - 5, py - 5, 6, '#f08a94', 0.9)
      b.lifted(() => b.scatter(16, 120, (x, y) => b.oval(x, y, 14, 7, b.rng() * TAU, b.rng.pick(['#f1dcae', '#d9b06a', '#e6c68a']))), 2)
    },
  },

  kaesesouffle: {
    cutlery: 'spoon',
    paint: (b, { disaster }) => {
      plate(b, 300, { band: '#b5c4a8', well: 0.66 })
      // A fluted white ramekin.
      const r = 176
      b.lifted(() => b.circle(0, 0, r, '#e9e1d8'), 8, 0.3)
      b.around(28, r - 7, (x, y) => b.circle(x, y, 12, '#fffdf9'), 0, 0, 0)
      b.circle(0, 0, r - 12, '#fffdf9')
      b.circle(0, 0, r - 24, '#e4dbd0')
      if (disaster) {
        // It sank. And it caught at the edge.
        b.inside(0, 0, r - 26, () => {
          b.circle(0, 0, r, '#c79232')
          b.blob(8, 10, 118, '#8a5320', { wobble: 0.18, points: 11 })
          b.blob(12, 14, 88, '#6e3e17', { wobble: 0.2, points: 10 })
          b.blob(14, 18, 52, '#4f2b12', { wobble: 0.25 })
          browned(b, 16, 140, ['#3b2418', '#2c1a12', '#5a3418'], 20)
          for (let i = 0; i < 6; i++) {
            const angle = b.rng() * TAU
            b.line(
              [
                [Math.cos(angle) * 30, Math.sin(angle) * 30],
                [Math.cos(angle + 0.2) * 80, Math.sin(angle + 0.2) * 80],
                [Math.cos(angle - 0.1) * 135, Math.sin(angle - 0.1) * 135],
              ],
              5,
              '#2c1a12',
              0.7,
            )
          }
          b.arc(0, 0, r - 30, deg(150), deg(300), 30, '#3b2620', 0.3)
        })
      } else {
        // Risen proudly above the rim.
        b.lifted(() => b.blob(0, 0, r - 10, '#d9a034', { wobble: 0.05, points: 16 }), 9, 0.32)
        b.blob(-6, -6, r - 30, '#ecbd52', { wobble: 0.07, points: 14 })
        b.blob(-14, -14, r - 70, '#f6d67c', { wobble: 0.1 })
        b.blob(-22, -22, r - 118, '#fbe7a4', { wobble: 0.14, alpha: 0.9 })
        browned(b, 12, 130, ['#c98a2c', '#b8742a'], 13)
        b.shine(0, 0, r - 44, 205, 250, 10, 0.4)
      }
      b.herbs(disaster ? 0 : 8, 250, CHIVE, 12)
    },
  },

  nuesslisalat: {
    cutlery: 'fork',
    paint: (b) => {
      plate(b, 335, { band: '#8fa382', well: 0.74 })
      // Little rosettes of lamb's lettuce.
      b.lifted(() => {
        b.scatter(58, 190, (x, y) => {
          const turn = b.rng() * TAU
          const color = b.rng.pick(['#4f7c38', '#5f9044', '#487034', '#6ea052'])
          for (let i = 0; i < 5; i++) b.leaf(x, y, b.rng.between(38, 58), turn + (i / 5) * TAU + b.rng.between(-0.2, 0.2), color, darken(color, 0.25), 0.5)
          b.circle(x, y, 5, '#dfe8c8')
        })
      }, 2.5, 0.22)
      // Chopped egg, bacon, croutons.
      b.lifted(() => {
        b.cubes(16, 175, 22, ['#fffaf0', '#f8f0dc'])
        b.cubes(11, 175, 17, ['#f2b62c', '#f6c648'])
        b.cubes(22, 180, 15, ['#b4533f', '#c96a50', '#8f3d2e'])
        b.cubes(12, 180, 30, ['#d9a04a', '#e6b866'])
      }, 3)
      b.specks(30, 190, PEPPER, 2.2, 0, 0, 0.6)
    },
  },

  chaeschuechli: {
    cutlery: 'none',
    reach: 360,
    paint: (b) => {
      board(b, 660, 480, deg(b.rng.between(-6, 6)))
      const tart = (x: number, y: number): void => {
        b.at(x, y, b.rng() * TAU, () => {
          b.lifted(() => b.circle(0, 0, 100, '#b98342'), 6, 0.3)
          b.around(18, 92, (px, py) => b.circle(px, py, 13, '#dba85a'), 0, 0, 0)
          b.circle(0, 0, 90, '#dba85a')
          b.circle(0, 0, 76, '#e9b23e')
          b.blob(-4, -4, 66, '#f4cc58', { wobble: 0.1 })
          browned(b, 9, 60, ['#c98a2c', '#b06f22', '#d99a34'], 13)
          b.blob(-14, -16, 30, '#fbe08a', { wobble: 0.3, alpha: 0.7 })
        })
      }
      tart(-190, -105)
      tart(40, -120)
      tart(-150, 115)
      tart(85, 105)
      // One is already half gone.
      b.at(250, -10, 0, () => {
        b.specks(16, 50, ['#dba85a', '#e9b23e', '#b98342'], 5)
      })
    },
  },

  lasagne: {
    cutlery: 'none',
    reach: 400,
    paint: (b) => {
      b.at(0, 0, deg(b.rng.between(-5, 5)), () => {
        ovenDish(b, 690, 500, '#f4efe6', (w, h) => {
          b.box(0, 0, w + 20, h + 20, 0, 0, '#a83222')
          b.box(0, 0, w - 26, h - 26, 26, 0, '#efcd7c')
          // Béchamel and cheese, browned in the oven.
          b.scatter(26, w / 2, (x, y) => b.blob(x, y * (h / w), b.rng.between(40, 76), '#f8e2a4', { wobble: 0.3, alpha: 0.8 }))
          browned(b, 44, w / 2, ['#d99a3a', '#c07a28', '#a85f1c', '#e2ae4c'], 26)
          b.scatter(16, w / 2, (x, y) => b.blob(x, y * (h / w), b.rng.between(18, 34), '#fbf0cf', { wobble: 0.35, alpha: 0.85 }))
          // Sauce bubbling up along the edge.
          b.around(26, 1, (_x, _y, angle) => b.blob(Math.cos(angle) * (w / 2 - 8), Math.sin(angle) * (h / 2 - 8), b.rng.between(14, 30), '#a83222', { wobble: 0.4, alpha: 0.9 }))
          // The corner piece is already gone.
          b.box(w / 2 - 78, h / 2 - 66, 200, 176, 14, 0, '#8f2a1c')
          b.box(w / 2 - 70, h / 2 - 58, 176, 150, 12, 0, '#e9e2d6')
          b.scatter(9, 70, (x, y) => b.blob(x, y, b.rng.between(8, 20), b.rng.pick(['#b03a26', '#efcd7c']), { wobble: 0.4, alpha: 0.85 }), w / 2 - 70, h / 2 - 58)
          b.line(
            [
              [w / 2 - 172, -h / 2],
              [w / 2 - 170, h / 2 - 150],
            ],
            4,
            '#8f5a1e',
            0.5,
          )
          b.line(
            [
              [-w / 2, h / 2 - 148],
              [w / 2 - 170, h / 2 - 146],
            ],
            4,
            '#8f5a1e',
            0.5,
          )
        })
        basil(b, -80, -40, 62, deg(-30))
        basil(b, -60, -20, 50, deg(60))
      })
    },
  },

  carbonara: {
    cutlery: 'fork',
    paint: (b) => {
      plate(b, 335, { band: '#4a3833', well: 0.74 })
      b.lifted(() => b.blob(0, 0, 204, '#e4bf5e', { wobble: 0.08, points: 14 }), 3, 0.18)
      b.blob(0, 0, 198, '#f0d27e', { wobble: 0.08, points: 14 })
      nest(b, 196, 50, '#f2c95c', 11)
      b.lifted(() => b.cubes(22, 155, 24, ['#c4604e', '#d98670', '#a84a3c']), 3)
      nest(b, 150, 10, '#f7d878', 11)
      b.scatter(70, 170, (x, y) => b.box(x, y, b.rng.between(8, 18), 4, 2, b.rng() * TAU, '#fffaf0', 0.95))
      b.specks(90, 190, PEPPER, 2.6)
      b.circle(b.rng.between(-20, 20), b.rng.between(-20, 20), 3, '#3b2620')
    },
  },

  risotto: {
    cutlery: 'fork',
    paint: (b) => {
      plate(b, 335, { band: '#b5c4a8', well: 0.76 })
      b.lifted(() => b.blob(0, 0, 215, '#e4d3a6', { wobble: 0.06, points: 16 }), 4, 0.2)
      b.blob(0, 0, 204, '#efe2bc', { wobble: 0.07, points: 16 })
      b.scatter(380, 196, (x, y) => b.oval(x, y, 7.5, 3.4, b.rng() * TAU, b.rng.pick(['#fbf4dc', '#e2d2a4', '#f6ecca'])))
      b.scatter(12, 140, (x, y) => mushroom(b, x, y, 42, b.rng() * TAU))
      b.lifted(() => b.scatter(7, 120, (x, y) => b.shape([[x, y], [x + b.rng.between(30, 54), y + b.rng.between(-8, 12)], [x + b.rng.between(10, 26), y + b.rng.between(22, 40)]], '#fbf2d2')), 2.5)
      b.herbs(34, 180, PARSLEY, 12)
      b.specks(40, 190, PEPPER, 2.2, 0, 0, 0.7)
    },
  },

  pizza: {
    cutlery: 'none',
    reach: 395,
    paint: (b) => {
      board(b, 760, 760, 0, true)
      b.at(0, 0, b.rng() * TAU, () => {
        b.lifted(() => b.blob(0, 0, 330, '#c98f44', { wobble: 0.035, points: 22 }), 6, 0.3)
        b.blob(0, 0, 320, '#e6bd74', { wobble: 0.035, points: 22 })
        b.around(26, 300, (x, y) => b.blob(x, y, b.rng.between(14, 30), b.rng.pick(['#d49a48', '#b8762c', '#f1d08e', '#8a5a26']), { wobble: 0.3, alpha: 0.8 }), 0, 0, 0.3)
        b.blob(0, 0, 270, '#b8301f', { wobble: 0.05, points: 20 })
        b.blob(0, 0, 258, '#cf4630', { wobble: 0.06, points: 20 })
        b.scatter(20, 230, (x, y) => b.blob(x, y, b.rng.between(20, 50), '#de6044', { wobble: 0.4, alpha: 0.6 }))
        // Mozzarella, melted into soft pools.
        b.scatter(13, 205, (x, y) => {
          const size = b.rng.between(40, 66)
          b.blob(x, y, size, '#f3e6c8', { wobble: 0.25, points: 9 })
          b.blob(x - 4, y - 4, size * 0.78, '#fffaf0', { wobble: 0.25, points: 9 })
          b.blob(x + size * 0.2, y + size * 0.2, size * 0.25, '#e9b85a', { wobble: 0.4, alpha: 0.7 })
        })
        b.scatter(8, 200, (x, y) => basil(b, x, y, b.rng.between(48, 70), b.rng() * TAU))
        b.specks(16, 300, ['#5a3418', '#3b2418'], 6, 0, 0, 0.6)
        // Cut into six.
        for (let i = 0; i < 3; i++) {
          const angle = (i / 3) * Math.PI + 0.3
          b.line(
            [
              [Math.cos(angle) * 326, Math.sin(angle) * 326],
              [-Math.cos(angle) * 326, -Math.sin(angle) * 326],
            ],
            4,
            '#7a2416',
            0.55,
          )
        }
      })
    },
  },

  greencurry: {
    cutlery: 'spoon',
    paint: (b) => {
      bowl(b, 320, '#f2ede4', (r) => {
        b.circle(0, 0, r, '#b7c56a')
        b.blob(-20, -10, r * 0.8, '#c9d488', { wobble: 0.2, alpha: 0.8 })
        swirl(b, r * 0.7, '#e9efc4', 9, 0.5)
        // Rice on one side.
        rice(b, -r * 0.42, r * 0.1, r * 0.46, 1.25)
        b.lifted(() => {
          b.scatter(8, r * 0.42, (x, y) => b.blob(x, y, b.rng.between(24, 32), '#f1e4c2', { wobble: 0.25, squash: 0.8, turn: b.rng() * TAU }), r * 0.3, 0)
          b.scatter(9, r * 0.5, (x, y) => b.box(x, y, b.rng.between(70, 96), 17, 8, b.rng() * TAU, b.rng.pick(['#d2452f', '#e25a3c'])), r * 0.28, 0)
          b.scatter(9, r * 0.5, (x, y) => {
            const turn = b.rng() * TAU
            b.oval(x, y, 46, 13, turn, '#5a9438')
            b.oval(x, y, 34, 5, turn, '#8cc266', 0.8)
          }, r * 0.28, 0)
        }, 3)
        b.scatter(6, r * 0.5, (x, y) => basil(b, x, y, 52, b.rng() * TAU), r * 0.2, 0)
        b.scatter(10, r * 0.6, (x, y) => b.ring(x, y, b.rng.between(5, 9), 2.5, '#d94a32', 0.9), r * 0.2, 0)
      })
    },
  },

  chili: {
    cutlery: 'spoon',
    side: (b) => breadSlices(b, 0, 0, deg(20), 2),
    paint: (b) => {
      bowl(b, 310, '#3d5a73', (r) => {
        b.circle(0, 0, r, '#8a2e1e')
        b.scatter(26, r, (x, y) => b.blob(x, y, b.rng.between(24, 60), b.rng.pick(['#a03a24', '#742417', '#b24a2c']), { wobble: 0.3, alpha: 0.7 }))
        b.specks(200, r * 0.95, ['#5f2a1a', '#7a3a22', '#4a1f14'], 7)
        b.lifted(() => {
          b.scatter(26, r * 0.9, (x, y) => {
            const turn = b.rng() * TAU
            b.oval(x, y, 24, 14, turn, '#5c1620')
            b.oval(x - 3, y - 3, 12, 5, turn, '#9a3040', 0.8)
          })
          b.scatter(34, r * 0.9, (x, y) => b.box(x, y, 14, 12, 5, b.rng() * TAU, b.rng.pick(['#f2c230', '#f6d254'])))
          b.cubes(12, r * 0.85, 20, ['#c4402c', '#d85a3c'])
        }, 2.5)
        // Sour cream and something green.
        b.lifted(() => b.blob(10, -6, 74, '#f3ece0', { wobble: 0.2, points: 9 }), 5)
        b.blob(4, -12, 56, '#fffdf7', { wobble: 0.22, points: 9 })
        swirl(b, 40, '#eee4d2', 6, 0.8)
        b.herbs(26, r * 0.8, CHIVE, 13)
      })
    },
  },

  burger: {
    cutlery: 'none',
    side: (b) => sideBowl(b, 0, 0, 82, CREAM, '#c5311f'),
    paint: (b) => {
      plate(b, 345, { well: 0.78 })
      // Oven fries.
      b.lifted(() => {
        b.scatter(30, 105, (x, y) => {
          const turn = b.rng() * TAU
          const length = b.rng.between(80, 130)
          b.box(x, y * 1.5, length, 20, 7, turn, '#d99a2e')
          b.box(x, y * 1.5 - 2, length - 10, 11, 5, turn, '#f4cf62')
        }, 148, 20)
      }, 3.5)
      b.specks(26, 120, ['#c8414b', '#a8332f'], 2.2, 148, 20, 0.7)
      // The burger: lettuce and cheese peek out under the bun.
      const [x, y] = [-90, 0]
      b.lifted(() => {
        b.around(13, 142, (px, py) => b.blob(px, py, b.rng.between(34, 50), b.rng.pick(['#7fb04a', '#94c25c', '#6a9a3c']), { wobble: 0.3 }), x, y, 0.2)
      }, 4)
      b.lifted(() => b.box(x + 12, y + 6, 240, 240, 18, deg(b.rng.between(20, 70)), '#f2b830'), 3)
      b.lifted(() => b.circle(x + b.rng.between(-10, 10), y + 60, 96, '#d9412e'), 2)
      b.lifted(() => b.blob(x, y, 150, '#b06a22', { wobble: 0.03, points: 20 }), 8, 0.34)
      b.blob(x - 4, y - 5, 142, '#d2892e', { wobble: 0.03, points: 20 })
      b.blob(x - 16, y - 18, 110, '#e3a544', { wobble: 0.08 })
      b.blob(x - 34, y - 38, 56, '#f1c36c', { wobble: 0.2, alpha: 0.8 })
      b.scatter(34, 118, (sx, sy) => {
        const turn = b.rng() * TAU
        b.oval(sx + 1.5, sy + 2, 8, 4.5, turn, '#8f5418', 0.5)
        b.oval(sx, sy, 8, 4.5, turn, '#fbeccb')
      }, x - 4, y - 5)
    },
  },

  salmon: {
    cutlery: 'knife-fork',
    paint: (b) => {
      plate(b, 335, { band: '#a9d4e8' })
      b.scatter(7, 70, (x, y) => potato(b, x, y * 1.6, b.rng.between(40, 52)), -118, 10)
      greenBeans(b, 60, 132, deg(b.rng.between(-14, 6)), 9, 220)
      // The fillet.
      b.at(60, -40, deg(b.rng.between(-22, -8)), () => {
        b.lifted(() => b.box(0, 0, 270, 124, 46, 0, '#d0634a'), 7, 0.3)
        b.box(-3, -4, 260, 112, 42, 0, '#f08f72')
        for (let i = -4; i <= 4; i++) {
          b.line(
            [
              [i * 28 - 10, -50],
              [i * 28 + 6, 0],
              [i * 28 - 10, 50],
            ],
            5,
            '#f9c0aa',
            0.85,
          )
        }
        b.box(-3, -48, 230, 12, 6, 0, '#fbd3c2', 0.6)
        b.specks(24, 50, PEPPER, 2.2, 0, 0, 0.7)
        for (let i = 0; i < 5; i++) b.leaf(b.rng.between(-90, 70), b.rng.between(-30, 30), b.rng.between(34, 54), b.rng() * TAU, '#5f8f4a', undefined, 0.16)
      })
      lemonSlice(b, -40, -150, 50)
      lemonSlice(b, 20, -176, 46)
      b.herbs(14, 190, '#5f8f4a', 12)
    },
  },


  roastchicken: {
    cutlery: 'none',
    reach: 405,
    paint: (b) => {
      // The whole bird in its roasting tin, on a bed of potatoes, carrots and onions.
      b.at(0, 0, deg(b.rng.between(-6, 6)), () => {
        ovenDish(b, 700, 540, '#3f5f7a', (w, h) => {
          b.box(0, 0, w + 20, h + 20, 0, 0, '#b88a48')
          b.scatter(16, w / 2, (x, y) => b.blob(x, y * (h / w), b.rng.between(40, 90), b.rng.pick(['#c99a54', '#a87838', '#d2a964']), { wobble: 0.3, alpha: 0.7 }))
          b.around(13, 1, (_x, _y, angle) => potato(b, Math.cos(angle) * (w / 2 - 66), Math.sin(angle) * (h / 2 - 60), b.rng.between(40, 52)), 0, 0, 0.3)
          b.lifted(() => {
            b.around(9, 1, (_x, _y, angle) => {
              const turn = b.rng() * TAU
              const [x, y] = [Math.cos(angle) * (w / 2 - 80), Math.sin(angle) * (h / 2 - 76)]
              b.box(x, y, b.rng.between(84, 116), 30, 14, turn, '#d9702a')
              b.box(x, y - 3, 62, 9, 5, turn, '#f09a4a', 0.8)
            }, 0, 0, 0.5)
            b.around(6, 1, (_x, _y, angle) => {
              const [x, y] = [Math.cos(angle) * (w / 2 - 110), Math.sin(angle) * (h / 2 - 90)]
              const turn = b.rng() * TAU
              b.leaf(x, y, 84, turn, '#8a4a70', '#e9c7d4', 0.5)
              b.leaf(x, y, 62, turn + 0.2, '#b06a94', undefined, 0.3)
            }, 0, 0, 0.6)
          }, 4)
          // Legs first, then the body over them, then the wings.
          const leg = (side: number): void => {
            b.at(side * 104, 92, deg(90 - side * 34), () => {
              b.lifted(() => {
                b.box(104, 0, 70, 20, 10, 0, '#f1e6cf')
                b.circle(140, 0, 15, '#f1e6cf')
                b.oval(20, 0, 92, 54, 0, '#a85f1e')
              }, 6, 0.3)
              b.oval(16, -4, 82, 45, 0, '#cf8a32')
              b.oval(8, -10, 54, 24, 0, '#e6ad50', 0.9)
            })
          }
          leg(-1)
          leg(1)
          b.lifted(() => b.blob(0, -20, 168, '#a85f1e', { wobble: 0.04, squash: 0.8, points: 16, turn: Math.PI / 2 }), 9, 0.34)
          b.blob(-4, -26, 154, '#cb8530', { wobble: 0.04, squash: 0.8, points: 16, turn: Math.PI / 2 })
          b.blob(-12, -40, 112, '#e0a548', { wobble: 0.08, squash: 0.8, turn: Math.PI / 2 })
          b.blob(-24, -56, 60, '#f0c56e', { wobble: 0.14, squash: 0.8, alpha: 0.85, turn: Math.PI / 2 })
          b.line(
            [
              [0, -150],
              [4, -40],
              [0, 60],
            ],
            5,
            '#a85f1e',
            0.5,
          )
          for (const side of [-1, 1]) {
            b.at(side * 128, -70, deg(90 + side * 24), () => {
              b.lifted(() => b.oval(0, 0, 66, 30, 0, '#a85f1e'), 4)
              b.oval(-2, -3, 56, 22, 0, '#d2902f')
            })
          }
          browned(b, 14, 120, ['#8f4d18', '#7a3f14', '#b06a22'], 12, 0, -20)
          b.specks(40, 150, PEPPER, 2.4, 0, -20, 0.6)
          // Thyme and a roasted lemon half.
          for (let i = 0; i < 5; i++) b.at(b.rng.between(-120, 120), b.rng.between(-130, 80), b.rng() * TAU, () => {
            b.line([[0, 0], [50, 4]], 3, '#55703a')
            for (let k = 0; k < 5; k++) b.leaf(8 + k * 9, 2, 12, deg(k % 2 ? 60 : -60), '#6f8f58')
          })
          lemonSlice(b, -w / 2 + 96, h / 2 - 84, 50)
        })
      })
    },
  },

  tomatosoup: {
    cutlery: 'spoon',
    side: (b) => {
      // Cheese toast, cut into fingers.
      for (let i = 0; i < 3; i++) {
        b.at(i * 22 - 20, i * 62 - 60, deg(-14 + i * 5), () => {
          b.lifted(() => b.box(0, 0, 210, 54, 12, 0, '#b97a34'), 4)
          b.box(0, -2, 200, 44, 10, 0, '#e2ab52')
          b.box(0, 14, 196, 8, 4, 0, '#f6dc7e')
          for (let k = -2; k <= 2; k++) b.box(k * 36, -3, 6, 40, 3, deg(20), '#a8641f', 0.6)
        })
      }
    },
    paint: (b) => {
      bowl(b, 310, '#fffdf9', (r) => {
        b.circle(0, 0, r, '#d9492a')
        b.blob(-16, -16, r * 0.82, '#e65f38', { wobble: 0.14, alpha: 0.85 })
        swirl(b, r * 0.62, '#fbe6d6', 13, 0.9)
        swirl(b, r * 0.5, '#fff6ee', 5, 0.9)
        basil(b, 20, -10, 78, deg(-40))
        basil(b, 6, 10, 62, deg(40))
        b.specks(50, r * 0.9, PEPPER, 2.4, 0, 0, 0.7)
        b.scatter(7, r * 0.8, (x, y) => b.circle(x, y, b.rng.between(4, 8), '#f6a878', 0.7))
      })
    },
  },

  kuerbissuppe: {
    cutlery: 'spoon',
    paint: (b) => {
      bowl(b, 310, '#f1ebe0', (r) => {
        b.circle(0, 0, r, '#e88a1e')
        b.blob(-16, -16, r * 0.84, '#f39c2c', { wobble: 0.12, alpha: 0.9 })
        swirl(b, r * 0.66, '#fdebcf', 12, 0.9)
        // Pumpkin seed oil: dark green beads.
        b.scatter(14, r * 0.72, (x, y) => {
          const size = b.rng.between(7, 18)
          b.circle(x, y, size, '#35491c', 0.9)
          b.circle(x - size * 0.25, y - size * 0.25, size * 0.35, '#7d9a3c', 0.9)
        })
        b.lifted(() => {
          b.scatter(20, r * 0.5, (x, y) => {
            const turn = b.rng() * TAU
            b.leaf(x, y, 34, turn, '#55703a', '#8aa860', 0.6)
          }, 20, 10)
        }, 2.5)
        b.specks(36, r * 0.9, PEPPER, 2.2, 0, 0, 0.6)
      })
    },
  },

  gurkensalat: {
    cutlery: 'fork',
    paint: (b) => {
      bowl(b, 300, '#dcebf2', (r) => {
        b.circle(0, 0, r, '#eef3e2')
        b.lifted(() => {
          b.scatter(46, r * 0.86, (x, y) => {
            const size = b.rng.between(38, 48)
            b.circle(x, y, size, '#5c8a44')
            b.circle(x, y, size - 6, '#d3e6a8')
            b.circle(x, y, size * 0.5, '#e6f1c6')
            b.around(6, size * 0.3, (sx, sy) => b.oval(sx, sy, 6, 3, b.rng() * TAU, '#f6f6dc'), x, y, 0.1)
          })
        }, 2.5, 0.22)
        b.scatter(10, r * 0.7, (x, y) => b.blob(x, y, b.rng.between(18, 34), '#fffdf7', { wobble: 0.4, alpha: 0.75 }))
        // Dill.
        b.scatter(22, r * 0.8, (x, y) => {
          const turn = b.rng() * TAU
          for (let i = -2; i <= 2; i++) b.leaf(x, y, 34, turn + i * 0.28, '#3f7a3c', undefined, 0.08)
        })
        b.specks(40, r * 0.85, PEPPER, 2, 0, 0, 0.6)
      })
    },
  },

  birchermuesli: {
    cutlery: 'spoon',
    paint: (b) => {
      bowl(b, 300, '#f6d5dc', (r) => {
        b.circle(0, 0, r, '#efe2c8')
        b.scatter(26, r, (x, y) => b.blob(x, y, b.rng.between(26, 58), b.rng.pick(['#f6edd8', '#e6d4b0', '#f1e2c4']), { wobble: 0.3, alpha: 0.8 }))
        b.specks(170, r * 0.94, ['#cdb388', '#b99b6c', '#e0cba4'], 5)
        // Apple with its red skin, berries, hazelnuts, a thread of honey.
        b.lifted(() => {
          for (let i = 0; i < 5; i++) {
            b.at(-r * 0.36 + i * 22, -r * 0.26 + i * 30, deg(-30 + i * 9), () => {
              b.leaf(-60, 0, 120, 0, '#c8414b', undefined, 0.36)
              b.leaf(-54, 3, 108, 0, '#fbf3d6', undefined, 0.26)
            })
          }
        }, 3)
        b.scatter(13, r * 0.42, (x, y) => blueberry(b, x, y, b.rng.between(13, 17)), r * 0.3, -r * 0.3)
        b.scatter(7, r * 0.36, (x, y) => raspberry(b, x, y, b.rng.between(19, 24)), r * 0.26, r * 0.36)
        b.lifted(() => b.cubes(12, r * 0.4, 18, ['#a8703c', '#8f5a2c', '#c08a52'], -r * 0.2, r * 0.44), 2.5)
        swirl(b, r * 0.5, '#e2a22c', 5, 0.7)
      })
    },
  },

  zopf: {
    cutlery: 'none',
    reach: 430,
    side: (b) => {
      // Butter and jam.
      sideBowl(b, -70, 0, 74, CREAM, '#b3243c')
      b.at(96, 20, deg(12), () => {
        b.box(6, 9, 130, 96, 14, 0, '#3b2620', 0.12)
        b.box(0, 0, 130, 96, 14, 0, '#fffdf9')
        b.lifted(() => b.box(0, 0, 86, 56, 8, 0, '#f1d568'), 3)
        b.box(-6, -6, 60, 24, 6, 0, '#fae690', 0.8)
      })
    },
    paint: (b) => {
      board(b, 800, 440, deg(b.rng.between(-8, 8)))
      b.at(0, 0, deg(b.rng.between(-8, 8)), () => {
        // The braid: plump knots, alternating left and right.
        b.lifted(() => b.blob(0, 0, 150, '#8f4f16', { wobble: 0.04, squash: 0.44, points: 18, turn: 0 }), 10, 0.34)
        const knots = 8
        for (let i = 0; i < knots; i++) {
          const along = -262 + (i / (knots - 1)) * 524
          const slim = 1 - Math.abs(i - (knots - 1) / 2) / knots
          const size = 66 + slim * 46
          const side = i % 2 ? 1 : -1
          b.at(along, side * 22 * slim, deg(side * 38), () => {
            b.lifted(() => b.oval(0, 0, size, size * 0.6, 0, '#a8601c'), 4, 0.3)
            b.oval(-3, -4, size * 0.94, size * 0.53, 0, '#c9812a')
            b.oval(-8, -9, size * 0.74, size * 0.37, 0, '#dea042')
            b.oval(-14, -14, size * 0.44, size * 0.17, 0, '#f2c66e', 0.85)
            b.oval(-18, -17, size * 0.22, size * 0.06, 0, '#fbe4a6', 0.8)
          })
        }
      })
      // Two slices, already cut.
      for (const [x, y, turn] of [
        [262, 128, 24],
        [318, 96, 44],
      ] as const) {
        b.at(x, y, deg(turn), () => {
          b.lifted(() => b.oval(0, 0, 68, 52, 0, '#b8742a'), 4)
          b.oval(0, 0, 60, 44, 0, '#fbeccb')
          b.specks(16, 40, ['#f1dcae', '#fff7e2'], 4)
        })
      }
      b.specks(26, 60, ['#dba85a', '#f1dcae'], 3.5, 240, 30)
    },
  },


  pancakes: {
    cutlery: 'knife-fork',
    paint: (b) => {
      plate(b, 335, { band: '#a9d4e8' })
      // A stack, each one a little off the one below.
      let [x, y] = [0, 0]
      for (let i = 0; i < 4; i++) {
        x = b.rng.between(-16, 16) + (3 - i) * 5
        y = b.rng.between(-12, 12) + (3 - i) * 7
        const size = 180 - i * 5
        b.lifted(() => b.blob(x, y, size, '#b9742a', { wobble: 0.035, points: 20 }), 6, 0.32)
        b.blob(x - 2, y - 3, size - 10, '#d99644', { wobble: 0.04, points: 20 })
        b.blob(x - 4, y - 6, size - 32, '#e9b25e', { wobble: 0.06, points: 16 })
      }
      browned(b, 12, 110, ['#c98434', '#d99644'], 20, x, y)
      // Maple syrup: a glossy pool on top and two slow drips over the edge.
      const start = b.rng() * TAU
      for (const [turn, reach] of [
        [0.4, 150],
        [2.6, 128],
      ] as const) {
        const angle = start + turn
        const bend = b.rng.between(-0.3, 0.3)
        const end: Point = [x + Math.cos(angle + bend) * reach, y + Math.sin(angle + bend) * reach]
        const river: Point[] = [[x + Math.cos(angle) * 60, y + Math.sin(angle) * 60], [x + Math.cos(angle + bend * 0.3) * 120, y + Math.sin(angle + bend * 0.3) * 120], end]
        b.line(river, 17, '#8f4710', 0.85)
        b.line(river, 9, '#b9651a', 0.9)
        b.blob(end[0], end[1], 19, '#8f4710', { wobble: 0.25, alpha: 0.85 })
        b.blob(end[0], end[1], 12, '#b9651a', { wobble: 0.25, alpha: 0.9 })
        b.circle(end[0] - 4, end[1] - 4, 3.5, '#f1c27a', 0.8)
      }
      b.blob(x + 4, y + 4, 104, '#8f4710', { wobble: 0.22, points: 10, alpha: 0.88 })
      b.blob(x, y, 90, '#b9651a', { wobble: 0.22, points: 10, alpha: 0.9 })
      b.blob(x - 12, y - 12, 54, '#d0842c', { wobble: 0.3, alpha: 0.6 })
      b.lifted(() => b.box(x - 4, y - 6, 70, 62, 11, deg(b.rng.between(-20, 20)), '#f2d568'), 4)
      b.box(x - 10, y - 13, 40, 26, 7, 0, '#fbeb9a', 0.8)
      b.shine(x, y, 74, 190, 250, 8, 0.45)
      b.scatter(9, 62, (bx, by) => blueberry(b, bx, by, b.rng.between(14, 18)), 180, 130)
      b.scatter(5, 54, (bx, by) => raspberry(b, bx, by, b.rng.between(20, 25)), -185, -130)
      b.scatter(3, 40, (bx, by) => blueberry(b, bx, by, 15), x + 70, y - 80)
    },
  },

  shakshuka: {
    cutlery: 'none',
    reach: 370,
    side: (b) => breadSlices(b, 0, 0, deg(-15), 3),
    paint: (b) => {
      pan(b, 320, (r) => {
        b.circle(0, 0, r, '#b3301c')
        b.scatter(26, r, (x, y) => b.blob(x, y, b.rng.between(30, 70), b.rng.pick(['#c8412a', '#9f2616', '#d9573a']), { wobble: 0.3, alpha: 0.75 }))
        b.scatter(14, r * 0.9, (x, y) => b.box(x, y, b.rng.between(60, 100), 16, 8, b.rng() * TAU, b.rng.pick(['#d9573a', '#8f2014', '#e9b08a']), 0.8))
        b.around(4, r * 0.48, (x, y) => friedEgg(b, x, y, b.rng.between(74, 86)), 0, 0, 0.25)
        b.lifted(() => b.cubes(16, r * 0.84, 22, ['#fffdf7', '#f3ece0']), 2.5)
        b.herbs(44, r * 0.88, PARSLEY, 15)
        b.specks(50, r * 0.9, ['#6a2a14', '#3b2620'], 2.6, 0, 0, 0.7)
      })
    },
  },

  tiramisu: {
    cutlery: 'dessert',
    paint: (b) => {
      plate(b, 290, { band: '#d98c9a', well: 0.72 })
      b.specks(70, 190, ['#5a3826', '#6e4630'], 2.6, 0, 0, 0.5)
      b.at(0, 0, deg(b.rng.between(-25, 25)), () => {
        // A square piece: cream at the sides, cocoa on top.
        b.lifted(() => b.box(0, 0, 250, 220, 20, 0, '#e9d9b8'), 8, 0.32)
        b.box(0, 0, 250, 220, 20, 0, '#f6ecd4')
        b.box(0, 60, 250, 22, 6, 0, '#b98a5a', 0.75)
        b.box(0, 84, 250, 14, 6, 0, '#e9d9b8')
        b.box(-4, -14, 236, 180, 16, 0, '#553222')
        b.c.save()
        b.c.beginPath()
        b.c.roundRect(-122, -104, 236, 180, 16)
        b.c.clip()
        // Cocoa, sifted on thick.
        b.scatter(14, 150, (x, y) => b.blob(x, y, b.rng.between(24, 50), b.rng.pick(['#64402c', '#4a2a1c']), { wobble: 0.4, alpha: 0.35 }), -4, -14)
        b.specks(900, 170, ['#6e4630', '#44261a', '#7d5238', '#3a2016'], 1.9, -4, -14, 0.85)
        b.c.restore()
        // A spoonful of mascarpone on the corner.
        b.lifted(() => b.blob(74, -62, 34, '#f1e6d0', { wobble: 0.2, points: 8 }), 4)
        b.blob(71, -65, 26, '#fffaf0', { wobble: 0.2, points: 8 })
        b.lifted(() => b.oval(74, -64, 11, 7, deg(30), '#4a2a1c'), 2)
      })
      // A coffee bean or two.
      for (const [x, y] of [
        [-170, 120],
        [-140, 150],
      ] as const) {
        b.lifted(() => b.oval(x, y, 15, 10, deg(30), '#4a2a1c'), 2.5)
        b.line(
          [
            [x - 9, y - 5],
            [x + 9, y + 5],
          ],
          2,
          '#2a1710',
        )
      }
    },
  },

  rueblitorte: {
    cutlery: 'dessert',
    paint: (b) => {
      plate(b, 290, { china: '#f4cdd6', well: 0.72 })
      const spread = deg(52)
      b.at(-150, 60, deg(b.rng.between(-28, -12)), () => {
        // The cut side shows the crumb, the top is white lemon glaze.
        b.lifted(() => {
          wedgePath(b, 330, spread)
          b.c.fillStyle = '#b8742a'
          b.c.fill()
        }, 8, 0.32)
        b.at(0, 22, 0, () => {
          wedgePath(b, 326, spread)
          b.c.fillStyle = '#d99644'
          b.c.fill()
          b.c.save()
          wedgePath(b, 326, spread)
          b.c.clip()
          b.specks(120, 330, ['#e9772a', '#c9832c', '#f1b05a', '#a8641f'], 5, 160, 0)
          b.c.restore()
        })
        wedgePath(b, 326, spread)
        b.c.fillStyle = '#fffaf0'
        b.c.fill()
        b.at(0, -4, 0, () => {
          wedgePath(b, 300, spread * 0.82)
          b.c.fillStyle = '#ffffff'
          b.c.globalAlpha = 0.7
          b.c.fill()
          b.c.globalAlpha = 1
        })
        b.arc(0, 0, 320, -spread / 2 + 0.03, spread / 2 - 0.03, 12, '#c9832c', 0.9)
        // The marzipan carrot.
        b.at(250, 0, deg(180), () => {
          b.lifted(() => {
            b.leaf(0, 0, 70, 0, '#f08a24', undefined, 0.3)
          }, 3)
          for (let i = 1; i < 4; i++) b.box(i * 14, 0, 2.5, 14 - i * 2, 1, 0, '#c96a14', 0.7)
          b.leaf(0, 0, 24, deg(150), '#5f9a3c')
          b.leaf(0, 0, 24, deg(200), '#6fae48')
        })
      })
      b.specks(30, 60, ['#d99644', '#fffaf0'], 3.5, 110, 150)
    },
  },

  zwetschgenwaehe: {
    cutlery: 'dessert',
    paint: (b) => {
      plate(b, 290, { band: '#b9a3d9', well: 0.72 })
      const spread = deg(58)
      b.at(-160, 50, deg(b.rng.between(-26, -10)), () => {
        b.lifted(() => {
          wedgePath(b, 340, spread)
          b.c.fillStyle = '#b98342'
          b.c.fill()
        }, 7, 0.32)
        wedgePath(b, 334, spread)
        b.c.fillStyle = '#e2b667'
        b.c.fill()
        b.c.save()
        wedgePath(b, 306, spread * 0.94)
        b.c.clip()
        b.c.fillStyle = '#f3dc96'
        b.c.fillRect(0, -200, 340, 400)
        // Plum halves, cut side up, in rows.
        for (const [reach, count] of [
          [262, 5],
          [192, 4],
          [126, 3],
          [66, 1],
        ] as const) {
          for (let i = 0; i < count; i++) {
            const angle = count === 1 ? 0 : -spread / 2 + 0.1 + (i / (count - 1)) * (spread - 0.2)
            const x = Math.cos(angle) * reach
            const y = Math.sin(angle) * reach
            b.at(x, y, angle + b.rng.between(-0.3, 0.3), () => {
              b.oval(2, 3, 37, 29, 0, '#3b2620', 0.2)
              b.oval(0, 0, 36, 28, 0, '#5a2348')
              b.oval(-1, -1, 29, 21, 0, '#b0406a')
              b.oval(-2, -2, 21, 14, 0, '#e08a5a')
              b.oval(-2, -2, 11, 6, 0, '#f3c66e')
              b.oval(-8, -8, 9, 3, deg(-20), '#ffffff', 0.4)
            })
          }
        }
        b.specks(70, 330, ['#8f5a2a', '#c9a06a'], 2.4, 160, 0, 0.6)
        b.c.restore()
        b.arc(0, 0, 322, -spread / 2 + 0.02, spread / 2 - 0.02, 22, '#d49a4a')
        b.arc(0, 0, 328, -spread / 2 + 0.04, spread / 2 - 0.04, 7, '#f1cf8a', 0.8)
      })
      b.specks(26, 70, ['#e2b667', '#8f5a2a'], 3, 110, 150, 0.8)
    },
  },

  schoggimousse: {
    cutlery: 'spoon',
    paint: (b) => {
      plate(b, 250, { band: '#d98c9a', well: 0.7 })
      glass(b, 0, 0, 176, (r) => {
        b.circle(0, 0, r, '#3f241a')
        b.blob(-10, -10, r * 0.84, '#5a3524', { wobble: 0.14 })
        swirl(b, r * 0.8, '#6f4530', 12, 0.7)
        b.scatter(12, r * 0.8, (x, y) => b.circle(x, y, b.rng.between(3, 7), '#2c1810', 0.7))
        // A cloud of cream, a raspberry, chocolate curls.
        b.lifted(() => b.blob(10, 4, 60, '#f3ece0', { wobble: 0.2, points: 9 }), 5)
        b.blob(6, 0, 48, '#fffdf7', { wobble: 0.2, points: 9 })
        swirl(b, 34, '#eee4d2', 5, 0.8)
        raspberry(b, 16, -8, 22)
        b.lifted(() => {
          b.scatter(9, r * 0.7, (x, y) => {
            const from = b.rng() * TAU
            b.arc(x, y, b.rng.between(8, 16), from, from + b.rng.between(2, 4), 6, '#2c1810')
          })
        }, 2)
        b.leaf(-28, 24, 34, deg(150), '#5f9a3c', '#3f7a2c', 0.5)
      })
    },
  },

  heisseschoggi: {
    cutlery: 'none',
    paint: (b) => {
      cup(b, 215, '#f6d5dc', (r) => {
        b.circle(0, 0, r, '#6a3d28')
        b.blob(-10, -10, r * 0.86, '#7d4a30', { wobble: 0.12 })
        b.ring(0, 0, r - 12, 10, '#a8744c', 0.6)
        // Whipped cream with cocoa and cinnamon.
        b.lifted(() => b.blob(0, 0, r * 0.62, '#f1e8d8', { wobble: 0.12, points: 12 }), 6)
        b.blob(-5, -5, r * 0.54, '#fffdf7', { wobble: 0.14, points: 12 })
        swirl(b, r * 0.5, '#e9dcc6', 9, 0.9)
        b.specks(90, r * 0.56, ['#6a3d28', '#8f5a3a', '#a8642a'], 3)
        b.lifted(() => {
          b.scatter(7, r * 0.4, (x, y) => {
            const from = b.rng() * TAU
            b.arc(x, y, b.rng.between(8, 14), from, from + 3, 5, '#3f241a')
          })
        }, 2)
      })
      // A piece of chocolate on the saucer.
      b.at(-250, 170, deg(-30), () => {
        b.lifted(() => b.box(0, 0, 90, 56, 8, 0, '#4a2a1c'), 4)
        b.box(-22, 0, 36, 44, 5, 0, '#5f3828')
        b.box(22, 0, 36, 44, 5, 0, '#5f3828')
      })
    },
  },

  eistee: {
    cutlery: 'none',
    reach: 410,
    paint: (b) => {
      const drink = (x: number, y: number, r: number): void => {
        glass(b, x, y, r, (inner) => {
          b.circle(0, 0, inner, '#a8540f')
          b.blob(-8, -8, inner * 0.88, '#c9742a', { wobble: 0.1 })
          b.blob(-20, -20, inner * 0.5, '#de9440', { wobble: 0.3, alpha: 0.6 })
          // Ice, lemon and mint.
          b.scatter(5, inner * 0.62, (ix, iy) => {
            const turn = b.rng() * TAU
            b.box(ix, iy, 70, 64, 15, turn, '#ffffff', 0.3)
            b.box(ix - 4, iy - 4, 54, 48, 12, turn, '#fff4e0', 0.38)
            b.box(ix - 12, iy - 12, 22, 10, 5, turn, '#ffffff', 0.7)
          })
          lemonSlice(b, b.rng.between(-34, 34), b.rng.between(-34, 34), inner * 0.46)
          for (let i = 0; i < 4; i++) b.leaf(inner * 0.2, inner * 0.3, inner * 0.46, deg(20 + i * 50), i % 2 ? '#4f9a44' : '#6ab45a', '#2f6a2c', 0.5)
        })
        // A striped paper straw, leaning out of the glass.
        const straw: Point[] = [
          [x - r * 0.25, y - r * 0.15],
          [x - r * 1.25, y - r * 1.15],
        ]
        b.line(straw, 20, '#3b2620', 0.1)
        b.line(straw, 16, '#fffdf9')
        b.c.setLineDash([18, 18])
        b.c.lineDashOffset = 4
        b.line(straw, 16, '#d98c9a')
        b.c.setLineDash([])
      }
      // A tray with two glasses.
      b.at(0, 0, deg(b.rng.between(-10, 10)), () => {
        board(b, 780, 470)
        drink(-175, 20, 158)
        drink(180, 30, 158)
        lemonSlice(b, 10, -150, 46)
        b.lifted(() => {
          b.leaf(-10, 160, 64, deg(-20), '#4f9a44', '#2f6a2c', 0.5)
          b.leaf(0, 160, 58, deg(40), '#6ab45a', '#2f6a2c', 0.5)
        }, 2.5)
      })
    },
  },

}
