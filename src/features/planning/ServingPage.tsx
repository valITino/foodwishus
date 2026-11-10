// One meal on its way from wish to plate: note, hearts, planning, skipping, serving.

import { useState } from 'react'
import { back, navigate } from '../../app/router'
import { markServed, planServing, proposeServing, removeServing, reviveServing, setCraving, skipServing, unplanServing, updateServingNote } from '../../data/actions'
import type { Day, ID, Serving, Slot } from '../../data/types'
import { useCopy, useLang, useT } from '../../i18n'
import { formatDay, toDay } from '../../lib/dates'
import { Button, Card, Chip, cx, EmptyState, Field, HeartMeter, PageHeader, Screen, Sheet, TextArea, toast } from '../../ui/components'
import { Heart } from '../../ui/deco/Deco'
import { Icon, type IconName } from '../../ui/deco/Icon'
import { planningCopy } from './copy'
import { canServe, cookOf, defaultSlot, eatenDay, isOpen, linkedDay, nextDays, roleIn, upcomingDays } from './logic'
import { DayStrip, MealThumb, nameOf, NoteBox, SlotChips, TextAction, useKitchen, useMealInfo, useWhen, type Kitchen, type MealInfo } from './shared'

const STATUS_ICON: Record<Serving['status'], IconName> = { wishlist: 'wishlist', planned: 'calendar', served: 'clock', eaten: 'check', skipped: 'close' }

interface PartProps {
  serving: Serving
  kitchen: Kitchen
  info: MealInfo
}

/** Picture, name, where it stands and who does what. */
function Summary({ serving, kitchen, info }: PartProps) {
  const lang = useLang()
  const c = useCopy(planningCopy)
  const when = useWhen(kitchen.today)
  const partnerName = kitchen.partner?.name ?? ''
  const iCook = roleIn(serving, kitchen.meId) === 'cook'
  const mine = serving.proposedBy === kitchen.meId || !kitchen.partner

  let status: string
  if (serving.status === 'wishlist') status = c.serving.wishlistSince(formatDay(toDay(serving.proposedAt), lang, 'date'))
  else if (serving.status === 'planned' && serving.plannedDate) {
    const words = when.atInline(serving.plannedDate, serving.plannedSlot, 'long')
    status = serving.plannedDate < kitchen.today ? c.serving.overdue(words) : c.serving.plannedFor(words)
  } else if (serving.status === 'served') status = iCook ? c.serving.servedCook : c.serving.servedTaster
  else if (serving.status === 'eaten') status = c.serving.eatenOn(formatDay(eatenDay(serving) ?? kitchen.today, lang, 'full'))
  else if (serving.status === 'skipped') status = serving.skippedReason ? c.serving.skippedBecause(serving.skippedReason) : c.serving.skipped
  else status = c.shared.notPlanned

  let people: string
  if (!kitchen.partner) people = c.serving.people.mineICook('')
  else if (mine) people = iCook ? c.serving.people.mineICook(partnerName) : c.serving.people.mineTheyCook(partnerName)
  else people = iCook ? c.serving.people.theirsICook(partnerName) : c.serving.people.theirsTheyCook(partnerName)

  const linkWords = info.kind === 'menu' ? c.serving.menuLink : c.serving.recipeLink

  return (
    <Card pad={false} className="p-4">
      <div className="relative flex items-start gap-3">
        <MealThumb info={info} seed={serving.id} size={72} />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl hyphens-auto [overflow-wrap:anywhere]">{info.name}</h2>
          {info.kind === 'menu' && info.courses.length > 0 && <p className="mt-1 text-xs text-ink-soft">{info.courses.map((dish) => dish.name).join(', ')}</p>}
          {info.link && <p className="mt-1.5 text-sm font-extrabold text-rose-ink underline decoration-2 underline-offset-4">{linkWords}</p>}
        </div>
        {info.link && <button type="button" aria-label={`${linkWords}: ${info.name}`} className="absolute -inset-1 rounded-2xl" onClick={() => navigate(info.link as string)} />}
      </div>
      <p data-testid="serving-status" className="mt-4 flex items-start gap-2.5 rounded-2xl bg-blush px-3.5 py-2.5 text-sm font-bold">
        <Icon name={STATUS_ICON[serving.status]} size={19} className="mt-px shrink-0" />
        <span className="min-w-0">{status}</span>
      </p>
      <p className="mt-2.5 px-0.5 text-sm text-ink-soft">{people}</p>
    </Card>
  )
}

