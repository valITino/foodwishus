// Our Week: what we eat when. The week by default, the month as an overview.

import { DndContext, DragOverlay, pointerWithin, rectIntersection, useDraggable, useDroppable, type CollisionDetection, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { navigate } from '../../app/router'
import { planServing } from '../../data/actions'
import type { Day, ID, Serving } from '../../data/types'
import { useCopy, useLang, useT } from '../../i18n'
import { addDays, formatDay, monthGrid, weekOf } from '../../lib/dates'
import { AwningHeader, buzz, Card, cx, HeartMeter, IconButton, Screen, Segmented, Tag, toast } from '../../ui/components'
import { Heart } from '../../ui/deco/Deco'
import { Icon } from '../../ui/deco/Icon'
import { planningCopy } from './copy'
import { dayMarks, freeSlots, groupByDayAndSlot, mealsOf, sameMonth, shiftMonth, suggestedFor, type DayPlan } from './logic'
import { MealPicker, type PickTarget } from './MealPicker'
import { MealThumb, nameOf, noTouchMenu, useDragSensors, useKitchen, useMealInfo, useWhen, type Kitchen } from './shared'

type Mode = 'week' | 'month'

type SlotTarget = PickTarget

// Where you were looking, kept while the app stays open: coming back from a meal's page
// should not throw you back to this week.
let remembered: { mode: Mode; anchor: Day | null; selected: Day | null } = { mode: 'week', anchor: null, selected: null }

/** Prefer the day under the finger; fall back to the day the card overlaps most. */
const dayUnderCard: CollisionDetection = (args) => {
  const under = pointerWithin(args)
  return under.length > 0 ? under : rectIntersection(args)
}

// --------------------------------------------------------------- meal rows --

interface MealRowProps {
  serving: Serving
  kitchen: Kitchen
  quiet?: boolean
  lifted?: boolean
}

function MealRow({ serving, kitchen, quiet = false, lifted = false }: MealRowProps) {
  const t = useT()
  const info = useMealInfo()(serving, kitchen)
  const slot = serving.plannedSlot
  return (
    <button
      type="button"
      data-testid="week-meal"
      data-serving={serving.id}
      onClick={() => navigate(`/serving/${serving.id}`)}
      className={cx('flex w-full items-center gap-3 rounded-2xl border p-2 text-left', lifted ? 'border-transparent bg-surface shadow-float' : 'border-line bg-surface')}
    >
      <MealThumb info={info} seed={serving.id} size={44} className={quiet ? 'opacity-70' : undefined} />
      <span className="min-w-0 flex-1">
        {slot && <span className="block text-2xs font-extrabold text-ink-soft">{t.slots[slot]}</span>}
        <span className={cx('line-clamp-2 text-sm font-extrabold leading-snug', quiet && 'text-ink-soft')}>{info.name}</span>
      </span>
      {serving.status === 'eaten' && (
        <span role="img" aria-label={t.status.eaten} className="mr-1 grid size-6 shrink-0 place-items-center rounded-full bg-sage text-on-rose">
          <Icon name="check" size={14} />
        </span>
      )}
      {serving.status === 'served' && <Tag tone="butter">{t.status.served}</Tag>}
      {serving.status === 'planned' && serving.craving !== null && <HeartMeter value={serving.craving} size={13} showLabel={false} />}
    </button>
  )
}

/** A planned meal can be picked up and carried to another day. */
function DraggableMeal(props: MealRowProps) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: props.serving.id })
  return (
    <div ref={setNodeRef} {...listeners} onContextMenu={noTouchMenu} className={cx('touch-manipulation select-none [&_img]:pointer-events-none', isDragging && 'opacity-35')}>
      <MealRow {...props} />
    </div>
  )
}

// ---------------------------------------------------------------- one day --

interface DayCardProps {
  day: Day
  plan: DayPlan
  kitchen: Kitchen
  /** A card is in the air: show where it may land. */
  dragging?: boolean
  draggable?: boolean
  onEmptySlot: (target: SlotTarget) => void
}

