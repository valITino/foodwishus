// "What shall it be?": one slot of the calendar and everything that could go into it.
// Wishes come first, then the whole recipe book, so a meal that is decided on the spot
// needs no wish first. A name nobody knows yet becomes a new dish with one tap.

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { navigate } from '../../app/router'
import { createDish, planServing, proposeServing } from '../../data/actions'
import type { Day, ID, Serving, Slot } from '../../data/types'
import { useCopy, useT } from '../../i18n'
import { zurichHour } from '../../lib/dates'
import { Button, DishThumb, EmptyState, HeartMeter, Sheet, Tag, toast } from '../../ui/components'
import { normalize } from '../recipes/logic'
import { SearchField } from '../recipes/parts'
import { planningCopy } from './copy'
import { defaultCook, mealChoices, nameMatches, slotForNow } from './logic'
import { MealThumb, nameOf, SlotChips, useKitchen, useMealInfo, useWhen, type Kitchen } from './shared'

export interface PickTarget {
  day: Day
  slot: Slot
}

interface Props {
  target: PickTarget | null
  open: boolean
  kitchen: Kitchen
  onClose: () => void
  /** Offer the four meals of the day to choose from: for "a meal for today", where the slot is only a guess. */
  slotChoice?: boolean
  /** Called with the meal that went onto the calendar. */
  onPlanned?: (servingId: ID) => void
}

const option = 'flex w-full items-center gap-3 rounded-card border-[1.5px] border-line-strong bg-surface p-3 text-left active:translate-y-[2px] disabled:opacity-45'

