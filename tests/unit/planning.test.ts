import { describe, expect, it } from 'vitest'
import type { Serving } from '../../src/data/types'
import {
  calendarPlace,
  canServe,
  cookOf,
  currentStreak,
  dayMarks,
  dayPart,
  defaultCook,
  defaultSlot,
  eatenInWeek,
  freeSlots,
  groupByDayAndSlot,
  linkedDay,
  mealsOf,
  nextDays,
  onTheTable,
  placeAfterDrag,
  plannedFor,
  roleIn,
  sameMonth,
  shiftMonth,
  skippedServings,
  slotForHour,
  suggestedFor,
  upcomingDays,
  upNext,
  wishesForDay,
  wishlistCards,
} from '../../src/features/planning/logic'

const MIA = 'mia'
const LEO = 'leo'
// Tuesday. The week runs from Monday 9 to Sunday 15 November 2026.
const TODAY = '2026-11-10'

let made = 0

/** A serving on the wishlist. Each new one sorts after the ones made before it. */
function wish(name: string, overrides: Partial<Serving> = {}): Serving {
  made += 1
  return {
    id: name,
    householdId: 'kitchen',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    deletedAt: null,
    dishId: `dish-${name}`,
    menuId: null,
    proposedBy: MIA,
    cookedBy: MIA,
    proposedAt: '2026-11-01T10:00:00.000Z',
    note: null,
    suggestedDays: [],
    craving: null,
    priority: `a${String(made).padStart(4, '0')}`,
    status: 'wishlist',
    plannedDate: null,
    plannedSlot: null,
    servedAt: null,
    eatenAt: null,
    skippedReason: null,
    proofPhotos: [],
    ...overrides,
  }
}

const planned = (name: string, plannedDate: string, plannedSlot: Serving['plannedSlot'] = 'dinner', overrides: Partial<Serving> = {}) =>
  wish(name, { status: 'planned', plannedDate, plannedSlot, ...overrides })

/** Eaten at the given Zurich wall-clock time (winter: UTC+1). */
const eaten = (name: string, day: string, time = '19:30', overrides: Partial<Serving> = {}) =>
  wish(name, { status: 'eaten', eatenAt: new Date(`${day}T${time}:00+01:00`).toISOString(), ...overrides })

const names = (servings: Serving[]) => servings.map((s) => s.id)

describe('the greeting', () => {
  it('follows the time of day in Zurich', () => {
    expect(dayPart(5)).toBe('morning')
    expect(dayPart(10)).toBe('morning')
    expect(dayPart(11)).toBe('midday')
    expect(dayPart(13)).toBe('midday')
    expect(dayPart(14)).toBe('afternoon')
    expect(dayPart(17)).toBe('afternoon')
    expect(dayPart(18)).toBe('evening')
    expect(dayPart(22)).toBe('evening')
    expect(dayPart(23)).toBe('night')
    expect(dayPart(0)).toBe('night')
    expect(dayPart(4)).toBe('night')
  })
})

describe('roles belong to each meal', () => {
  it('makes the person who cooks the cook and the other one the Taster', () => {
    const meal = wish('lasagne', { cookedBy: MIA, proposedBy: LEO })
    expect(roleIn(meal, MIA)).toBe('cook')
    expect(roleIn(meal, LEO)).toBe('taster')
  })

  it('falls back to the proposer when nobody is set as cook', () => {
    const meal = wish('lasagne', { cookedBy: null, proposedBy: LEO })
    expect(cookOf(meal)).toBe(LEO)
    expect(roleIn(meal, LEO)).toBe('cook')
  })

  it('picks the Chef of the two as cook for a new proposal', () => {
    const chef = { id: MIA, defaultRole: 'chef' as const }
    const taster = { id: LEO, defaultRole: 'taster' as const }
    expect(defaultCook(taster, chef)).toBe(MIA)
    expect(defaultCook(chef, taster)).toBe(MIA)
    // Two chefs, two tasters or nobody to cook for: whoever proposes cooks.
    expect(defaultCook(chef, { id: LEO, defaultRole: 'chef' })).toBe(MIA)
    expect(defaultCook(taster, { id: MIA, defaultRole: 'taster' })).toBe(LEO)
    expect(defaultCook(taster, null)).toBe(LEO)
  })

  it('lets only the cook serve, on the planned day or after it slipped by', () => {
    expect(canServe(planned('today', TODAY), MIA, TODAY)).toBe(true)
    expect(canServe(planned('today', TODAY), LEO, TODAY)).toBe(false)
    expect(canServe(planned('overdue', '2026-11-08'), MIA, TODAY)).toBe(true)
    expect(canServe(planned('tomorrow', '2026-11-11'), MIA, TODAY)).toBe(false)
    expect(canServe(wish('not planned'), MIA, TODAY)).toBe(false)
  })
})

