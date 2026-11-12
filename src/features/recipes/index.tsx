// The Recipe Book: dishes with full recipes and calories, cook mode, and menus.
//
//   /recipes              the tab (RecipeBookScreen)
//   /recipes/new          new dish (optional ?from=<hand-over from the link reader>)
//   /recipes/import       recipe from a link (optional ?link=…)
//   /recipes/:id          dish page
//   /recipes/:id/edit     edit dish
//   /recipes/:id/cook     cook mode (optional ?servings=4)
//   /menus/new            new menu
//   /menus/:id            menu page
//   /menus/:id/edit       edit menu

import { matchPath, navigate, type Route } from '../../app/router'
import { Button, EmptyState, PageHeader, Screen } from '../../ui/components'
import { CookMode } from './CookMode'
import { useRecipesCopy } from './copy'
import { DishEditor } from './DishEditor'
import { DishPage } from './DishPage'
import { ImportPage } from './ImportPage'
import { MenuEditor } from './MenuEditor'
import { MenuPage } from './MenuPage'

export { RecipeBookScreen } from './RecipeBook'

function Lost() {
  const c = useRecipesCopy()
  return (
    <Screen>
      <PageHeader title={c.book.title} backTo="/recipes" />
      <EmptyState
        title={c.book.noMatchTitle}
        body={c.book.noMatchBody}
        action={
          <Button variant="secondary" onClick={() => navigate('/recipes', { replace: true })}>
            {c.dish.backToBook}
          </Button>
        }
      />
    </Screen>
  )
}

/** Everything under `/recipes/…` and `/menus/…`. */
export function RecipesRoutes({ route }: { route: Route }) {
  const { path } = route
  if (path === '/recipes/new') return <DishEditor key={`new-dish-${route.query.get('from') ?? ''}`} from={route.query.get('from')} />
  if (path === '/recipes/import') return <ImportPage key="import" route={route} />
  if (path === '/menus/new') return <MenuEditor key="new-menu" />

  const edit = matchPath('/recipes/:id/edit', path)
  if (edit) return <DishEditor key={`edit-${edit.id}`} id={edit.id} />
  const cook = matchPath('/recipes/:id/cook', path)
  if (cook) return <CookMode key={`cook-${cook.id}`} id={cook.id} route={route} />
  const dish = matchPath('/recipes/:id', path)
  if (dish) return <DishPage key={`dish-${dish.id}`} id={dish.id} />

  const menuEdit = matchPath('/menus/:id/edit', path)
  if (menuEdit) return <MenuEditor key={`menu-edit-${menuEdit.id}`} id={menuEdit.id} />
  const menu = matchPath('/menus/:id', path)
  if (menu) return <MenuPage key={`menu-${menu.id}`} id={menu.id} />

  return <Lost />
}
