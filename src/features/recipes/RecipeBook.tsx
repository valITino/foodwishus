// The Recipe Book tab: every dish and menu, searchable, filterable and sortable.

import { useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { navigate } from '../../app/router'
import { usePref } from '../../data/prefs'
import { useDishes, useMenus } from '../../data/queries'
import type { Course, Dish, ID, Menu } from '../../data/types'
import { useLang, useT } from '../../i18n'
import { AwningHeader, Button, Card, Chip, cx, DishThumb, EmptyState, Screen, Segmented, Sheet, SteamLoader, Tag, Toggle } from '../../ui/components'
import { Icon } from '../../ui/deco/Icon'
import { useRecipesCopy } from './copy'
import { coursesInUse, filterDishes, formatDuration, matchReason, matchesMenu, menuCalories, menuMinutes, orderedCourses, sortMenus, totalMinutes, type DishSort } from './logic'
import { Fact, LineIcon, SearchField } from './parts'

// ------------------------------------------------- what the book remembers --
// Search, filter and sort survive a trip into a recipe and back, like a bookmark.

interface BookState {
  view: 'dishes' | 'menus'
  query: string
  course: Course | null
  sort: DishSort
  showArchived: boolean
  scroll: number
}

let bookState: BookState = { view: 'dishes', query: '', course: null, sort: 'az', showArchived: false, scroll: 0 }
const bookListeners = new Set<() => void>()

function setBook(changes: Partial<BookState>): void {
  bookState = { ...bookState, ...changes }
  for (const fn of bookListeners) fn()
}

function useBook(): BookState {
  return useSyncExternalStore(
    (fn) => {
      bookListeners.add(fn)
      return () => bookListeners.delete(fn)
    },
    () => bookState,
  )
}

/** Open the book on dishes or menus next time, for example after saving a menu. */
export function rememberView(view: BookState['view']): void {
  if (bookState.view !== view) setBook({ view, scroll: 0 })
}

/** Puts the list back where it was, once it has something to show. */
function useScrollMemory(ready: boolean): void {
  useLayoutEffect(() => {
    if (!ready) return
    window.scrollTo(0, bookState.scroll)
    const onScroll = () => {
      bookState.scroll = window.scrollY
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [ready])
}

// ------------------------------------------------------------------- cards --

const cardButton = 'flex w-full items-center gap-3 rounded-card border border-line bg-surface p-3 text-left transition-transform duration-100 active:translate-y-[2px]'

function DishCard({ dish, query }: { dish: Dish; query: string }) {
  const t = useT()
  const c = useRecipesCopy()
  const lang = useLang()
  const showCalories = usePref('showCalories')
  const minutes = totalMinutes(dish.recipe)
  const kcal = dish.nutrition.kcalPerServing
  const reason = matchReason(dish, query)
  return (
    <button type="button" className={cardButton} onClick={() => navigate(`/recipes/${dish.id}`)} data-testid="dish-card">
      <DishThumb dish={dish} size={72} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 break-words text-base font-extrabold leading-snug">{dish.name}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-ink-soft">
          <Tag>{t.courses[dish.course]}</Tag>
          {dish.archived && <Tag tone="butter">{c.book.archived}</Tag>}
          {minutes !== null && <Fact icon="clock">{formatDuration(minutes, lang)}</Fact>}
          {showCalories && kcal !== undefined && <Fact icon="flame">{t.common.kcal(Math.round(kcal))}</Fact>}
        </span>
        {reason && <span className="mt-1 block truncate text-xs font-semibold text-ink-soft">{c.book.with(reason)}</span>}
      </span>
    </button>
  )
}

function MenuCard({ menu, dishes }: { menu: Menu; dishes: Map<ID, Dish> }) {
  const t = useT()
  const c = useRecipesCopy()
  const lang = useLang()
  const showCalories = usePref('showCalories')
  const courses = orderedCourses(menu).map((course) => dishes.get(course.dishId))
  const present = courses.filter((d): d is Dish => Boolean(d))
  const minutes = menuMinutes(courses)
  const kcal = menuCalories(courses)
  return (
    <button type="button" className={cx(cardButton, 'flex-col items-stretch')} onClick={() => navigate(`/menus/${menu.id}`)} data-testid="menu-card">
      <span className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 break-words text-base font-extrabold leading-snug">{menu.name}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-ink-soft">
            <Tag>{c.parts.courses(courses.length)}</Tag>
            {menu.archived && <Tag tone="butter">{c.book.archived}</Tag>}
            {minutes.known > 0 && <Fact icon="clock">{minutes.unknown ? c.parts.atLeast(formatDuration(minutes.total, lang)) : formatDuration(minutes.total, lang)}</Fact>}
            {showCalories && kcal.known > 0 && <Fact icon="flame">{kcal.unknown ? c.parts.atLeast(t.common.kcal(Math.round(kcal.total))) : t.common.kcal(Math.round(kcal.total))}</Fact>}
          </span>
        </span>
        {present.length > 0 && (
          <span className="flex shrink-0 -space-x-4" aria-hidden>
            {present.slice(0, 3).map((dish) => (
              <DishThumb key={dish.id} dish={dish} size={52} className="ring-[3px] ring-surface" />
            ))}
          </span>
        )}
      </span>
      {present.length > 0 && <span className="mt-2 block truncate text-xs font-semibold text-ink-soft">{present.map((d) => d.name).join(', ')}</span>}
    </button>
  )
}

// -------------------------------------------------------------------- sort --

function SortControl({ sort, options, onChange }: { sort: DishSort; options: DishSort[]; onChange: (sort: DishSort) => void }) {
  const c = useRecipesCopy().book
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="-mr-1 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-extrabold text-rose-ink"
      >
        <LineIcon name="sort" size={18} />
        {c.sortButton(c.sorts[sort])}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={c.sortLabel}>
        <div role="radiogroup" aria-label={c.sortLabel} className="flex flex-col pb-2">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={sort === option}
              onClick={() => {
                onChange(option)
                setOpen(false)
              }}
              className="flex min-h-13 items-center justify-between gap-3 border-b border-line text-left text-base font-bold last:border-b-0"
            >
              {c.sorts[option]}
              {sort === option && <Icon name="check" size={22} className="text-rose-ink" />}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  )
}

// ------------------------------------------------------------------ screen --

export function RecipeBookScreen() {
  const t = useT()
  const c = useRecipesCopy()
  const book = useBook()
  const showCalories = usePref('showCalories')
  const allDishes = useDishes({ includeArchived: true })
  const allMenus = useMenus({ includeArchived: true })
  const ready = allDishes !== undefined && allMenus !== undefined
  useScrollMemory(ready)

  const sortOptions: DishSort[] = book.view === 'menus' ? ['az', 'newest'] : showCalories ? ['az', 'newest', 'quickest', 'lightest'] : ['az', 'newest', 'quickest']
  const sort = sortOptions.includes(book.sort) ? book.sort : 'az'

  const dishById = useMemo(() => new Map((allDishes ?? []).map((d) => [d.id, d])), [allDishes])
  const liveDishes = useMemo(() => (allDishes ?? []).filter((d) => book.showArchived || !d.archived), [allDishes, book.showArchived])
  const courses = useMemo(() => coursesInUse(liveDishes), [liveDishes])
  const course = book.course && courses.includes(book.course) ? book.course : null

  const dishes = useMemo(
    () => filterDishes(allDishes ?? [], { query: book.query, course, sort, showArchived: book.showArchived }),
    [allDishes, book.query, course, sort, book.showArchived],
  )
  const menus = useMemo(() => {
    const found = (allMenus ?? []).filter(
      (menu) =>
        (book.showArchived || !menu.archived) &&
        matchesMenu(
          menu,
          menu.courses.map((course) => dishById.get(course.dishId)?.name ?? ''),
          book.query,
        ),
    )
    return sortMenus(found, sort)
  }, [allMenus, book.showArchived, book.query, dishById, sort])

  const dishTotal = (allDishes ?? []).length
  const menuTotal = (allMenus ?? []).length
  const archivedCount = book.view === 'dishes' ? (allDishes ?? []).filter((d) => d.archived).length : (allMenus ?? []).filter((m) => m.archived).length
  const total = book.view === 'dishes' ? dishTotal : menuTotal
  const shown = book.view === 'dishes' ? dishes.length : menus.length
  const filtering = book.query.trim() !== '' || course !== null

  return (
    <Screen tabs>
      <AwningHeader title={c.book.title}>
        <div className="mt-4">
          <Segmented
            label={c.book.viewLabel}
            value={book.view}
            onChange={(view) => setBook({ view, scroll: 0 })}
            options={[
              { value: 'dishes', label: c.book.dishes },
              { value: 'menus', label: c.book.menus },
            ]}
          />
        </div>
      </AwningHeader>

      <main className="app-column flex flex-col gap-4 px-4 pt-5">
        {!ready ? (
          <SteamLoader />
        ) : total === 0 ? (
          book.view === 'dishes' ? (
            <EmptyState title={c.book.emptyTitle} body={c.book.emptyBody} action={<Button onClick={() => navigate('/recipes/new')}>{c.book.emptyAction}</Button>} />
          ) : (
            <EmptyState title={c.book.menusEmptyTitle} body={c.book.menusEmptyBody} action={<Button onClick={() => navigate('/menus/new')}>{c.book.menusEmptyAction}</Button>} />
          )
        ) : (
          <>
            <SearchField
              label={c.book.searchLabel}
              placeholder={book.view === 'dishes' ? c.book.searchDishes : c.book.searchMenus}
              value={book.query}
              onChange={(query) => setBook({ query })}
              clearLabel={c.book.clearSearch}
            />

            {book.view === 'dishes' && courses.length > 1 && (
              <div role="group" aria-label={c.book.filterLabel} className="-mx-4 -my-1 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none]">
                <Chip selected={course === null} onClick={() => setBook({ course: null })}>
                  {c.book.all}
                </Chip>
                {courses.map((option) => (
                  <Chip key={option} selected={course === option} onClick={() => setBook({ course: course === option ? null : option })}>
                    {t.courses[option]}
                  </Chip>
                ))}
              </div>
            )}

            <div className="-my-1.5 flex items-center justify-between gap-3 pl-1">
              <p className="text-xs font-bold text-ink-soft" aria-live="polite" data-testid="result-count">
                {book.view === 'dishes' ? c.book.dishCount(shown) : c.book.menuCount(shown)}
              </p>
              <SortControl sort={sort} options={sortOptions} onChange={(next) => setBook({ sort: next })} />
            </div>

            {shown === 0 ? (
              <EmptyState
                mood="happy"
                title={c.book.noMatchTitle}
                body={c.book.noMatchBody}
                action={
                  filtering ? (
                    <Button variant="secondary" onClick={() => setBook({ query: '', course: null })}>
                      {c.book.noMatchAction}
                    </Button>
                  ) : undefined
                }
              />
            ) : book.view === 'dishes' ? (
              <ul className="flex flex-col gap-3">
                {dishes.map((dish) => (
                  <li key={dish.id}>
                    <DishCard dish={dish} query={book.query} />
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="flex flex-col gap-3">
                {menus.map((menu) => (
                  <li key={menu.id}>
                    <MenuCard menu={menu} dishes={dishById} />
                  </li>
                ))}
              </ul>
            )}

            {archivedCount > 0 && (
              <Card pad={false} className="px-4 py-1">
                <Toggle label={c.book.showArchived(archivedCount)} checked={book.showArchived} onChange={(showArchived) => setBook({ showArchived })} />
              </Card>
            )}
          </>
        )}
      </main>
    </Screen>
  )
}