describe('Today', () => {
  it('lists what is on the table, the longest wait first', () => {
    const servings = [
      wish('late', { status: 'served', servedAt: '2026-11-10T18:30:00.000Z' }),
      wish('early', { status: 'served', servedAt: '2026-11-10T11:00:00.000Z' }),
      wish('not served'),
    ]
    expect(names(onTheTable(servings))).toEqual(['early', 'late'])
  })

  it('shows the meals planned for today in the order they are eaten', () => {
    const servings = [planned('dinner', TODAY, 'dinner'), planned('tomorrow', '2026-11-11', 'breakfast'), planned('breakfast', TODAY, 'breakfast'), planned('dessert', TODAY, 'dessert'), wish('wish')]
    expect(names(plannedFor(servings, TODAY))).toEqual(['breakfast', 'dinner', 'dessert'])
  })

  it('queues planned meals by date and slot, then the wishlist in its own order', () => {
    const servings = [
      wish('first wish'),
      planned('friday dinner', '2026-11-13', 'dinner'),
      wish('second wish'),
      planned('thursday', '2026-11-12', 'dinner'),
      planned('friday lunch', '2026-11-13', 'lunch'),
    ]
    expect(names(upNext(servings, TODAY, 10))).toEqual(['thursday', 'friday lunch', 'friday dinner', 'first wish', 'second wish'])
    expect(names(upNext(servings, TODAY))).toEqual(['thursday', 'friday lunch', 'friday dinner'])
  })

  it('leaves out what is planned for today, already served, eaten or skipped', () => {
    const servings = [
      planned('today', TODAY),
      wish('served', { status: 'served', servedAt: '2026-11-10T11:00:00.000Z' }),
      eaten('eaten', '2026-11-09'),
      wish('skipped', { status: 'skipped' }),
      wish('wish'),
      planned('overdue', '2026-11-08'),
    ]
    // A meal whose day slipped by is still open, and comes first.
    expect(names(upNext(servings, TODAY))).toEqual(['overdue', 'wish'])
  })

  it('counts the meals eaten this week, Monday to Sunday', () => {
    const servings = [
      eaten('sunday before', '2026-11-08'),
      eaten('monday', '2026-11-09'),
      eaten('tuesday lunch', '2026-11-10', '12:15'),
      eaten('tuesday dinner', '2026-11-10'),
      eaten('sunday', '2026-11-15'),
      eaten('monday after', '2026-11-16'),
      planned('planned', '2026-11-11'),
      wish('served', { status: 'served', servedAt: '2026-11-10T11:00:00.000Z' }),
    ]
    expect(eatenInWeek(servings, TODAY)).toBe(4)
    expect(eatenInWeek([], TODAY)).toBe(0)
  })

  it('uses the Zurich day: a midnight snack belongs to the new day', () => {
    // 23:30 UTC on Sunday is 00:30 on Monday in Zurich.
    const snack = wish('snack', { status: 'eaten', eatenAt: '2026-11-08T23:30:00.000Z' })
    expect(eatenInWeek([snack], TODAY)).toBe(1)
    // Counted as Sunday, it would not connect to Tuesday.
    expect(currentStreak([snack, eaten('tuesday', TODAY)], TODAY)).toBe(2)
    expect(currentStreak([snack], TODAY)).toBe(1)
  })

  describe('the streak', () => {
    it('counts days in a row with at least one eaten meal', () => {
      const servings = [eaten('tue', '2026-11-10'), eaten('mon', '2026-11-09'), eaten('mon again', '2026-11-09', '12:00'), eaten('sun', '2026-11-08'), eaten('long ago', '2026-11-05')]
      expect(currentStreak(servings, TODAY)).toBe(3)
    })

    it('is not broken by a day that is not over yet', () => {
      const servings = [eaten('mon', '2026-11-09'), eaten('sun', '2026-11-08')]
      expect(currentStreak(servings, TODAY)).toBe(2)
    })

    it('ends when a whole day went by without a meal', () => {
      expect(currentStreak([eaten('sun', '2026-11-08'), eaten('sat', '2026-11-07')], TODAY)).toBe(0)
      expect(currentStreak([], TODAY)).toBe(0)
    })

    it('ignores meals that were planned or served but never eaten', () => {
      const servings = [eaten('tue', TODAY), planned('mon', '2026-11-09'), wish('served', { status: 'served', servedAt: '2026-11-09T18:00:00.000Z' })]
      expect(currentStreak(servings, TODAY)).toBe(1)
    })

    it('crosses a month boundary', () => {
      const servings = [eaten('1st', '2026-12-01'), eaten('30th', '2026-11-30'), eaten('29th', '2026-11-29')]
      expect(currentStreak(servings, '2026-12-01')).toBe(3)
    })
  })
})

