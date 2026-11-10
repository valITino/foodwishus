// A person's settings (language, candlelight, calories) live on their profile, so they
// follow the person to every phone and tablet they log in on.
//
// The profile is the truth. A change made here is written to the profile; a profile that
// arrives from the cloud (after logging in, or changed on another device) is applied here.

import { liveQuery } from 'dexie'
import { updateMyProfile } from '../data/actions'
import { db, isDemo } from '../data/app'
import { META } from '../data/db'
import { getPref, onPrefChange, setPref } from '../data/prefs'
import type { ID, MemberPrefs } from '../data/types'
import { getLang, onLangChange, setLang } from '../i18n'
import { getTheme, onThemeChange, setTheme } from '../ui/theme'

type Settings = Required<MemberPrefs>

const here = (): Settings => ({ theme: getTheme(), lang: getLang(), showCalories: getPref('showCalories') })

/** The settings a profile carries, or null when it has never saved any. */
export function savedSettings(prefs: MemberPrefs | undefined): MemberPrefs | null {
  return prefs && Object.keys(prefs).length > 0 ? prefs : null
}

/** What has to change on this device to match the profile. */
export function settingsToApply(saved: MemberPrefs, local: Settings): Partial<Settings> {
  const out: Partial<Settings> = {}
  if ((saved.theme === 'auto' || saved.theme === 'light' || saved.theme === 'dark') && saved.theme !== local.theme) out.theme = saved.theme
  if ((saved.lang === 'en' || saved.lang === 'de') && saved.lang !== local.lang) out.lang = saved.lang
  if (typeof saved.showCalories === 'boolean' && saved.showCalories !== local.showCalories) out.showCalories = saved.showCalories
  return out
}

let running: (() => void) | null = null

/** Start keeping this device and the profile in step. Safe to call more than once. */
export function startSettingsSync(): () => void {
  if (isDemo) return () => {}
  if (running) return running

  /** What the profile said the last time we saw it. Undefined until it has loaded. */
  let onProfile: MemberPrefs | null | undefined
  let applying = false

  const save = () => {
    if (applying || onProfile === undefined) return
    const mine = here()
    if (onProfile && Object.keys(settingsToApply(mine, { theme: 'auto', lang: 'en', showCalories: true, ...onProfile })).length === 0) return
    onProfile = mine
    void updateMyProfile({ prefs: mine }).catch(() => {
      /* not logged in any more: nothing to save to */
    })
  }

  const profile = liveQuery(async () => {
    const id = await db.getMeta<ID>(META.memberId)
    return id ? db.members.get(id) : undefined
  }).subscribe((me) => {
    if (!me) return
    const saved = savedSettings(me.prefs)
    onProfile = saved
    // A brand-new profile: remember the choices made on this device.
    if (!saved) return save()
    const changes = settingsToApply(saved, here())
    applying = true
    try {
      if (changes.theme) setTheme(changes.theme)
      if (changes.lang) setLang(changes.lang)
      if (changes.showCalories !== undefined) setPref('showCalories', changes.showCalories)
    } finally {
      applying = false
    }
  })

  const stops = [onThemeChange(save), onLangChange(save), onPrefChange(save)]
  running = () => {
    profile.unsubscribe()
    for (const stop of stops) stop()
    running = null
  }
  return running
}