/** Her note to him (or his to her). Whoever proposed the meal can change it. */
function NoteCard({ serving, kitchen }: Omit<PartProps, 'info'>) {
  const t = useT()
  const c = useCopy(planningCopy)
  const [draft, setDraft] = useState<string | null>(null)
  const partnerName = kitchen.partner?.name ?? ''
  const mine = serving.proposedBy === kitchen.meId || serving.proposedBy === null
  const canEdit = mine && isOpen(serving)

  async function save() {
    if (draft === null) return
    await updateServingNote(serving.id, draft)
    setDraft(null)
    toast(t.common.saved)
  }

  if (draft !== null) {
    return (
      <Card pad={false} className="flex flex-col gap-3 p-4">
        <TextArea label={c.serving.noteForPartner(partnerName)} placeholder={c.propose.notePlaceholder} value={draft} maxLength={140} autoFocus onChange={(event) => setDraft(event.target.value)} />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => void save()}>
            {c.serving.saveNote}
          </Button>
          <Button variant="quiet" onClick={() => setDraft(null)}>
            {t.actions.cancel}
          </Button>
        </div>
      </Card>
    )
  }

  if (!serving.note) {
    if (!canEdit) return null
    return (
      <button
        type="button"
        onClick={() => setDraft('')}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-card border-2 border-dashed border-line-strong px-4 text-sm font-extrabold text-rose-ink"
      >
        <Icon name="note" size={20} /> {c.serving.addNote(partnerName)}
      </button>
    )
  }

  const author = nameOf(kitchen, serving.proposedBy)
  return (
    <div>
      <NoteBox label={mine ? c.serving.noteForPartner(partnerName) : author ? c.shared.noteFrom(author) : c.shared.noteMine} note={serving.note} />
      {canEdit && (
        <TextAction className="ml-1.5" onClick={() => setDraft(serving.note ?? '')}>
          {c.serving.editNote}
        </TextAction>
      )}
    </div>
  )
}

/** The hearts belong to whoever eats the meal. The cook watches them fill up. */
function CravingCard({ serving, kitchen }: Omit<PartProps, 'info'>) {
  const t = useT()
  const c = useCopy(planningCopy)
  const taster = roleIn(serving, kitchen.meId) === 'taster' || !kitchen.partner
  const partnerName = kitchen.partner?.name ?? ''

  if (taster && isOpen(serving)) {
    return (
      <Card>
        <p className="mb-1 text-xs font-extrabold">{t.craving.title}</p>
        <HeartMeter value={serving.craving} onChange={(value) => void setCraving(serving.id, value)} />
      </Card>
    )
  }
  if (serving.craving === null && !isOpen(serving)) return null
  return (
    <Card>
      <p className="mb-1.5 text-xs font-extrabold">
        {isOpen(serving) ? (taster ? t.craving.title : c.serving.cravingTheirs(partnerName)) : taster ? c.serving.cravingMinePast : c.serving.cravingTheirsPast(partnerName)}
      </p>
      <HeartMeter value={serving.craving} size={30} showLabel={false} />
      <p className={cx('mt-1 pl-0.5 text-xs font-bold', serving.craving ? 'text-rose-ink' : 'text-ink-soft')}>
        {serving.craving ? t.craving.levels[serving.craving - 1] : c.shared.notRatedBy(partnerName)}
      </p>
    </Card>
  )
}

