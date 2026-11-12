// Fork keeps an eye on the plan: when somebody changes the planned meals of the next days
// and something is noted in the pantry, he checks by himself and rings the bell when
// something is missing. He does it on the phone the plan was changed on (the other phone
// hears of the change a second later and would ask the very same question), and once per
// plan: which plan was checked is remembered for the whole kitchen. Switched off on the
// basket page.

import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { tellForkNews } from '../../data/actions'
import { isDemo, store } from '../../data/app'
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

  // Did this phone touch the meals since Fork last looked? Changes that a sync brings in do not count.
  const mine = useRef(false)
  const [touched, setTouched] = useState(0)
  useEffect(
    () =>
      store.onLocal((table) => {
        if (table !== 'servings') return
        mine.current = true
        setTouched((n) => n + 1)
      }),
    [],
  )

  useEffect(() => {
    // Not changed here, nothing planned, nothing noted, already checked, or switched off: nothing to do.
    if (!on || !auto || !household || !mine.current || signature === '' || !somethingNoted || checked === signature) return
    const timer = setTimeout(() => {
      mine.current = false
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      void checkPlan(lang, { reason: reasonWords(c, lang) }).then((outcome) => {
        // Only what the helper found rings the bell: a list of names nobody asked for would be noise.
        if (outcome.kind === 'checked' && outcome.by === 'fork' && outcome.count > 0) return tellForkNews(outcome.count, null)
      })
    }, quietMs())
    return () => clearTimeout(timer)
    // The words and the language do not start a check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, auto, signature, somethingNoted, checked, household?.id, touched])
}
