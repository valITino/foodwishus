// Proposing: send a dish or a menu to the wishlist, with a note and a few good days,
// or put it straight onto the calendar. Either way the day is free: any day from today on.

import { useState } from 'react'
import { navigate } from '../../app/router'
import { proposeServing } from '../../data/actions'
import type { Day, ID, Slot } from '../../data/types'
import { useCopy, useT } from '../../i18n'
import { Button, Card, EmptyState, PageHeader, Screen, Segmented, Tag, TextArea, toast } from '../../ui/components'
import { planningCopy } from './copy'
import { defaultCook, defaultSlot, isOpen } from './logic'
import { DayChoice, MealThumb, SlotChips, StickyFooter, useKitchen, useMealInfo, useWhen } from './shared'

/** A wish waits on the wishlist for its day. A fixed day goes onto the calendar at once. */
type Where = 'wish' | 'day'

export function ProposeScreen({ kind, id }: { kind: 'dish' | 'menu'; id: ID }) {
  const t = useT()
  const c = useCopy(planningCopy)
  const kitchen = useKitchen()
  const mealInfo = useMealInfo()
  const when = useWhen(kitchen?.today ?? '')
  const [where, setWhere] = useState<Where>('wish')
  const [note, setNote] = useState('')
  /** Good days for a wish: as many as you like. */
  const [days, setDays] = useState<Day[]>([])
  /** The one day of a meal that goes straight onto the calendar. */
  const [day, setDay] = useState<Day | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [cook, setCook] = useState<ID | null>(null)
  const [busy, setBusy] = useState(false)

  const title = kind === 'dish' ? c.propose.titleDish : c.propose.titleMenu
  const backTo = kind === 'dish' ? `/recipes/${id}` : `/menus/${id}`

  if (!kitchen) {
    return (
      <Screen>
        <PageHeader title={title} backTo={backTo} />
      </Screen>
    )
  }

  const subject = kind === 'dish' ? { dishId: id, menuId: null } : { dishId: null, menuId: id }
  const info = mealInfo(subject, kitchen)
  if (info.kind === 'gone') {
    return (
      <Screen>
        <PageHeader title={title} backTo="/recipes" />
        <EmptyState title={c.propose.goneTitle} body={c.propose.goneBody} action={<Button onClick={() => navigate('/recipes', { replace: true })}>{c.shared.openRecipes}</Button>} />
      </Screen>
    )
  }

  const { partner, me, meId } = kitchen
  const partnerName = partner?.name ?? ''
  const chosenCook = cook ?? (me ? defaultCook(me, partner) : meId)
  const already = kitchen.servings.some((s) => isOpen(s) && (kind === 'dish' ? s.dishId === id : s.menuId === id))

  const chosenSlot = slot ?? defaultSlot(info.kind === 'dish' ? info.dish?.course : null)
  const what = kind === 'dish' ? { dishId: id } : { menuId: id }

  async function propose() {
    setBusy(true)
    try {
      await proposeServing({ ...what, note, suggestedDays: [...days].sort(), cookedBy: chosenCook })
      toast(c.propose.proposed)
      navigate('/wishlist', { replace: true })
    } catch {
      toast(t.common.somethingWrong, 'oops')
      setBusy(false)
    }
  }

  /** Straight onto the calendar, and on to the meal's page, where the day can still be changed. */
  async function plan() {
    if (!day) return
    setBusy(true)
    try {
      const serving = await proposeServing({ ...what, note, cookedBy: chosenCook, plan: { date: day, slot: chosenSlot } })
      toast(c.shared.plannedFor(when.atInline(day, chosenSlot)))
      navigate(`/serving/${serving.id}`, { replace: true })
    } catch {
      toast(t.common.somethingWrong, 'oops')
      setBusy(false)
    }
  }

  return (
    <Screen>
      <PageHeader title={title} backTo={backTo} />
      <main className="app-column flex flex-col gap-6 px-4 pb-32 pt-4">
        <Card pad={false} className="flex items-center gap-4 p-4">
          <MealThumb info={info} seed={id} size={72} />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg">{info.name}</h2>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {info.kind === 'dish' && info.dish && <Tag>{t.courses[info.dish.course]}</Tag>}
              {info.kind === 'menu' && <Tag>{c.shared.menuCourses(info.courses.length)}</Tag>}
            </div>
            {info.kind === 'menu' && info.courses.length > 0 && <p className="mt-1.5 text-xs text-ink-soft">{info.courses.map((dish) => dish.name).join(', ')}</p>}
          </div>
        </Card>

        {already && <p className="-mt-2 px-1 text-sm text-ink-soft">{c.propose.already}</p>}

        <div>
          <p className="mb-1.5 text-xs font-extrabold">{c.propose.whereLabel}</p>
          <Segmented
            label={c.propose.whereLabel}
            value={where}
            options={[
              { value: 'wish', label: c.propose.where.wish },
              { value: 'day', label: c.propose.where.day },
            ]}
            onChange={setWhere}
          />
          <p className="mt-1.5 text-xs text-ink-soft" data-testid="where-hint">
            {c.propose.whereHint[where]}
          </p>
        </div>

        <TextArea label={c.propose.noteLabel(partnerName)} placeholder={c.propose.notePlaceholder} value={note} maxLength={140} onChange={(event) => setNote(event.target.value)} />

        {where === 'wish' ? (
          <div>
            <p className="text-xs font-extrabold">{c.propose.daysLabel}</p>
            <p className="text-xs text-ink-soft">{c.propose.daysHint}</p>
            <DayChoice many label={c.propose.daysLabel} laterLabel={c.propose.laterDay} today={kitchen.today} chosen={days} onChange={setDays} />
          </div>
        ) : (
          <div>
            <p className="text-xs font-extrabold">{c.serving.dayLabel}</p>
            <DayChoice label={c.serving.dayLabel} laterLabel={c.serving.laterDay} today={kitchen.today} chosen={day ? [day] : []} onChange={(picked) => setDay(picked[0] ?? null)} />
            <p className="mb-2 mt-4 text-xs font-extrabold">{c.serving.slotLabel}</p>
            <SlotChips label={c.serving.slotLabel} value={chosenSlot} onChange={setSlot} />
          </div>
        )}

        {partner && (
          <div>
            <p className="mb-1.5 text-xs font-extrabold">{c.propose.cookLabel}</p>
            <Segmented
              label={c.propose.cookLabel}
              value={chosenCook}
              options={[
                { value: meId, label: c.propose.me },
                { value: partner.id, label: partner.name },
              ]}
              onChange={setCook}
            />
          </div>
        )}
      </main>

      <StickyFooter>
        {where === 'wish' ? (
          <Button size="lg" block disabled={busy} onClick={() => void propose()}>
            {t.actions.propose}
          </Button>
        ) : (
          <>
            <Button size="lg" block disabled={!day || busy} onClick={() => void plan()}>
              {t.actions.plan}
            </Button>
            {!day && <p className="pt-1.5 text-center text-xs text-ink-soft">{c.serving.planHint}</p>}
          </>
        )}
      </StickyFooter>
    </Screen>
  )
}
