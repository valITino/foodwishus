import { describe, expect, it } from 'vitest'
import { savedSettings, settingsToApply } from '../../src/app/settingsSync'

const local = { theme: 'auto', lang: 'en', showCalories: true } as const

describe('settings that follow the person', () => {
  it('treats a profile without settings as "nothing saved yet"', () => {
    expect(savedSettings(undefined)).toBeNull()
    expect(savedSettings({})).toBeNull()
    expect(savedSettings({ lang: 'de' })).toEqual({ lang: 'de' })
  })

  it('applies only what differs on this device', () => {
    expect(settingsToApply({ theme: 'dark', lang: 'de', showCalories: false }, local)).toEqual({ theme: 'dark', lang: 'de', showCalories: false })
    expect(settingsToApply({ theme: 'auto', lang: 'en', showCalories: true }, local)).toEqual({})
    expect(settingsToApply({ lang: 'de' }, local)).toEqual({ lang: 'de' })
  })

  it('ignores values it does not know, so an odd profile cannot break a device', () => {
    expect(settingsToApply({ theme: 'neon', lang: 'fr', showCalories: 'yes' } as never, local)).toEqual({})
  })
})
