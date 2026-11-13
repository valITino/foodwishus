// "What shall it be?": one slot of the calendar and everything that could go into it.
// Wishes come first, then the whole recipe book, so a meal that is decided on the spot
// needs no wish first. A name nobody knows yet becomes a new dish with one tap.
//
// The same list answers two more questions: "What was on the table?" for a meal that is
// logged afterwards (LogPicker, below), and "What is on the plate?" for a photo that came
// before anything else (the plate sheet of the review feature).

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { navigate } from '../../app/router'
import { createDish, logMeal, planServing, proposeServing } from '../../data/actions'
import type { Day, Dish, ID, Menu, Serving, Slot } from '../../data/types'
import { useCopy, useLang, useT } from '../../i18n'
import { formatDay, zurichHour } from '../../lib/dates'
import { Button, DishThumb, EmptyState, HeartMeter, Segmented, Sheet, Tag, toast } from '../../ui/components'
import { normalize } from '../recipes/logic'
import { SearchField } from '../recipes/parts'
import { planningCopy } from './copy'
import { defaultCook, logChoices, mealChoices, nameMatches, slotForNow, slotToLog, tableMoment, type MealChoices } from './logic'
import { MealThumb, nameOf, PastDayChoice, SlotChips, useKitchen, useMealInfo, useWhen, type Kitchen } from './shared'

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

/** What was tapped in the list: a meal that is on its way, something from the recipe book, or a name nobody knows yet. */
export type MealPick = { serving: Serving } | { dishId: ID } | { menuId: ID } | { newName: string }

interface MealOptionsProps {
  kitchen: Kitchen
  choices: MealChoices<Dish, Menu>
  /** The day the choice is for: a wish that was hoped for on it says so. */
  day?: Day | null
  /** The heading over the meals that are on their way already. */
  openLabel: string
  busy: boolean
  onPick: (pick: MealPick) => void
  /** The recipe book is empty: called before "Add the first dish" leaves for the dish form. */
  onLeave: () => void
}