export function MealPicker({ target, open, kitchen, onClose, slotChoice = false, onPlanned }: Props) {
  const t = useT()
  const c = useCopy(planningCopy)
  const when = useWhen(kitchen.today)
  const info = useMealInfo()
  const [query, setQuery] = useState('')
  const [slot, setSlot] = useState<Slot | null>(null)
  const [busy, setBusy] = useState(false)

  // Every opening starts fresh: no old search, no slot from the last time.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setSlot(null)
    setBusy(false)
  }, [open, target?.day, target?.slot])

  const dishes = useMemo(() => [...kitchen.dishes.values()], [kitchen.dishes])
  const menus = useMemo(() => [...kitchen.menus.values()], [kitchen.menus])
  const place = target ? { day: target.day, slot: slot ?? target.slot } : null
  const choices = place ? mealChoices(kitchen.servings, dishes, menus, place) : { open: [], dishes: [], menus: [] }

  const typed = query.trim().replace(/\s+/g, ' ')
  const openMeals = choices.open.map((serving) => ({ serving, meal: info(serving, kitchen) })).filter(({ meal }) => nameMatches(meal.name, typed))
  const bookDishes = choices.dishes.filter((dish) => nameMatches(dish.name, typed))
  const bookMenus = choices.menus.filter((menu) => nameMatches(menu.name, typed))
  const nothingAtAll = choices.open.length + choices.dishes.length + choices.menus.length === 0
  const found = openMeals.length + bookDishes.length + bookMenus.length
  // A dish of exactly this name exists already (it may be hidden because it is on its way): no second one.
  const known = typed !== '' && dishes.some((dish) => normalize(dish.name) === normalize(typed))

  /** Put something into the slot, say so, and close. */
  async function plan(action: (place: PickTarget) => Promise<ID>, said: (words: string) => string) {
    if (!place || busy) return
    setBusy(true)
    try {
      const id = await action(place)
      toast(said(when.atInline(place.day, place.slot)))
      onClose()
      onPlanned?.(id)
    } catch {
      toast(t.common.somethingWrong, 'oops')
      setBusy(false)
    }
  }

  const cook = kitchen.me ? defaultCook(kitchen.me, kitchen.partner) : kitchen.meId

  const pickOpen = (serving: Serving) =>
    plan(
      async ({ day, slot: at }) => {
        await planServing(serving.id, day, at)
        return serving.id
      },
      serving.status === 'planned' ? c.week.moved : c.shared.plannedFor,
    )

  const pickBook = (what: { dishId: ID } | { menuId: ID }) => plan(async (at) => (await proposeServing({ ...what, cookedBy: cook, plan: { date: at.day, slot: at.slot } })).id, c.shared.plannedFor)

  const addNew = () =>
    plan(async (at) => {
      const dish = await createDish({ name: typed.slice(0, 80) })
      return (await proposeServing({ dishId: dish.id, cookedBy: cook, plan: { date: at.day, slot: at.slot } })).id
    }, c.shared.plannedFor)

  const heading = (text: string): ReactNode => <h3 className="mb-2 mt-5 px-1 font-sans text-xs font-extrabold tracking-normal text-ink-soft">{text}</h3>

  return (
    <Sheet open={open} onClose={onClose} title={c.pick.title}>
      {place && (
        <p className="text-sm font-bold text-ink-soft" data-testid="pick-when">
          {when.at(place.day, slotChoice ? null : place.slot, 'long')}
        </p>
      )}
      {place && slotChoice && (
        <div className="mt-2.5">
          <SlotChips label={c.serving.slotLabel} value={place.slot} onChange={setSlot} />
        </div>
      )}

      {nothingAtAll && typed === '' ? (
        <EmptyState
          title={c.pick.emptyTitle}
          body={c.pick.emptyBody}
          action={
            <Button
              onClick={() => {
                onClose()
                navigate('/recipes/new')
              }}
            >
              {c.pick.emptyAction}
            </Button>
          }
        />
      ) : (
        <>
          <div className="mt-4">
            <SearchField label={c.pick.search} placeholder={c.pick.searchPlaceholder} value={query} onChange={setQuery} clearLabel={c.pick.clear} />
          </div>

          {openMeals.length > 0 && (
            <>
              {heading(c.pick.wishes)}
              <ul className="flex flex-col gap-2">
                {openMeals.map(({ serving, meal }) => {
                  const suggested = place !== null && serving.status === 'wishlist' && serving.suggestedDays.includes(place.day)
                  return (
                    <li key={serving.id}>
                      <button type="button" data-testid="wish-option" disabled={busy} onClick={() => void pickOpen(serving)} className={option}>
                        <MealThumb info={meal} seed={serving.id} size={52} />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 text-sm font-extrabold leading-snug">{meal.name}</span>
                          {suggested && (
                            <span className="mt-1 block">
                              <Tag tone="sage">{serving.proposedBy === kitchen.meId ? c.week.suggestedByMe : c.week.suggestedBy(nameOf(kitchen, serving.proposedBy))}</Tag>
                            </span>
                          )}
                          {serving.status === 'planned' && serving.plannedDate && (
                            <span className="mt-1 block">
                              <Tag tone="butter">{c.shared.plannedFor(when.atInline(serving.plannedDate, serving.plannedSlot))}</Tag>
                            </span>
                          )}
                          {serving.note && !suggested && serving.status === 'wishlist' && <span className="block truncate font-script text-xl leading-tight text-rose-ink">{serving.note}</span>}
                        </span>
                        {serving.craving !== null && <HeartMeter value={serving.craving} size={13} showLabel={false} />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          {bookDishes.length + bookMenus.length > 0 && (
            <>
              {heading(c.pick.book)}
              <ul className="flex flex-col gap-2">
                {bookMenus.map((menu) => (
                  <li key={menu.id}>
                    <button type="button" data-testid="book-option" disabled={busy} onClick={() => void pickBook({ menuId: menu.id })} className={option}>
                      <MealThumb info={info({ dishId: null, menuId: menu.id }, kitchen)} seed={menu.id} size={52} />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-sm font-extrabold leading-snug">{menu.name}</span>
                        <span className="block text-xs text-ink-soft">{c.shared.menuCourses(menu.courses.length)}</span>
                      </span>
                    </button>
                  </li>
                ))}
                {bookDishes.map((dish) => (
                  <li key={dish.id}>
                    <button type="button" data-testid="book-option" disabled={busy} onClick={() => void pickBook({ dishId: dish.id })} className={option}>
                      <DishThumb dish={dish} size={52} />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-sm font-extrabold leading-snug">{dish.name}</span>
                        <span className="block text-xs text-ink-soft">{t.courses[dish.course]}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {typed !== '' && found === 0 && <p className="mt-5 px-1 text-sm text-ink-soft">{c.pick.none(typed)}</p>}

          {typed !== '' && !known && (
            <Button variant="secondary" block className="mt-4" disabled={busy} onClick={() => void addNew()}>
              {c.pick.addNew(typed)}
            </Button>
          )}
          <div className="h-2" />
        </>
      )}
    </Sheet>
  )
}

/**
 * "A meal for today": the same choice, for today and the next meal of the day, and then
 * straight to the meal's page, where "Served" and the proof photo are one tap away.
 */
export function TodayPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const kitchen = useKitchen()
  // The guess is made when the sheet opens, not when the app started this morning.
  const [slot, setSlot] = useState<Slot>(() => slotForNow(zurichHour()))
  useEffect(() => {
    if (open) setSlot(slotForNow(zurichHour()))
  }, [open])
  if (!kitchen) return null
  return <MealPicker target={{ day: kitchen.today, slot }} open={open} kitchen={kitchen} onClose={onClose} slotChoice onPlanned={(id) => navigate(`/serving/${id}`)} />
}