describe('the wishlist', () => {
  const servings = [
    wish('rated', { craving: 4 }),
    planned('planned', '2026-11-12', 'dinner', { craving: 5 }),
    wish('unrated'),
    planned('planned unrated', '2026-11-13'),
    wish('skipped', { status: 'skipped', updatedAt: '2026-11-05T10:00:00.000Z' }),
    eaten('eaten', '2026-11-09'),
    wish('skipped later', { status: 'skipped', updatedAt: '2026-11-07T10:00:00.000Z' }),
  ]

  it('shows wishes and planned meals, in wishlist order', () => {
    expect(names(wishlistCards(servings))).toEqual(['rated', 'planned', 'unrated', 'planned unrated'])
  })

  it('filters: not rated yet, planned', () => {
    expect(names(wishlistCards(servings, 'unrated'))).toEqual(['unrated', 'planned unrated'])
    expect(names(wishlistCards(servings, 'planned'))).toEqual(['planned', 'planned unrated'])
  })

  it('keeps skipped meals apart, the latest first', () => {
    expect(names(skippedServings(servings))).toEqual(['skipped later', 'skipped'])
  })

  describe('dropping a dragged card', () => {
    const all = ['a', 'b', 'c', 'd', 'e']

    it('moves a card down: it lands right below the card it was dropped on', () => {
      expect(placeAfterDrag(all, all, 'a', 'c')).toEqual({ order: ['b', 'c', 'a', 'd', 'e'], beforeId: 'c', afterId: 'd' })
    })

    it('moves a card up: it lands right above the card it was dropped on', () => {
      expect(placeAfterDrag(all, all, 'd', 'b')).toEqual({ order: ['a', 'd', 'b', 'c', 'e'], beforeId: 'a', afterId: 'b' })
    })

    it('reaches the very top and the very bottom', () => {
      expect(placeAfterDrag(all, all, 'c', 'a')).toEqual({ order: ['c', 'a', 'b', 'd', 'e'], beforeId: null, afterId: 'a' })
      expect(placeAfterDrag(all, all, 'c', 'e')).toEqual({ order: ['a', 'b', 'd', 'e', 'c'], beforeId: 'e', afterId: null })
    })

    it('does nothing when the card is dropped where it was, or on something unknown', () => {
      expect(placeAfterDrag(all, all, 'c', 'c')).toBeNull()
      expect(placeAfterDrag(all, all, 'c', 'x')).toBeNull()
      expect(placeAfterDrag(all, all, 'x', 'c')).toBeNull()
    })

    it('respects cards hidden by a filter: neighbours come from the whole list', () => {
      // Only b and d are on screen. Dragging d above b must not jump over a.
      expect(placeAfterDrag(['b', 'd'], all, 'd', 'b')).toEqual({ order: ['d', 'b'], beforeId: 'a', afterId: 'b' })
      // Dragging b below d must not jump over e.
      expect(placeAfterDrag(['b', 'd'], all, 'b', 'd')).toEqual({ order: ['d', 'b'], beforeId: 'd', afterId: 'e' })
    })
  })
})

describe('planning', () => {
  it('offers the coming days, starting today', () => {
    expect(nextDays('2026-11-29', 4)).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02'])
    expect(nextDays(TODAY, 14)).toHaveLength(14)
  })

  it('keeps only suggested days that are still ahead', () => {
    expect(upcomingDays(['2026-11-12', '2026-11-08', '2026-11-10', '2026-11-12'], TODAY)).toEqual(['2026-11-10', '2026-11-12'])
    expect(upcomingDays([], TODAY)).toEqual([])
  })

  it('guesses the slot from the kind of dish', () => {
    expect(defaultSlot('breakfast')).toBe('breakfast')
    expect(defaultSlot('dessert')).toBe('dessert')
    expect(defaultSlot('snack')).toBe('dessert')
    expect(defaultSlot('main')).toBe('dinner')
    expect(defaultSlot(null)).toBe('dinner')
  })

  it('guesses the slot from the hour a meal was eaten', () => {
    expect(slotForHour(8)).toBe('breakfast')
    expect(slotForHour(12)).toBe('lunch')
    expect(slotForHour(16)).toBe('dessert')
    expect(slotForHour(19)).toBe('dinner')
    expect(slotForHour(23)).toBe('dessert')
    expect(slotForHour(1)).toBe('dessert')
  })

  it('puts the wishes somebody suggested for that day first', () => {
    const servings = [wish('plain'), wish('suggested', { suggestedDays: ['2026-11-12'] }), planned('planned', '2026-11-12'), wish('other day', { suggestedDays: ['2026-11-13'] })]
    expect(names(wishesForDay(servings, '2026-11-12'))).toEqual(['suggested', 'plain', 'other day'])
  })

  it('knows which wishes were suggested for a day, until they are planned', () => {
    const servings = [
      wish('suggested', { suggestedDays: ['2026-11-12', '2026-11-14'] }),
      wish('other day', { suggestedDays: ['2026-11-13'] }),
      planned('already planned', '2026-11-15', 'dinner', { suggestedDays: ['2026-11-12'] }),
      wish('skipped', { status: 'skipped', suggestedDays: ['2026-11-12'] }),
    ]
    expect(names(suggestedFor(servings, '2026-11-12'))).toEqual(['suggested'])
    expect(names(suggestedFor(servings, '2026-11-14'))).toEqual(['suggested'])
    expect(suggestedFor(servings, '2026-11-16')).toEqual([])
  })

  it('accepts a day from a link only when it is a real day that is not over', () => {
    expect(linkedDay('2026-11-12', TODAY)).toBe('2026-11-12')
    expect(linkedDay(TODAY, TODAY)).toBe(TODAY)
    expect(linkedDay('2026-11-09', TODAY)).toBeNull()
    expect(linkedDay('2026-02-31', TODAY)).toBeNull()
    expect(linkedDay('next thursday', TODAY)).toBeNull()
    expect(linkedDay('', TODAY)).toBeNull()
    expect(linkedDay(null, TODAY)).toBeNull()
  })
})

