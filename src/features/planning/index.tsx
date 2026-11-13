// Planning: the live Today screen, the Wishlist, proposing, a meal's own page and Our Week.
// The Shell mounts the three tab screens and hands every other planning route to PlanningRoutes.

import { MotionConfig } from 'motion/react'
import { matchPath, navigate, type Route } from '../../app/router'
import { useCopy } from '../../i18n'
import { Button, EmptyState, PageHeader, Screen } from '../../ui/components'
import { planningCopy } from './copy'
export { LogSheet, TodayPicker } from './MealPicker'
import { ProposeScreen } from './Propose'
import { ServingScreen } from './ServingPage'
import { TodayScreen as Today } from './Today'
import { WeekScreen as Week } from './Week'
import { WishlistScreen as Wishlist } from './Wishlist'

export function TodayScreen() {
  return <Today />
}

/** Lifting and tilting cards is decoration: skip it for people who asked for less motion. */
export function WishlistScreen() {
  return (
    <MotionConfig reducedMotion="user">
      <Wishlist />
    </MotionConfig>
  )
}

export function WeekScreen() {
  return (
    <MotionConfig reducedMotion="user">
      <Week />
    </MotionConfig>
  )
}

export function PlanningRoutes({ route }: { route: Route }) {
  const c = useCopy(planningCopy)

  const serving = matchPath('/serving/:id', route.path)
  if (serving) return <ServingScreen key={serving.id} id={serving.id} day={route.query.get('day')} />

  const dish = matchPath('/propose/dish/:id', route.path)
  if (dish) return <ProposeScreen key={dish.id} kind="dish" id={dish.id} />

  const menu = matchPath('/propose/menu/:id', route.path)
  if (menu) return <ProposeScreen key={menu.id} kind="menu" id={menu.id} />

  return (
    <Screen>
      <PageHeader title={c.serving.header} backTo="/wishlist" />
      <main>
        <EmptyState title={c.serving.goneTitle} body={c.serving.goneBody} action={<Button onClick={() => navigate('/wishlist', { replace: true })}>{c.serving.goneAction}</Button>} />
      </main>
    </Screen>
  )
}