interface PlannerProps extends PartProps {
  title: string
  /** A day the link asked for, for example a suggestion tapped in Our Week. */
  preferred?: Day | null
  onDone: () => void
  onCancel?: () => void
}

/** Day and slot: the next two weeks as a strip, a date field for anything later. */
function Planner({ serving, kitchen, info, title, preferred, onDone, onCancel }: PlannerProps) {
  const t = useT()
  const c = useCopy(planningCopy)
  const when = useWhen(kitchen.today)
  const strip = nextDays(kitchen.today, 14)
  const suggested = upcomingDays(serving.suggestedDays, kitchen.today)
  const [day, setDay] = useState<Day | null>(preferred ?? (serving.plannedDate && serving.plannedDate >= kitchen.today ? serving.plannedDate : (suggested[0] ?? null)))
  const [slot, setSlot] = useState<Slot>(serving.plannedSlot ?? defaultSlot(info.kind === 'dish' ? info.dish?.course : null))
  const [busy, setBusy] = useState(false)
  const suggester = serving.proposedBy === kitchen.meId ? c.serving.suggestsMine : c.serving.suggests(nameOf(kitchen, serving.proposedBy))

  async function plan() {
    if (!day) return
    setBusy(true)
    try {
      await planServing(serving.id, day, slot)
      toast(c.shared.plannedFor(when.atInline(day, slot)))
      onDone()
    } catch {
      toast(t.common.somethingWrong, 'oops')
    }
    setBusy(false)
  }

  return (
    <Card pad={false} className="p-4" data-testid="planner">
      <h2 className="text-lg">{title}</h2>

      <p className="mt-3 text-xs font-extrabold">{c.serving.dayLabel}</p>
      <DayStrip
        label={c.serving.dayLabel}
        days={strip}
        selected={day ? [day] : []}
        today={kitchen.today}
        marked={suggested}
        markLabel={c.serving.suggestedDay}
        onToggle={setDay}
      />
      {suggested.length > 0 && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-soft">
          <Heart size={16} /> {suggester}
        </p>
      )}

      <Field
        className="mt-4 [[data-theme=dark]_&]:[color-scheme:dark]"
        type="date"
        label={c.serving.laterDay}
        min={kitchen.today}
        value={day && !strip.includes(day) ? day : ''}
        onChange={(event) => {
          const picked = event.target.value
          if (!picked) setDay(null)
          else if (picked >= kitchen.today) setDay(picked)
        }}
      />

      <p className="mb-2 mt-4 text-xs font-extrabold">{c.serving.slotLabel}</p>
      <SlotChips label={c.serving.slotLabel} value={slot} onChange={setSlot} />

      <div className="mt-5 flex flex-col gap-1">
        <Button size="lg" block disabled={!day || busy} onClick={() => void plan()}>
          {t.actions.plan}
        </Button>
        {!day && <p className="pt-1 text-center text-xs text-ink-soft">{c.serving.planHint}</p>}
        {onCancel && (
          <Button variant="quiet" onClick={onCancel}>
            {c.serving.keep}
          </Button>
        )}
      </div>
    </Card>
  )
}

/**
 * M4 (serve and review): the proof photo, the emoji reaction and the review sheet move
 * in here. Until then this is an honest, clearly marked placeholder. Nothing is faked.
 */
function ReservedSpot({ title, body }: { title: string; body: string }) {
  return (
    <div data-reserved="proof-and-review" className="flex flex-col items-center rounded-card border-2 border-dashed border-line-strong px-5 py-6 text-center">
      <Icon name="camera" size={28} className="text-ink-soft" />
      <p className="mt-2 text-sm font-extrabold">{title}</p>
      <p className="mt-1 text-sm text-ink-soft">{body}</p>
    </div>
  )
}

