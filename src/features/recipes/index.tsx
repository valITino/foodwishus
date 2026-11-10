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

export function RecipeBookScreen() {
  return <Soon name="Recipe book" />
}

export function RecipesRoutes(_props: { route: Route }) {
  return <Soon name="Recipe" />
}
