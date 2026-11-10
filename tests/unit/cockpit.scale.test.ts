import { describe, expect, it } from 'vitest'
import {
  areaShare,
  bucketDays,
  bucketMeans,
  bucketStart,
  calendarWeeks,
  chooseBucket,
  dayRange,
  hashUnit,
  jitter,
  linePath,
  linear,
  monthStarts,
  nearest,
  niceStep,
  niceTicks,
  polar,
  ringSlice,
  swarm,
  thin,
} from '../../src/features/cockpit/charts/scale'

describe('scales', () => {
  it('maps a domain onto pixels in a straight line', () => {
    const y = linear([1, 5], [100, 0])
    expect(y(1)).toBe(100)
    expect(y(5)).toBe(0)
    expect(y(3)).toBe(50)
  })

  it('puts a domain without width in the middle', () => {
    expect(linear([0, 0], [20, 120])(0)).toBe(70)
  })
})

describe('ticks', () => {
  it('rounds a step up to 1, 2, 2.5 or 5 times a power of ten', () => {
    expect(niceStep(1967)).toBe(2000)
    expect(niceStep(240)).toBe(250)
    expect(niceStep(3)).toBe(5)
    expect(niceStep(0.07)).toBe(0.1)
    expect(niceStep(0)).toBe(1)
  })

  it('covers the maximum with round ticks from zero', () => {
    expect(niceTicks(7870)).toEqual([0, 2000, 4000, 6000, 8000])
    expect(niceTicks(1190)).toEqual([0, 500, 1000, 1500])
    expect(niceTicks(2440)).toEqual([0, 1000, 2000, 3000])
    expect(niceTicks(115)).toEqual([0, 50, 100, 150])
  })

  it('never goes past the next tick when the maximum is already round', () => {
    expect(niceTicks(8000)).toEqual([0, 2000, 4000, 6000, 8000])
  })

  it('keeps counts whole', () => {
    expect(niceTicks(3, 3, true)).toEqual([0, 1, 2, 3])
    expect(niceTicks(1, 3, true)).toEqual([0, 1])
    expect(niceTicks(27, 3, true)).toEqual([0, 10, 20, 30])
  })

  it('still gives an axis when there is nothing to show', () => {
    expect(niceTicks(0)).toEqual([0, 1])
  })
})

describe('jitter', () => {
  it('is the same every time for the same key', () => {
    expect(hashUnit('serving-1')).toBe(hashUnit('serving-1'))
    expect(hashUnit('serving-1')).not.toBe(hashUnit('serving-2'))
  })

  it('stays within its bounds', () => {
    for (const key of ['a', 'b', 'c', 'serving-42', 'ä']) {
      expect(hashUnit(key)).toBeGreaterThanOrEqual(0)
      expect(hashUnit(key)).toBeLessThan(1)
      expect(Math.abs(jitter(key, 0.3))).toBeLessThanOrEqual(0.3)
    }
  })
})

describe('swarm', () => {
  const crowd = ['d', 'a', 'c', 'b'].map((key) => ({ key, x: 5, y: 5 }))

  it('leaves a lonely point exactly on its spot', () => {
    expect(swarm([{ key: 'only', x: 2, y: 3 }], 5)).toEqual([{ key: 'only', x: 2, y: 3, dx: 0, dy: 0 }])
  })

  it('fans points that share a spot out around it, further with every point', () => {
    const placed = swarm(crowd, 5)
    const byKey = Object.fromEntries(placed.map((p) => [p.key, Math.hypot(p.dx, p.dy)]))
    expect(byKey.a).toBe(0)
    expect(byKey.b).toBeCloseTo(5)
    expect(byKey.c).toBeCloseTo(5 * Math.sqrt(2))
    expect(byKey.d).toBeCloseTo(5 * Math.sqrt(3))
  })

  it('gives every point its own place, whatever order they arrive in', () => {
    const placed = swarm(crowd, 5)
    expect(new Set(placed.map((p) => `${p.dx.toFixed(3)}|${p.dy.toFixed(3)}`)).size).toBe(4)
    const again = swarm([...crowd].reverse(), 5)
    for (const point of placed) expect(again.find((p) => p.key === point.key)).toEqual(point)
  })

  it('keeps separate spots separate', () => {
    const placed = swarm(
      [
        { key: 'a', x: 1, y: 1 },
        { key: 'b', x: 2, y: 1 },
      ],
      5,
    )
    expect(placed.every((p) => p.dx === 0 && p.dy === 0)).toBe(true)
  })
})

