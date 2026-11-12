// Fork keeps an eye on the plan: when the planned meals of the next days change and
// something is noted in the pantry, he checks by himself, once per plan and per kitchen,
// and rings the bell when something is missing. Switched off on the basket page.

import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo } from 'react'
import { tellForkNews } from '../../data/actions'
import { isDemo } from '../../data/app'
import { kitchenNow } from '../../data/helper'
import { usePref } from '../../data/prefs'
import { useHousehold } from '../../data/queries'
import { useLang } from '../../i18n'
import { addDays, today } from '../../lib/dates'
import { reasonWords } from './BasketPage'
import { useBasketCopy } from './copy'
import { CHECK_DAYS, checkPlan, planSignature } from './fork'
import { plannedMeals } from './logic'

/** Planning a week is several taps: Fork waits until it has been quiet for this long. */
const QUIET_MS = 30_000

function quietMs(): number {
  // Tests cannot wait half a minute.
  const asked = import.meta.env.DEV ? Number(localStorage.getItem('foodwishus.forkQuietMs')) : 0
  return asked > 0 ? asked : QUIET_MS
}

export function useForkWatch(on: boolean): void {
  const c = useBasketCopy()
  const lang = useLang()
  const auto = usePref('forkAuto')
  const household = useHousehold()
  const kitchen = useLiveQuery(() => (on && !isDemo ? kitchenNow() : Promise.resolve(null)), [on])
  const day = today()
  const signature = useMemo(() => (kitchen ? planSignature(plannedMeals(kitchen.servings, kitchen.dishes, kitchen.menus, day, addDays(day, CHECK_DAYS - 1))) : ''), [kitchen, day])
  const somethingNoted = (kitchen?.pantry.length ?? 0) > 0
  const checked = household?.settings.forkChecked ?? null

  useEffect(() => {
    // Nothing planned, nothing noted, already checked (by either phone), or switched off: nothing to do.
    if (!on || !auto || !household || signature === '' || !somethingNoted || checked === signature) return
    const timer = setTimeout(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      void checkPlan(lang, { reason: reasonWords(c, lang) }).then((outcome) => {
        // Only what the helper found rings the bell: a list of names nobody asked for would be noise.
        if (outcome.kind === 'checked' && outcome.by === 'fork' && outcome.count > 0) return tellForkNews(outcome.count, null)
      })
    }, quietMs())
    return () => clearTimeout(timer)
    // The words and the language do not start a check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, auto, signature, somethingNoted, checked, household?.id])
}
