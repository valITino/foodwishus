// One menu: its courses in order, how long it takes and what it adds up to.

import { useEffect, useState, type ReactNode } from 'react'
import { back, navigate } from '../../app/router'
import { deleteMenu, updateMenu } from '../../data/actions'
import { usePref } from '../../data/prefs'
import { useDishes, useMenu, useServings } from '../../data/queries'
import type { Dish, ID } from '../../data/types'
import { useLang, useT } from '../../i18n'
import { Button, Card, DishThumb, EmptyState, PageHeader, Screen, Stat, SteamLoader, Tag, toast } from '../../ui/components'
import { Icon } from '../../ui/deco/Icon'
import { useRecipesCopy } from './copy'
import { formatDuration, menuCalories, menuMinutes, orderedCourses, totalMinutes } from './logic'
import { BottomBar, ConfirmSheet, DurationFigure, Fact, Section, Unit, useScrollTop } from './parts'
import { rememberView } from './RecipeBook'

/** A figure that may only be a lower bound: "at least 800 kcal". */
function Figure({ atLeast, children, label, testId }: { atLeast: boolean; children: ReactNode; label: string; testId: string }) {
  const c = useRecipesCopy()
  return (
    <div className="min-w-0" data-testid={testId}>
      <div className="tabular font-display text-2xl font-bold leading-none font-soft">
        {atLeast && <Unit>{c.parts.atLeastWord} </Unit>}
        {children}
      </div>
      <div className="mt-1 text-xs font-bold text-ink-soft">{label}</div>
    </div>
  )
}