describe('geometry', () => {
  it('counts turns clockwise from twelve o clock', () => {
    const [topX, topY] = polar(100, 100, 50, 0)
    expect(topX).toBeCloseTo(100)
    expect(topY).toBeCloseTo(50)
    const [rightX, rightY] = polar(100, 100, 50, 0.25)
    expect(rightX).toBeCloseTo(150)
    expect(rightY).toBeCloseTo(100)
    const [bottomX, bottomY] = polar(100, 100, 50, 0.5)
    expect(bottomX).toBeCloseTo(100)
    expect(bottomY).toBeCloseTo(150)
  })

  it('draws a ring slice with an outer and an inner arc', () => {
    const quarter = ringSlice(100, 100, 50, 30, 0, 0.25)
    expect(quarter).toBe('M100 50A50 50 0 0 1 150 100L130 100A30 30 0 0 0 100 70Z')
  })

  it('uses the long way round for more than half a ring', () => {
    expect(ringSlice(100, 100, 50, 30, 0, 0.75)).toContain('A50 50 0 1 1')
  })

  it('can draw a whole ring without collapsing to nothing', () => {
    const whole = ringSlice(100, 100, 50, 30, 0, 1)
    expect(whole).toContain('A50 50 0 1 1')
    expect(whole).not.toBe(ringSlice(100, 100, 50, 30, 0, 0))
  })

  it('joins points into a path', () => {
    expect(
      linePath([
        [0, 10],
        [5.126, 2],
        [10, 0],
      ]),
    ).toBe('M0 10L5.13 2L10 0')
  })

  it('finds the nearest point, on one axis or both', () => {
    const points = [
      { x: 10, y: 10 },
      { x: 20, y: 90 },
      { x: 60, y: 12 },
    ]
    expect(nearest(points, 22, 14)).toBe(0)
    expect(nearest(points, 22, 14, { axis: 'x' })).toBe(1)
    expect(nearest(points, 500, 500, { reach: 30 })).toBeNull()
    expect(nearest([], 1, 1)).toBeNull()
  })

  it('sizes a mark so that its area follows the count', () => {
    expect(areaShare(0, 8)).toBe(0)
    expect(areaShare(8, 8)).toBe(1)
    expect(areaShare(2, 8)).toBe(0.5)
  })
})

describe('time buckets', () => {
  it('uses days for a short stretch, weeks for a season, months for longer', () => {
    expect(chooseBucket('2026-11-02', '2026-11-08')).toBe('day')
    expect(chooseBucket('2026-11-01', '2026-11-21')).toBe('day')
    expect(chooseBucket('2026-08-13', '2026-11-09')).toBe('week')
    expect(chooseBucket('2026-01-05', '2026-11-09')).toBe('month')
  })

  it('starts a bucket on the day, the Monday or the first of the month', () => {
    // 10 November 2026 is a Tuesday.
    expect(bucketStart('2026-11-10', 'day')).toBe('2026-11-10')
    expect(bucketStart('2026-11-10', 'week')).toBe('2026-11-09')
    expect(bucketStart('2026-11-15', 'week')).toBe('2026-11-09')
    expect(bucketStart('2026-11-10', 'month')).toBe('2026-11-01')
  })

  it('knows how many days a bucket has', () => {
    expect(bucketDays('2026-11-10', 'day')).toBe(1)
    expect(bucketDays('2026-11-09', 'week')).toBe(7)
    expect(bucketDays('2026-11-01', 'month')).toBe(30)
    expect(bucketDays('2026-02-01', 'month')).toBe(28)
    expect(bucketDays('2028-02-01', 'month')).toBe(29)
  })

  it('means the values of each bucket and says how many went in', () => {
    const points = [
      { day: '2026-11-03', value: 5 },
      { day: '2026-11-08', value: 2 },
      { day: '2026-11-09', value: 4 },
      { day: '2026-10-28', value: 3 },
    ]
    expect(bucketMeans(points, 'week')).toEqual([
      { start: '2026-10-26', mean: 3, n: 1 },
      { start: '2026-11-02', mean: 3.5, n: 2 },
      { start: '2026-11-09', mean: 4, n: 1 },
    ])
    expect(bucketMeans(points, 'month')).toEqual([
      { start: '2026-10-01', mean: 3, n: 1 },
      { start: '2026-11-01', mean: 11 / 3, n: 3 },
    ])
    expect(bucketMeans([], 'week')).toEqual([])
  })

  it('lays a stretch of days out as weeks, ragged at both ends', () => {
    // Wednesday 4 November to Tuesday 10 November 2026.
    expect(calendarWeeks('2026-11-04', '2026-11-10')).toEqual([
      [null, null, '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'],
      ['2026-11-09', '2026-11-10', null, null, null, null, null],
    ])
    expect(calendarWeeks('2026-11-10', '2026-11-04')).toEqual([])
    expect(calendarWeeks('2026-11-09', '2026-11-15')).toHaveLength(1)
  })

  it('lists the months that begin inside a stretch', () => {
    expect(monthStarts('2026-08-13', '2026-11-09')).toEqual(['2026-09-01', '2026-10-01', '2026-11-01'])
    expect(monthStarts('2026-11-01', '2027-01-15')).toEqual(['2026-11-01', '2026-12-01', '2027-01-01'])
    expect(monthStarts('2026-11-02', '2026-11-30')).toEqual([])
  })

  it('lists every day of a stretch', () => {
    expect(dayRange('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
    expect(dayRange('2026-11-02', '2026-11-01')).toEqual([])
  })

  it('thins a long list evenly and keeps the first item', () => {
    expect(thin([1, 2, 3], 5)).toEqual([1, 2, 3])
    expect(thin([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([1, 4, 7])
    expect(thin([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 6)).toEqual([1, 3, 5, 7, 9, 11])
  })
})