function SkipSheet({ open, name, onClose, onSkip }: { open: boolean; name: string; onClose: () => void; onSkip: (reason: string | undefined) => void }) {
  const c = useCopy(planningCopy).serving
  const [reason, setReason] = useState<keyof typeof c.reasons | null>(null)
  const [other, setOther] = useState('')
  const keys = Object.keys(c.reasons) as (keyof typeof c.reasons)[]

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={c.skipTitle}
      footer={
        <Button size="lg" block onClick={() => onSkip(reason === 'other' ? other : reason ? c.reasons[reason] : undefined)}>
          {c.skipConfirm}
        </Button>
      }
    >
      <p className="text-sm text-ink-soft">{c.skipBody(name)}</p>
      <p className="mb-2 mt-5 text-xs font-extrabold">{c.reasonLabel}</p>
      <div role="group" aria-label={c.reasonLabel} className="flex flex-wrap gap-2">
        {keys.map((key) => (
          <Chip key={key} selected={reason === key} onClick={() => setReason(reason === key ? null : key)}>
            {c.reasons[key]}
          </Chip>
        ))}
      </div>
      {reason === 'other' && <Field className="mt-4" label={c.otherField} placeholder={c.otherPlaceholder} value={other} maxLength={80} onChange={(event) => setOther(event.target.value)} />}
    </Sheet>
  )
}