export function MenuPage({ id }: { id: ID }) {
  const t = useT()
  const c = useRecipesCopy()
  const m = c.menu
  const lang = useLang()
  const showCalories = usePref('showCalories')
  const menu = useMenu(id)
  const dishes = useDishes({ includeArchived: true })
  const servings = useServings()
  useScrollTop()
  const [confirming, setConfirming] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => rememberView('menus'), [])

  if (menu === undefined || dishes === undefined || leaving) {
    return (
      <Screen>
        <PageHeader title={m.header} backTo="/recipes" />
        <SteamLoader />
      </Screen>
    )
  }
  if (menu === null) {
    return (
      <Screen>
        <PageHeader title={m.header} backTo="/recipes" />
        <EmptyState
          title={m.goneTitle}
          body={c.dish.goneBody}
          action={
            <Button variant="secondary" onClick={() => navigate('/recipes', { replace: true })}>
              {c.dish.backToBook}
            </Button>
          }
        />
      </Screen>
    )
  }

  const byId = new Map(dishes.map((dish) => [dish.id, dish]))
  const courses: (Dish | undefined)[] = orderedCourses(menu).map((course) => byId.get(course.dishId))
  const minutes = menuMinutes(courses)
  const kcal = menuCalories(courses)
  const usedIn = (servings ?? []).filter((serving) => serving.menuId === id).length

  const archive = async (archived: boolean) => {
    try {
      await updateMenu(id, { archived })
      toast(archived ? c.dish.archivedToast : c.dish.unarchivedToast)
      if (archived) back('/recipes')
    } catch {
      toast(t.common.somethingWrong, 'oops')
    }
  }

  const remove = async () => {
    setLeaving(true)
    setConfirming(false)
    try {
      await deleteMenu(id)
      toast(c.dish.deletedToast)
      back('/recipes')
    } catch {
      setLeaving(false)
      toast(t.common.somethingWrong, 'oops')
    }
  }

  return (
    <Screen>
      <PageHeader
        title={m.header}
        backTo="/recipes"
        action={
          <Button variant="quiet" onClick={() => navigate(`/menus/${id}/edit`)}>
            {t.common.edit}
          </Button>
        }
      />
      <main className="app-column flex flex-col gap-6 px-4 pb-28 pt-4">
        {menu.archived && (
          <Card tone="blush" pad={false} className="px-4 py-3 text-sm font-bold" role="status">
            {c.dish.archivedBanner}
          </Card>
        )}

        <div>
          <h2 className="break-words text-2xl" data-testid="menu-name">
            {menu.name}
          </h2>
          {menu.description && <p className="mt-1.5 break-words text-ink-soft">{menu.description}</p>}
        </div>

        {courses.length === 0 ? (
          <Card pad={false}>
            <EmptyState
              title={m.emptyTitle}
              body={m.emptyBody}
              action={
                <Button variant="secondary" onClick={() => navigate(`/menus/${id}/edit`)}>
                  {m.emptyAction}
                </Button>
              }
            />
          </Card>
        ) : (
          <>
            <Card tone="blush" pad={false} className="px-5 py-4" data-testid="menu-facts">
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                <Stat value={courses.length} label={c.parts.courseWord(courses.length)} />
                {minutes.known > 0 && (
                  <Figure testId="menu-time" atLeast={minutes.unknown > 0} label={m.totalTime}>
                    <DurationFigure minutes={minutes.total} />
                  </Figure>
                )}
                {showCalories && kcal.known > 0 && (
                  <Figure testId="menu-calories" atLeast={kcal.unknown > 0} label={c.parts.perPerson}>
                    {Math.round(kcal.total)}
                    <Unit> kcal</Unit>
                  </Figure>
                )}
              </div>
              {((showCalories && kcal.unknown > 0) || (minutes.unknown > 0 && minutes.known > 0)) && (
                <p className="mt-3 text-xs font-semibold text-ink-soft">
                  {[showCalories && kcal.unknown > 0 && m.missingCalories(kcal.unknown), minutes.unknown > 0 && minutes.known > 0 && m.missingTime(minutes.unknown)].filter(Boolean).join(' ')}
                </p>
              )}
            </Card>

            <Section id="menu-courses" title={m.courses}>
              <Card pad={false}>
                <ol className="divide-y divide-line" data-testid="menu-courses">
                  {courses.map((dish, i) => {
                    const number = (
                      <span className="tabular w-5 shrink-0 text-center font-display text-lg font-bold" aria-hidden>
                        {i + 1}
                      </span>
                    )
                    if (!dish) {
                      return (
                        <li key={i} className="flex min-h-16 items-center gap-3 px-3 py-2 text-sm text-ink-soft">
                          {number}
                          {c.parts.gone}
                        </li>
                      )
                    }
                    const time = totalMinutes(dish.recipe)
                    const dishKcal = dish.nutrition.kcalPerServing
                    return (
                      <li key={dish.id}>
                        <button type="button" aria-label={m.openDish(dish.name)} onClick={() => navigate(`/recipes/${dish.id}`)} className="flex w-full items-center gap-3 px-3 py-3 text-left">
                          {number}
                          <DishThumb dish={dish} size={56} />
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-2 break-words text-sm font-extrabold leading-snug">{dish.name}</span>
                            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-ink-soft">
                              <Tag>{t.courses[dish.course]}</Tag>
                              {time !== null && <Fact icon="clock">{formatDuration(time, lang)}</Fact>}
                              {showCalories && dishKcal !== undefined && <Fact icon="flame">{t.common.kcal(Math.round(dishKcal))}</Fact>}
                            </span>
                          </span>
                          <Icon name="next" size={20} className="shrink-0 text-ink-soft" />
                        </button>
                      </li>
                    )
                  })}
                </ol>
              </Card>
            </Section>
          </>
        )}

        <div className="flex flex-wrap justify-center gap-x-2">
          {!menu.archived && (
            <Button variant="quiet" onClick={() => void archive(true)}>
              {t.common.archive}
            </Button>
          )}
          <Button variant="quiet" onClick={() => setConfirming(true)}>
            {t.common.delete}
          </Button>
        </div>
      </main>

      <BottomBar>
        {menu.archived ? (
          <Button block onClick={() => void archive(false)}>
            {c.dish.unarchive}
          </Button>
        ) : (
          <Button block disabled={courses.length === 0} onClick={() => navigate(`/propose/menu/${id}`)}>
            {t.actions.propose}
          </Button>
        )}
      </BottomBar>

      <ConfirmSheet
        open={confirming}
        title={m.deleteTitle(menu.name)}
        confirm={m.deleteConfirm}
        onConfirm={() => void remove()}
        other={
          menu.archived
            ? undefined
            : {
                label: c.dish.archiveInstead,
                onClick: () => {
                  setConfirming(false)
                  void archive(true)
                },
              }
        }
        onClose={() => setConfirming(false)}
      >
        <p>{m.deleteBody}</p>
        {usedIn > 0 && <p>{m.deleteServings(usedIn)}</p>}
      </ConfirmSheet>
    </Screen>
  )
}
