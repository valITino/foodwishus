// The Wishlist: the Taster's board. Hearts say how much, the order says what first.

import { closestCenter, DndContext, DragOverlay, type Announcements, type DragEndEvent, type DragStartEvent, type Modifier, type UniqueIdentifier } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { navigate } from '../../app/router'
import { moveServing, reviveServing, setCraving } from '../../data/actions'
import type { ID, Serving } from '../../data/types'
import { useCopy, useT } from '../../i18n'
import { AwningHeader, Button, buzz, Card, Chip, cx, EmptyState, HeartMeter, Screen, Tag, toast } from '../../ui/components'
import { Icon } from '../../ui/deco/Icon'
import { planningCopy } from './copy'
import { placeAfterDrag, roleIn, skippedServings, wishlistCards, type WishFilter } from './logic'
import { GripIcon, MealThumb, nameOf, noTouchMenu, TextAction, useDragSensors, useKitchen, useMealInfo, useWhen, type Kitchen } from './shared'

const FILTERS: WishFilter[] = ['all', 'unrated', 'planned']

/** Cards only travel up and down. */
const vertical: Modifier = ({ transform }) => ({ ...transform, x: 0 })

interface WishCardProps {
  serving: Serving
  kitchen: Kitchen
  rank: number
  /** The grip that starts a keyboard drag. */
  handle?: ReactNode
  /** In the air, following the finger. */
  lifted?: boolean
  /** The gap a lifted card leaves behind. */
  ghost?: boolean
}

function WishCard({ serving, kitchen, rank, handle, lifted = false, ghost = false }: WishCardProps) {
  const t = useT()
  const c = useCopy(planningCopy)
  const when = useWhen(kitchen.today)
  const info = useMealInfo()(serving, kitchen)
  const partnerName = kitchen.partner?.name ?? ''
  // The hearts belong to whoever will eat it. Alone in the kitchen, that is you.
  const mine = roleIn(serving, kitchen.meId) === 'taster' || !kitchen.partner
  const proposer = serving.proposedBy === kitchen.meId ? c.wishlist.proposedByMe : nameOf(kitchen, serving.proposedBy) ? c.wishlist.proposedBy(nameOf(kitchen, serving.proposedBy)) : null

  const content = (
    <>
      <div className="flex items-start gap-1">
        <div className="relative flex min-w-0 flex-1 items-start gap-3">
          <span className="relative shrink-0">
            <MealThumb info={info} seed={serving.id} size={64} />
            <span
              role="img"
              aria-label={c.wishlist.rank(rank)}
              className={cx(
                'absolute -left-1.5 -top-1.5 grid size-6 place-items-center rounded-full border border-line text-2xs font-extrabold tabular',
                rank === 1 ? 'bg-butter text-on-rose' : 'bg-surface text-ink',
              )}
            >
              {rank}
            </span>
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="line-clamp-2 text-base font-extrabold leading-snug [overflow-wrap:anywhere]">{info.name}</p>
            {proposer && <p className="text-xs text-ink-soft">{proposer}</p>}
            {serving.note && <p className="mt-0.5 truncate font-script text-[1.35rem] leading-tight text-rose-ink">{serving.note}</p>}
          </div>
          {!lifted && <button type="button" aria-label={c.shared.open(info.name)} className="absolute -inset-1 rounded-2xl" onClick={() => navigate(`/serving/${serving.id}`)} />}
        </div>
        {handle ?? (
          <span className="grid size-11 shrink-0 place-items-center text-ink-soft">
            <GripIcon />
          </span>
        )}
      </div>
      <div className={mine ? 'mt-0.5' : 'mt-2.5 pl-0.5'}>
        {mine ? <HeartMeter value={serving.craving} size={26} showLabel={false} onChange={(value) => void setCraving(serving.id, value)} /> : <HeartMeter value={serving.craving} size={20} showLabel={false} />}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 pl-1">
        <p aria-live="polite" data-testid="craving-words" className={cx('text-xs font-bold', serving.craving ? 'text-rose-ink' : 'text-ink-soft')}>
          {mine
            ? serving.craving
              ? t.craving.levels[serving.craving - 1]
              : t.craving.hint
            : serving.craving
              ? c.shared.cravingOf(partnerName, t.craving.levels[serving.craving - 1])
              : c.shared.notRatedBy(partnerName)}
        </p>
        {serving.status === 'planned' && serving.plannedDate && (
          <Tag tone="butter">
            <Icon name="calendar" size={13} /> {c.shared.plannedFor(when.atInline(serving.plannedDate, serving.plannedSlot))}
          </Tag>
        )}
      </div>
    </>
  )

  // The gap keeps the card's exact size, so the list does not jump while a card is in the air.
  if (ghost) return <div className="rounded-card border border-dashed border-line-strong p-3 [&>*]:invisible">{content}</div>

  return (
    <Card pad={false} raised={lifted} data-testid="wish-card" data-serving={serving.id} className="p-3">
      {content}
    </Card>
  )
}