function DayCard({ day, plan, kitchen, dragging = false, draggable = false, onEmptySlot }: DayCardProps) {
  const t = useT()
  const lang = useLang()
  const c = useCopy(planningCopy)
  const past = day < kitchen.today
  const isToday = day === kitchen.today
  const { setNodeRef, isOver } = useDroppable({ id: day, disabled: past })
  const info = useMealInfo()
  const meals = mealsOf(plan)
  const free = past ? [] : freeSlots(plan)
  // A wish somebody hoped to eat on this very day: one tap away from being planned.
  const suggestions = past ? [] : suggestedFor(kitchen.servings, day).slice(0, 2)

  return (
    <li
      ref={setNodeRef}
      data-testid="day"
      data-day={day}
      data-over={isOver || undefined}
      aria-current={isToday ? 'date' : undefined}
      className={cx(
        'scroll-mb-40 scroll-mt-4 rounded-card border p-3 transition-colors duration-150',
        past
          ? 'border-line bg-transparent'
          : isOver
            ? 'border-rose-ink bg-blush'
            : dragging
              ? 'border-dashed border-line-strong bg-surface'
              : isToday
                ? 'border-rose-ink bg-surface'
                : 'border-line bg-surface',
      )}
    >
      <div className="flex min-h-7 items-baseline gap-2 px-1">
        <h2 className={cx('text-lg', past && 'text-ink-soft')}>{formatDay(day, lang, 'weekday')}</h2>
        <span className="text-xs font-bold text-ink-soft">{formatDay(day, lang, 'date-short')}</span>
        {isToday && (
          <span className="ml-auto self-center">
            <Tag tone="butter">{t.common.today}</Tag>
          </span>
        )}
      </div>

      {meals.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {meals.map((serving) => (
            <li key={serving.id}>{draggable && serving.status === 'planned' ? <DraggableMeal serving={serving} kitchen={kitchen} quiet={past} /> : <MealRow serving={serving} kitchen={kitchen} quiet={past} />}</li>
          ))}
        </ul>
      )}

      {suggestions.length > 0 && (
        <div className="mt-1.5 flex items-start gap-2 px-1">
          <Heart size={18} className="mt-[13px] shrink-0" />
          <div className="min-w-0 flex-1">
            {suggestions.map((serving) => {
              const dish = info(serving, kitchen).name
              return (
                <button
                  key={serving.id}
                  type="button"
                  data-testid="day-suggestion"
                  onClick={() => navigate(`/serving/${serving.id}?day=${day}`)}
                  className="flex min-h-11 w-full items-center rounded-md text-left text-xs font-bold"
                >
                  <span className="min-w-0 truncate">{serving.proposedBy === kitchen.meId ? c.week.suggestsMine(dish) : c.week.suggests(nameOf(kitchen, serving.proposedBy), dish)}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {free.length > 0 && (
        <div className="mt-2 flex gap-1.5">
          {free.map((slot) => (
            <button
              key={slot}
              type="button"
              data-slot={slot}
              aria-label={c.week.planSlot(c.shared.slotInline[slot], formatDay(day, lang, 'full'))}
              onClick={() => onEmptySlot({ day, slot })}
              className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-[3px] rounded-xl border border-dashed border-line-strong px-0.5 text-2xs font-extrabold text-ink-soft"
            >
              <Icon name="plus" size={10} className="shrink-0" />
              <span className="truncate">{c.week.slotShort[slot]}</span>
            </button>
          ))}
        </div>
      )}
    </li>
  )
}

// --------------------------------------------------------------- week view --

function WeekView({ days, kitchen, onEmptySlot }: { days: Day[]; kitchen: Kitchen; onEmptySlot: (target: SlotTarget) => void }) {
  const t = useT()
  const c = useCopy(planningCopy)
  const when = useWhen(kitchen.today)
  const sensors = useDragSensors()
  const [activeId, setActiveId] = useState<ID | null>(null)
  const plan = groupByDayAndSlot(kitchen.servings, days)
  const active = activeId ? kitchen.servings.find((s) => s.id === activeId) : undefined
  const anyPlanned = days.some((day) => mealsOf(plan[day]).some((s) => s.status === 'planned'))

  function onDragStart(event: DragStartEvent) {
    buzz(14)
    setActiveId(String(event.active.id))
  }

  function onDragEnd(event: DragEndEvent) {
    buzz(8)
    setActiveId(null)
    const day = event.over ? String(event.over.id) : null
    const serving = kitchen.servings.find((s) => s.id === event.active.id)
    if (!day || !serving || serving.plannedDate === day) return
    planServing(serving.id, day, serving.plannedSlot ?? 'dinner')
      .then(() => toast(c.week.moved(when.dayInline(day))))
      .catch(() => toast(t.common.somethingWrong, 'oops'))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={dayUnderCard} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <ol className="flex flex-col gap-2.5" data-testid="week">
        {days.map((day) => (
          <DayCard key={day} day={day} plan={plan[day]} kitchen={kitchen} dragging={activeId !== null} draggable onEmptySlot={onEmptySlot} />
        ))}
      </ol>
      {anyPlanned && <p className="px-2 pt-1 text-center text-xs text-ink-soft">{c.week.dragHint}</p>}
      <DragOverlay dropAnimation={null}>
        {active && (
          <motion.div initial={{ scale: 1, rotate: 0 }} animate={{ scale: 1.04, rotate: -2 }} transition={{ type: 'spring', stiffness: 500, damping: 26 }} data-testid="meal-lifted">
            <MealRow serving={active} kitchen={kitchen} lifted />
          </motion.div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

// -------------------------------------------------------------- month view --

interface MonthViewProps {
  anchor: Day
  selected: Day
  kitchen: Kitchen
  onSelect: (day: Day) => void
  onEmptySlot: (target: SlotTarget) => void
}

function MonthView({ anchor, selected, kitchen, onSelect, onEmptySlot }: MonthViewProps) {
  const lang = useLang()
  const c = useCopy(planningCopy)
  const grid = monthGrid(anchor)
  const plan = groupByDayAndSlot(kitchen.servings, grid.includes(selected) ? grid : [...grid, selected])

  return (
    <>
      <Card pad={false} className="p-2" data-testid="month">
        <div aria-hidden className="grid grid-cols-7 pb-1 text-center text-2xs font-extrabold text-ink-soft">
          {grid.slice(0, 7).map((day) => (
            <span key={day}>{formatDay(day, lang, 'weekday-short')}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5">
          {grid.map((day) => {
            const marks = dayMarks(plan[day])
            const on = day === selected
            const isToday = day === kitchen.today
            const dots = [...Array<'open'>(marks.open).fill('open'), ...Array<'eaten'>(marks.eaten).fill('eaten')].slice(0, 3)
            return (
              <button
                key={day}
                type="button"
                data-day={day}
                aria-pressed={on}
                aria-current={isToday ? 'date' : undefined}
                aria-label={`${formatDay(day, lang, 'full')}: ${c.week.dayMarks(marks.open, marks.eaten)}`}
                onClick={() => onSelect(day)}
                className={cx(
                  'flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl transition-colors duration-150',
                  on ? 'bg-ink text-ground' : sameMonth(day, anchor) ? 'text-ink' : 'text-ink-soft',
                  isToday && !on && 'ring-[1.5px] ring-inset ring-rose-ink',
                )}
              >
                <span className={cx('text-sm tabular leading-none', sameMonth(day, anchor) ? 'font-extrabold' : 'font-semibold')}>{Number(day.slice(8))}</span>
                <span className="flex h-2 items-center gap-0.5">
                  {dots.map((kind, index) => (
                    <span key={index} className={cx('size-[7px] rounded-full', kind === 'eaten' ? 'bg-current' : 'border-[1.5px] border-current')} />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
        <p aria-hidden className="flex justify-center gap-5 pb-1 pt-2 text-2xs font-bold text-ink-soft">
          <span className="flex items-center gap-1.5">
            <span className="size-[7px] rounded-full border-[1.5px] border-current" /> {c.week.legendOpen}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-[7px] rounded-full bg-current" /> {c.week.legendEaten}
          </span>
        </p>
      </Card>

      {/* The day you tapped, opened up. It needs a drag context of its own, though nothing drags here. */}
      <DndContext>
        <ol data-testid="month-day">
          <DayCard day={selected} plan={plan[selected]} kitchen={kitchen} onEmptySlot={onEmptySlot} />
        </ol>
      </DndContext>
    </>
  )
}

// ------------------------------------------------------------------ screen --

export function WeekScreen() {
  const t = useT()
  const lang = useLang()
  const c = useCopy(planningCopy)
  const kitchen = useKitchen()
  const [mode, setMode] = useState<Mode>(remembered.mode)
  /** A day inside the week or month on screen. Null follows today. */
  const [anchor, setAnchor] = useState<Day | null>(remembered.anchor)
  /** The day opened in the month view. Null follows today. */
  const [selected, setSelected] = useState<Day | null>(remembered.selected)
  const [target, setTarget] = useState<SlotTarget | null>(null)
  const [picking, setPicking] = useState(false)
  const list = useRef<HTMLElement>(null)

  useEffect(() => {
    remembered = { mode, anchor, selected }
  }, [mode, anchor, selected])

  const today = kitchen?.today
  const shown = anchor ?? today
  const days = shown ? weekOf(shown) : []
  const weekStart = days[0]
  const showsToday = Boolean(today && shown && (mode === 'week' ? days.includes(today) : sameMonth(shown, today)))

  // Bring today into view when its week opens, without scrolling when it already shows.
  useEffect(() => {
    if (mode === 'week' && showsToday) list.current?.querySelector('[aria-current="date"]')?.scrollIntoView({ block: 'nearest' })
  }, [mode, weekStart, showsToday])

  if (!kitchen || !today || !shown) return <Screen tabs>{null}</Screen>

  const openDay = selected ?? today

  function step(direction: -1 | 1) {
    if (!shown || !today) return
    if (mode === 'week') {
      setAnchor(addDays(shown, 7 * direction))
      return
    }
    const month = shiftMonth(shown, direction)
    setAnchor(month)
    setSelected(sameMonth(month, today) ? today : month)
  }

  function jumpToToday() {
    setAnchor(null)
    setSelected(null)
  }

  function switchMode(next: Mode) {
    // Carry the place across: the month view opens on the week you were in, and back.
    if (next === 'month' && mode === 'week') setSelected(showsToday ? null : days[0])
    if (next === 'week' && mode === 'month') setAnchor(openDay === today ? null : openDay)
    setMode(next)
  }

  const first = days[0]
  const last = days[6]
  const label =
    mode === 'month'
      ? formatDay(shown, lang, 'month')
      : sameMonth(first, last)
        ? c.week.rangeSameMonth(String(Number(first.slice(8))), formatDay(last, lang, 'date-short'))
        : c.week.range(formatDay(first, lang, 'date-short'), formatDay(last, lang, 'date-short'))

  const openSlot = (next: SlotTarget) => {
    setTarget(next)
    setPicking(true)
  }

  return (
    <Screen tabs>
      <AwningHeader
        title={c.week.title}
        action={
          <div className="w-36 shrink-0">
            <Segmented
              label={c.week.viewLabel}
              value={mode}
              options={[
                { value: 'week', label: c.week.views.week },
                { value: 'month', label: c.week.views.month },
              ]}
              onChange={switchMode}
            />
          </div>
        }
      >
        <div className="mt-3 flex items-center gap-1.5">
          <IconButton icon="back" tone="paper" label={mode === 'week' ? c.week.previousWeek : c.week.previousMonth} onClick={() => step(-1)} />
          <p className="min-w-0 flex-1 text-center text-base font-extrabold leading-tight" aria-live="polite" data-testid="week-label">
            {label}
          </p>
          <IconButton icon="next" tone="paper" label={mode === 'week' ? c.week.nextWeek : c.week.nextMonth} onClick={() => step(1)} />
          <button
            type="button"
            aria-label={c.week.jumpToday}
            disabled={showsToday}
            onClick={jumpToToday}
            className="min-h-11 shrink-0 rounded-full border-[1.5px] border-line-strong bg-surface px-3.5 text-xs font-extrabold transition-opacity duration-150 disabled:opacity-40"
          >
            {t.common.today}
          </button>
        </div>
      </AwningHeader>

      <main ref={list} className="app-column flex flex-col gap-3 px-4 pt-4">
        {mode === 'week' ? (
          <WeekView days={days} kitchen={kitchen} onEmptySlot={openSlot} />
        ) : (
          <MonthView anchor={shown} selected={openDay} kitchen={kitchen} onSelect={setSelected} onEmptySlot={openSlot} />
        )}
      </main>

      <MealPicker target={target} open={picking} kitchen={kitchen} onClose={() => setPicking(false)} />
    </Screen>
  )
}