describe('the calendar', () => {
  it('places planned meals on their day and slot', () => {
    expect(calendarPlace(planned('p', '2026-11-12', 'lunch'))).toEqual({ day: '2026-11-12', slot: 'lunch' })
  })

  it('places eaten meals on the day they were really eaten', () => {
    // Planned for Thursday, eaten on Friday.
    const late = eaten('late', '2026-11-13', '19:30', { plannedDate: '2026-11-12', plannedSlot: 'dinner' })
    expect(calendarPlace(late)).toEqual({ day: '2026-11-13', slot: 'dinner' })
  })

  it('guesses the slot of an unplanned meal from the clock', () => {
    expect(calendarPlace(eaten('brunch', '2026-11-14', '09:10'))).toEqual({ day: '2026-11-14', slot: 'breakfast' })
    expect(calendarPlace(wish('served', { status: 'served', servedAt: new Date('2026-11-14T12:40:00+01:00').toISOString() }))).toEqual({ day: '2026-11-14', slot: 'lunch' })
  })

  it('has no place for wishes and skipped meals', () => {
    expect(calendarPlace(wish('wish'))).toBeNull()
    expect(calendarPlace(wish('skipped', { status: 'skipped', plannedDate: '2026-11-12', plannedSlot: 'dinner' }))).toBeNull()
  })

  it('groups a week by day and slot', () => {
    const week = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']
    const servings = [
      planned('thu dinner', '2026-11-12', 'dinner'),
      planned('thu breakfast', '2026-11-12', 'breakfast'),
      planned('thu dinner two', '2026-11-12', 'dinner'),
      eaten('mon', '2026-11-09', '12:30', { plannedSlot: 'lunch' }),
      planned('next week', '2026-11-17'),
      wish('wish'),
    ]
    const plan = groupByDayAndSlot(servings, week)
    expect(Object.keys(plan)).toEqual(week)
    expect(names(plan['2026-11-12'].dinner)).toEqual(['thu dinner', 'thu dinner two'])
    expect(names(mealsOf(plan['2026-11-12']))).toEqual(['thu breakfast', 'thu dinner', 'thu dinner two'])
    expect(names(plan['2026-11-09'].lunch)).toEqual(['mon'])
    expect(mealsOf(plan['2026-11-11'])).toEqual([])
    expect(freeSlots(plan['2026-11-12'])).toEqual(['lunch', 'dessert'])
    expect(freeSlots(plan['2026-11-11'])).toEqual(['breakfast', 'lunch', 'dinner', 'dessert'])
  })

  it('marks each day for the month view', () => {
    const day = '2026-11-12'
    const plan = groupByDayAndSlot([planned('a', day, 'lunch'), wish('b', { status: 'served', plannedDate: day, plannedSlot: 'dinner', servedAt: new Date(`${day}T19:00:00+01:00`).toISOString() }), eaten('c', day, '08:00')], [day])
    expect(dayMarks(plan[day])).toEqual({ open: 2, eaten: 1 })
  })

  it('steps through months', () => {
    expect(shiftMonth('2026-11-10', 1)).toBe('2026-12-01')
    expect(shiftMonth('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftMonth('2026-01-15', -1)).toBe('2025-12-01')
    expect(shiftMonth('2026-03-31', -1)).toBe('2026-02-01')
    expect(sameMonth('2026-11-01', '2026-11-30')).toBe(true)
    expect(sameMonth('2026-11-30', '2026-12-01')).toBe(false)
  })
})