function SortableWish(props: Omit<WishCardProps, 'handle' | 'ghost' | 'lifted'> & { name: string }) {
  const c = useCopy(planningCopy).wishlist
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: props.serving.id })
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className="touch-manipulation select-none [&_img]:pointer-events-none" onContextMenu={noTouchMenu} {...listeners}>
      <WishCard
        {...props}
        ghost={isDragging}
        handle={
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            aria-label={c.reorder(props.name)}
            className="relative grid size-11 shrink-0 cursor-grab place-items-center rounded-full text-ink-soft"
          >
            <GripIcon />
          </button>
        }
      />
    </li>
  )
}

function SkippedSection({ skipped, kitchen }: { skipped: Serving[]; kitchen: Kitchen }) {
  const c = useCopy(planningCopy)
  const info = useMealInfo()
  const [open, setOpen] = useState(false)
  if (skipped.length === 0) return null

  async function revive(serving: Serving) {
    await reviveServing(serving.id)
    toast(c.shared.backOnWishlist)
  }

  return (
    <section className="mt-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-1 text-sm font-extrabold text-ink-soft"
      >
        {c.wishlist.skippedTitle(skipped.length)}
        <Icon name="next" size={18} className={cx('transition-transform duration-150', open && 'rotate-90')} />
      </button>
      {open && (
        <Card pad={false} className="mt-1 divide-y divide-line">
          {skipped.map((serving) => {
            const meal = info(serving, kitchen)
            return (
              <div key={serving.id} data-testid="skipped-row" className="flex items-start gap-3 p-3">
                <MealThumb info={meal} seed={serving.id} size={44} className="mt-0.5 opacity-70" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-extrabold leading-snug">{meal.name}</p>
                  <p className="text-xs text-ink-soft">{serving.skippedReason ?? c.wishlist.noReason}</p>
                  <TextAction aria-label={c.wishlist.reviveNamed(meal.name)} onClick={() => void revive(serving)}>
                    {c.wishlist.revive}
                  </TextAction>
                </div>
              </div>
            )
          })}
        </Card>
      )}
    </section>
  )
}