export function ServingScreen({ id, day }: { id: ID; day?: string | null }) {
  const t = useT()
  const c = useCopy(planningCopy)
  const kitchen = useKitchen()
  const mealInfo = useMealInfo()
  const [changing, setChanging] = useState(false)
  const [sheet, setSheet] = useState<'skip' | 'remove' | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!kitchen || leaving) {
    return (
      <Screen>
        <PageHeader title="" backTo="/wishlist" />
      </Screen>
    )
  }

  const serving = kitchen.servings.find((s) => s.id === id)
  if (!serving) {
    return (
      <Screen>
        <PageHeader title="" backTo="/wishlist" />
        <EmptyState title={c.serving.goneTitle} body={c.serving.goneBody} action={<Button onClick={() => navigate('/wishlist', { replace: true })}>{c.serving.goneAction}</Button>} />
      </Screen>
    )
  }

  const info = mealInfo(serving, kitchen)
  const partnerName = kitchen.partner?.name ?? ''
  const iCook = roleIn(serving, kitchen.meId) === 'cook'
  const serveNow = canServe(serving, kitchen.meId, kitchen.today)
  const part = { serving, kitchen, info }

  /** Run an action, say what happened, and show an error if it did not work. */
  async function act(action: () => Promise<unknown>, done: string) {
    setBusy(true)
    try {
      await action()
      toast(done)
    } catch {
      toast(t.common.somethingWrong, 'oops')
    }
    setBusy(false)
  }

  /** For actions after which this page has nothing left to show. */
  async function actAndLeave(action: () => Promise<unknown>, done: string) {
    setSheet(null)
    setLeaving(true)
    try {
      await action()
      toast(done)
      back('/wishlist')
    } catch {
      setLeaving(false)
      toast(t.common.somethingWrong, 'oops')
    }
  }

  return (
    <Screen>
      <PageHeader title={t.status[serving.status]} backTo="/wishlist" />
      <main className="app-column flex flex-col gap-4 px-4 pt-4">
        <Summary {...part} />

        {serveNow && !changing && (
          <Card pad={false} className="flex flex-col gap-2 p-4">
            <Button size="lg" block disabled={busy} onClick={() => void act(() => markServed(serving.id), t.actions.served)}>
              {t.actions.served}
            </Button>
            <p className="text-center text-xs text-ink-soft">{c.serving.servedHint(partnerName)}</p>
          </Card>
        )}

        {serving.status === 'planned' && !iCook && serving.plannedDate !== null && serving.plannedDate <= kitchen.today && (
          <p className="px-1 text-sm text-ink-soft">{c.serving.waitsForCook(nameOf(kitchen, cookOf(serving)))}</p>
        )}

        {serving.status === 'served' &&
          (iCook && kitchen.partner ? (
            <Card pad={false} className="flex flex-col items-start gap-1 px-4 pb-1.5 pt-4">
              <div className="flex items-center gap-3">
                <Icon name="clock" size={22} className="shrink-0 text-ink-soft" />
                <div>
                  <p className="text-sm font-extrabold">{c.today.waiting}</p>
                  <p className="text-xs text-ink-soft">{c.today.waitingHint(partnerName)}</p>
                </div>
              </div>
              <TextAction disabled={busy} onClick={() => void act(() => planServing(serving.id, serving.plannedDate ?? kitchen.today, serving.plannedSlot ?? 'dinner'), c.serving.undone)}>
                {c.serving.undoServed}
              </TextAction>
            </Card>
          ) : (
            <ReservedSpot title={c.serving.proofTitle} body={c.serving.proofBody} />
          ))}

        {serving.status === 'eaten' && (
          <>
            <ReservedSpot title={c.serving.proofTitle} body={c.serving.reviewBody} />
            <Button
              size="lg"
              block
              disabled={busy}
              onClick={() =>
                void actAndLeave(() => proposeServing({ dishId: serving.dishId ?? undefined, menuId: serving.menuId ?? undefined, cookedBy: cookOf(serving) ?? undefined }), c.shared.backOnWishlist)
              }
            >
              {t.actions.again}
            </Button>
          </>
        )}

        {serving.status === 'skipped' && (
          <Button size="lg" block disabled={busy} onClick={() => void act(() => reviveServing(serving.id), c.shared.backOnWishlist)}>
            {c.serving.revive}
          </Button>
        )}

        <NoteCard serving={serving} kitchen={kitchen} />
        <CravingCard serving={serving} kitchen={kitchen} />

        {serving.status === 'wishlist' && <Planner {...part} title={c.serving.planTitle} preferred={linkedDay(day, kitchen.today)} onDone={() => setChanging(false)} />}

        {serving.status === 'planned' &&
          (changing ? (
            <Planner {...part} title={c.serving.changeTitle} onDone={() => setChanging(false)} onCancel={() => setChanging(false)} />
          ) : (
            <div className="flex flex-col gap-1">
              <Button variant="secondary" block onClick={() => setChanging(true)}>
                {c.serving.change}
              </Button>
              <Button variant="quiet" disabled={busy} onClick={() => void act(() => unplanServing(serving.id), c.shared.backOnWishlist)}>
                {c.serving.unplan}
              </Button>
            </div>
          ))}

        {(isOpen(serving) || serving.status === 'skipped') && (
          <div className="mt-2 flex flex-wrap justify-center gap-x-2 border-t border-line pt-3">
            {isOpen(serving) && (
              <Button variant="quiet" onClick={() => setSheet('skip')}>
                {c.serving.skip}
              </Button>
            )}
            <Button variant="quiet" onClick={() => setSheet('remove')}>
              {t.common.remove}
            </Button>
          </div>
        )}
      </main>

      <SkipSheet open={sheet === 'skip'} name={info.name} onClose={() => setSheet(null)} onSkip={(reason) => void actAndLeave(() => skipServing(serving.id, reason), c.serving.skippedToast)} />

      <Sheet
        open={sheet === 'remove'}
        onClose={() => setSheet(null)}
        title={c.serving.removeTitle(info.name)}
        footer={
          <div className="flex flex-col gap-1">
            <Button size="lg" block onClick={() => void actAndLeave(() => removeServing(serving.id), c.serving.removed)}>
              {t.common.remove}
            </Button>
            <Button variant="quiet" onClick={() => setSheet(null)}>
              {t.actions.cancel}
            </Button>
          </div>
        }
      >
        <p className="text-sm">{c.serving.removeBody}</p>
        {isOpen(serving) && <p className="mt-3 text-sm text-ink-soft">{c.serving.removeHint}</p>}
      </Sheet>
    </Screen>
  )
}
