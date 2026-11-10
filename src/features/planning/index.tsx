// Placeholder. The real screens for this feature replace this file.

import type { Route } from '../../app/router'
import { EmptyState, Screen } from '../../ui/components'

function Soon({ name }: { name: string }) {
  return (
    <Screen tabs>
      <EmptyState title={name} body="Coming right up." mood="happy" />
    </Screen>
  )
}

export function TodayScreen() {
  return <Soon name="Today" />
}

export function WishlistScreen() {
  return <Soon name="Wishlist" />
}

export function WeekScreen() {
  return <Soon name="Our Week" />
}

export function PlanningRoutes(_props: { route: Route }) {
  return <Soon name="Serving" />
}
