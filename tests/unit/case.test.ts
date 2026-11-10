import { describe, expect, it } from 'vitest'
import { camelKeys, reviveRow, snakeKeys } from '../../src/data/case'

describe('column name conversion', () => {
  it('converts top-level names both ways and leaves nested recipe data alone', () => {
    const row = { householdId: 'h', coverPhotoId: null, recipe: { prepMinutes: 10, steps: [{ timerSeconds: 30 }] } }
    const snake = snakeKeys(row)
    expect(snake).toEqual({ household_id: 'h', cover_photo_id: null, recipe: { prepMinutes: 10, steps: [{ timerSeconds: 30 }] } })
    expect(camelKeys(snake)).toEqual(row)
  })

  it('turns numeric strings from Postgres back into numbers', () => {
    expect(reviveRow('reviews', { portionsEaten: '1.5' })).toEqual({ portionsEaten: 1.5 })
  })
})