export function WishlistScreen() {
  const t = useT()
  const c = useCopy(planningCopy)
  const kitchen = useKitchen()
  const info = useMealInfo()
  const [filter, setFilter] = useState<WishFilter>('all')
  const [activeId, setActiveId] = useState<ID | null>(null)
  // The order right after a drop, shown until the database has caught up.
  const [dropped, setDropped] = useState<ID[] | null>(null)
  const sensors = useDragSensors(sortableKeyboardCoordinates)
  const lastPlace = useRef<UniqueIdentifier | null>(null)
  const calm = useReducedMotion()

  const servings = kitchen?.servings
  useEffect(() => setDropped(null), [servings])

  if (!kitchen || !servings) return <Screen tabs>{null}</Screen>

  const everything = wishlistCards(servings)
  const live = wishlistCards(servings, filter)
  const byId = new Map(live.map((s) => [s.id, s]))
  const liveIds = live.map((s) => s.id)
  const ids = dropped && dropped.length === liveIds.length && dropped.every((id) => byId.has(id)) ? dropped : liveIds
  const cards = ids.map((id) => byId.get(id) as Serving)
  const rankOf = new Map((filter === 'all' ? ids : everything.map((s) => s.id)).map((id, index) => [id, index + 1]))
  const counts: Record<WishFilter, number> = {
    all: everything.length,
    unrated: everything.filter((s) => s.craving === null).length,
    planned: everything.filter((s) => s.status === 'planned').length,
  }
  const names = new Map(live.map((s) => [s.id, info(s, kitchen).name]))
  const nameFor = (id: unknown) => names.get(String(id)) ?? ''
  const active = activeId ? byId.get(activeId) : undefined

  // Read aloud while a card is carried. A place is only announced when it changes, so
  // "Picked up" is not drowned out by the card's own starting place.
  const announcements: Announcements = {
    onDragStart: ({ active: a }) => {
      lastPlace.current = a.id
      return c.wishlist.picked(nameFor(a.id))
    },
    onDragOver: ({ active: a, over }) => {
      if (!over || over.id === lastPlace.current) return undefined
      lastPlace.current = over.id
      return c.wishlist.movedTo(nameFor(a.id), ids.indexOf(String(over.id)) + 1, ids.length)
    },
    onDragEnd: ({ active: a, over }) => (over ? c.wishlist.dropped(nameFor(a.id), ids.indexOf(String(over.id)) + 1) : c.wishlist.cancelled(nameFor(a.id))),
    onDragCancel: ({ active: a }) => c.wishlist.cancelled(nameFor(a.id)),
  }

  function onDragStart(event: DragStartEvent) {
    buzz(14)
    setActiveId(String(event.active.id))
  }

  function onDragEnd(event: DragEndEvent) {
    buzz(8)
    setActiveId(null)
    if (!event.over || !servings) return
    const movedId = String(event.active.id)
    const placement = placeAfterDrag(
      ids,
      servings.map((s) => s.id),
      movedId,
      String(event.over.id),
    )
    if (!placement) return
    setDropped(placement.order)
    moveServing(movedId, placement.beforeId, placement.afterId).catch(() => {
      setDropped(null)
      toast(t.common.somethingWrong, 'oops')
    })
  }

  const hasDishes = kitchen.dishes.size > 0

  return (
    <Screen tabs>
      <AwningHeader title={c.wishlist.title} script={c.wishlist.script} />
      <main className="app-column flex flex-col gap-3 px-4 pt-4">
        {everything.length === 0 ? (
          <Card pad={false} className="mt-1">
            <EmptyState
              title={t.empty.wishlistTitle}
              body={t.empty.wishlistBody}
              action={<Button onClick={() => navigate(hasDishes ? '/recipes' : '/recipes/new')}>{hasDishes ? c.wishlist.emptyActionBook : t.empty.wishlistAction}</Button>}
            />
          </Card>
        ) : (
          <>
            <div role="group" aria-label={c.wishlist.filterLabel} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {FILTERS.map((key) => (
                <Chip key={key} selected={filter === key} onClick={() => setFilter(key)}>
                  {c.wishlist.filters[key]}
                  <span className={cx('tabular', filter === key ? 'opacity-70' : 'text-ink-soft')}>{counts[key]}</span>
                </Chip>
              ))}
            </div>

            {cards.length > 1 && <p className="px-1 text-xs text-ink-soft">{c.wishlist.dragHint}</p>}

            {cards.length === 0 && (
              <p className="px-6 py-8 text-center font-script text-2xl leading-tight text-rose-ink">{filter === 'unrated' ? c.wishlist.noneUnrated : c.wishlist.nonePlanned}</p>
            )}

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[vertical]}
              accessibility={{ announcements, screenReaderInstructions: { draggable: c.wishlist.instructions } }}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragCancel={() => setActiveId(null)}
            >
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <ul className="flex flex-col gap-3" data-testid="wishlist">
                  {cards.map((serving) => (
                    <SortableWish key={serving.id} serving={serving} kitchen={kitchen} rank={rankOf.get(serving.id) ?? 0} name={nameFor(serving.id)} />
                  ))}
                </ul>
              </SortableContext>
              <DragOverlay dropAnimation={calm ? null : undefined}>
                {active && (
                  <motion.div initial={{ scale: 1, rotate: 0 }} animate={{ scale: 1.03, rotate: 1.6 }} transition={{ type: 'spring', stiffness: 500, damping: 26 }} data-testid="wish-lifted">
                    <WishCard serving={active} kitchen={kitchen} rank={rankOf.get(active.id) ?? 0} lifted />
                  </motion.div>
                )}
              </DragOverlay>
            </DndContext>
          </>
        )}

        <SkippedSection skipped={skippedServings(servings)} kitchen={kitchen} />
      </main>
    </Screen>
  )
}