/** The search field and everything it finds: meals on their way, the recipe book, and a new name. */
export function MealOptions({ kitchen, choices, day = null, openLabel, busy, onPick, onLeave }: MealOptionsProps) {
  const t = useT()
  const c = useCopy(planningCopy)
  const when = useWhen(kitchen.today)
  const info = useMealInfo()
  const [query, setQuery] = useState('')

  const typed = query.trim().replace(/\s+/g, ' ')
  const openMeals = choices.open.map((serving) => ({ serving, meal: info(serving, kitchen) })).filter(({ meal }) => nameMatches(meal.name, typed))
  const bookDishes = choices.dishes.filter((dish) => nameMatches(dish.name, typed))
  const bookMenus = choices.menus.filter((menu) => nameMatches(menu.name, typed))
  const nothingAtAll = choices.open.length + choices.dishes.length + choices.menus.length === 0
  const found = openMeals.length + bookDishes.length + bookMenus.length
  // A dish of exactly this name exists already (it may be hidden because it is on its way): no second one.
  const known = typed !== '' && [...kitchen.dishes.values()].some((dish) => normalize(dish.name) === normalize(typed))

  const heading = (text: string): ReactNode => <h3 className="mb-2 mt-5 px-1 font-sans text-xs font-extrabold tracking-normal text-ink-soft">{text}</h3>

  if (nothingAtAll && typed === '') {
    return (
      <EmptyState
        title={c.pick.emptyTitle}
        body={c.pick.emptyBody}
        action={
          <Button
            onClick={() => {
              onLeave()
              navigate('/recipes/new')
            }}
          >
            {c.pick.emptyAction}
          </Button>
        }
      />
    )
  }

  return (
    <>
      <div className="mt-4">
        <SearchField label={c.pick.search} placeholder={c.pick.searchPlaceholder} value={query} onChange={setQuery} clearLabel={c.pick.clear} />
      </div>

      {openMeals.length > 0 && (
        <>
          {heading(openLabel)}
          <ul className="flex flex-col gap-2">
            {openMeals.map(({ serving, meal }) => {
              const suggested = day !== null && serving.status === 'wishlist' && serving.suggestedDays.includes(day)
              return (
                <li key={serving.id}>
                  <button type="button" data-testid="wish-option" disabled={busy} onClick={() => onPick({ serving })} className={option}>
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
                      {serving.status === 'served' && (
                        <span className="mt-1 block">
                          <Tag tone="butter">{t.status.served}</Tag>
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
                <button type="button" data-testid="book-option" disabled={busy} onClick={() => onPick({ menuId: menu.id })} className={option}>
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
                <button type="button" data-testid="book-option" disabled={busy} onClick={() => onPick({ dishId: dish.id })} className={option}>
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
        <Button variant="secondary" block className="mt-4" disabled={busy} onClick={() => onPick({ newName: typed.slice(0, 80) })}>
          {c.pick.addNew(typed)}
        </Button>
      )}
      <div className="h-2" />
    </>
  )
}

/** The kitchen's dishes and menus as lists, the way the choices want them. */
export function useBook(kitchen: Kitchen): { dishes: Dish[]; menus: Menu[] } {
  const dishes = useMemo(() => [...kitchen.dishes.values()], [kitchen.dishes])
  const menus = useMemo(() => [...kitchen.menus.values()], [kitchen.menus])
  return { dishes, menus }
}

export function MealPicker({ target, open, kitchen, onClose, slotChoice = false, onPlanned }: Props) {
  const t = useT()
  const c = useCopy(planningCopy)
  const when = useWhen(kitchen.today)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [busy, setBusy] = useState(false)

  // Every opening starts fresh: no slot from the last time. (The search empties itself: the list is new each time.)
  useEffect(() => {
    if (!open) return
    setSlot(null)
    setBusy(false)
  }, [open, target?.day, target?.slot])

  const { dishes, menus } = useBook(kitchen)
  const place = target ? { day: target.day, slot: slot ?? target.slot } : null
  const choices = place ? mealChoices(kitchen.servings, dishes, menus, place) : { open: [], dishes: [], menus: [] }

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

  function pick(picked: MealPick) {
    if ('serving' in picked) {
      const { serving } = picked
      return plan(
        async ({ day, slot: at }) => {
          await planServing(serving.id, day, at)
          return serving.id
        },
        serving.status === 'planned' ? c.week.moved : c.shared.plannedFor,
      )
    }
    return plan(async (at) => {
      const what = 'newName' in picked ? { dishId: (await createDish({ name: picked.newName })).id } : picked
      return (await proposeServing({ ...what, cookedBy: cook, plan: { date: at.day, slot: at.slot } })).id
    }, c.shared.plannedFor)
  }

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
      <MealOptions kitchen={kitchen} choices={choices} day={place?.day} openLabel={c.pick.wishes} busy={busy} onPick={(picked) => void pick(picked)} onLeave={onClose} />
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

// ----------------------------------------------------------------- logging --

interface LogPickerProps {
  open: boolean
  onClose: () => void
  kitchen: Kitchen
  /** A day that is settled already (a past day tapped in Our Week). Without it the day is chosen here. */
  day?: Day | null
  /** Called with the meal that was logged. */
  onLogged?: (servingId: ID) => void
}

/**
 * "What was on the table?": a meal that was eaten without anybody entering it. The day
 * (today or any day before), the meal of the day and who cooked are asked first; a tap
 * on a dish then logs it. From there it waits for the Taster's proof on its own day.
 */
export function LogPicker({ open, onClose, kitchen, day: fixedDay = null, onLogged }: LogPickerProps) {
  const t = useT()
  const lang = useLang()
  const c = useCopy(planningCopy)
  const when = useWhen(kitchen.today)
  const [chosenDay, setChosenDay] = useState<Day | null>(null)
  const [chosenSlot, setChosenSlot] = useState<Slot | null>(null)
  const [chosenCook, setChosenCook] = useState<ID | null>(null)
  const [busy, setBusy] = useState(false)

  // Every opening starts fresh.
  useEffect(() => {
    if (!open) return
    setChosenDay(null)
    setChosenSlot(null)
    setChosenCook(null)
    setBusy(false)
  }, [open, fixedDay])

  const { dishes, menus } = useBook(kitchen)
  const day = fixedDay ?? chosenDay ?? kitchen.today
  const slot = chosenSlot ?? slotToLog(day, kitchen.today, zurichHour())
  const { partner, me, meId } = kitchen
  const cook = chosenCook ?? (me ? defaultCook(me, partner) : meId)
  const choices = logChoices(kitchen.servings, dishes, menus, day)

  async function log(picked: MealPick) {
    if (busy) return
    setBusy(true)
    try {
      const table = { servedAt: tableMoment(day, slot), slot, cookedBy: cook }
      const what = 'serving' in picked ? { servingId: picked.serving.id } : 'newName' in picked ? { dishId: (await createDish({ name: picked.newName })).id } : picked
      const serving = await logMeal({ ...what, ...table })
      toast(c.log.logged(when.atInline(day, slot)))
      onClose()
      onLogged?.(serving.id)
    } catch {
      toast(t.common.somethingWrong, 'oops')
      setBusy(false)
    }
  }

  const label = 'mb-1.5 mt-4 text-xs font-extrabold'

  return (
    <Sheet open={open} onClose={onClose} title={c.log.title}>
      <p className="text-sm text-ink-soft">{c.log.hint}</p>

      {fixedDay ? (
        <p className="mt-3 text-sm font-bold" data-testid="log-when">
          {formatDay(fixedDay, lang, 'full')}
        </p>
      ) : (
        <>
          <p className="mt-4 text-xs font-extrabold">{c.log.dayLabel}</p>
          <PastDayChoice label={c.log.dayLabel} earlierLabel={c.log.earlierDay} today={kitchen.today} chosen={day} onChange={setChosenDay} />
        </>
      )}

      <p className={label}>{c.serving.slotLabel}</p>
      <SlotChips label={c.serving.slotLabel} value={slot} onChange={setChosenSlot} />

      {partner && (
        <>
          <p className={label}>{c.log.cookLabel}</p>
          <Segmented
            label={c.log.cookLabel}
            value={cook}
            options={[
              { value: meId, label: c.propose.me },
              { value: partner.id, label: partner.name },
            ]}
            onChange={setChosenCook}
          />
        </>
      )}

      <MealOptions kitchen={kitchen} choices={choices} day={day} openLabel={c.log.open} busy={busy} onPick={(picked) => void log(picked)} onLeave={onClose} />
    </Sheet>
  )
}

/** "Log a meal" behind the plus button: the day is chosen in the sheet, and the meal's page opens afterwards. */
export function LogSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const kitchen = useKitchen()
  if (!kitchen) return null
  return <LogPicker open={open} onClose={onClose} kitchen={kitchen} onLogged={(id) => navigate(`/serving/${id}`)} />
}
