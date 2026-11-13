// Today: what is on the table, what is planned, what comes next.

import { useState } from 'react'
import { navigate } from '../../app/router'
import { quoteOfTheDay } from '../../content/quotes'
import { markServed } from '../../data/actions'
import { useSyncStatus } from '../../data/app'
import type { Serving } from '../../data/types'
import { useCopy, useLang, useT } from '../../i18n'
import { zurichHour } from '../../lib/dates'
import { AwningHeader, Avatar, Button, Card, EmptyState, HeartMeter, Screen, Stat, StatusBubble, SyncPill, Tag, toast } from '../../ui/components'
import { Mascot } from '../../ui/deco/Deco'
import { Icon } from '../../ui/deco/Icon'
import { ForkButton } from '../assistant'
import { BasketButton } from '../basket'
import { Bell } from '../news'
import { EarlyProof, EatenToday, PhotoWallCard, usePlate } from '../review'
import { planningCopy } from './copy'
import { cookOf, currentStreak, dayPart, eatenDay, eatenInWeek, isOpen, onTheTable, plannedFor, roleIn, upNext, waitsSince } from './logic'
import { TodayPicker } from './MealPicker'
import { MealThumb, nameOf, NoteBox, TextAction, useKitchen, useMealInfo, useWhen, type Kitchen } from './shared'

const openServing = (serving: Serving) => navigate(`/serving/${serving.id}`)

function noteLabel(serving: Serving, kitchen: Kitchen, c: (typeof planningCopy)['en']['shared']): string {
  if (serving.proposedBy === kitchen.meId) return c.noteMine
  const author = nameOf(kitchen, serving.proposedBy)
  return author ? c.noteFrom(author) : c.noteMine
}

/** "Dinner is served": pulsing for the Taster who owes the proof, calm for the cook. */
function ServedCard({ serving, kitchen, main }: { serving: Serving; kitchen: Kitchen; main: boolean }) {
  const t = useT()
  const c = useCopy(planningCopy)
  const info = useMealInfo()(serving, kitchen)
  const when = useWhen(kitchen.today)
  const taster = roleIn(serving, kitchen.meId) === 'taster'
  const partnerName = kitchen.partner?.name ?? ''
  // On the table since a day that is over: logged afterwards, or the proof was never taken. Nothing is being served now.
  const since = waitsSince(serving, kitchen.today)

  let title: string
  let body: string
  if (since) {
    title = c.today.lateTitle
    body = taster ? c.today.lateForTaster(info.name) : c.today.lateForCook(info.name, partnerName)
  } else {
    title = serving.plannedSlot ? c.today.servedTitle[serving.plannedSlot] : c.today.servedTitlePlain
    body = taster ? c.today.servedForTaster(info.name) : c.today.servedForCook(info.name, partnerName)
  }

  return (
    <Card
      tone="paper"
      raised
      pad={false}
      data-testid="served-card"
      className="relative"
      style={taster ? { animation: 'soft-pulse 2.4s ease-in-out infinite' } : undefined}
    >
      <div className="flex gap-3 p-4 pb-3">
        <div className="min-w-0 flex-1">
          {(since || serving.plannedSlot) && (
            <Tag tone="butter">
              <Icon name="clock" size={13} /> {since ? when.at(since, serving.plannedSlot) : serving.plannedSlot ? t.slots[serving.plannedSlot] : null}
            </Tag>
          )}
          <h2 className="mt-2 text-xl">{title}</h2>
          <p className="mt-1 text-sm text-ink-soft">{body}</p>
        </div>
        <Mascot size={74} mood={taster ? 'love' : 'happy'} className="-mr-1 shrink-0" />
      </div>
      {serving.note && <NoteBox className="mx-4 mb-4" label={noteLabel(serving, kitchen, c.shared)} note={serving.note} />}
      <div className="px-4 pb-5">
        {taster ? (
          <Button size="lg" block variant={main ? 'primary' : 'secondary'} icon={<Icon name="camera" size={22} />} onClick={() => navigate(`/review/${serving.id}`)}>
            {t.actions.takeProof}
          </Button>
        ) : (
          <button type="button" onClick={() => openServing(serving)} className="flex min-h-13 w-full items-center gap-3 rounded-2xl bg-blush px-4 py-2.5 text-left">
            <Icon name="clock" size={22} className="shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-extrabold">{c.today.waiting}</span>
              <span className="block text-xs">{c.today.waitingHint(partnerName)}</span>
            </span>
          </button>
        )}
      </div>
    </Card>
  )
}

/** A meal planned for today. The cook gets the "Served" button. */
function HeroCard({ serving, kitchen, main }: { serving: Serving; kitchen: Kitchen; main: boolean }) {
  const t = useT()
  const c = useCopy(planningCopy)
  const info = useMealInfo()(serving, kitchen)
  const [busy, setBusy] = useState(false)
  const cooking = roleIn(serving, kitchen.meId) === 'cook'
  const partnerName = kitchen.partner?.name ?? ''

  async function serve() {
    setBusy(true)
    try {
      await markServed(serving.id)
      toast(t.actions.served)
    } catch {
      toast(t.common.somethingWrong, 'oops')
      setBusy(false)
    }
  }

  return (
    <Card pad={false} data-testid="today-meal">
      <div className="relative flex items-start gap-3 p-4 pb-3">
        <div className="min-w-0 flex-1">
          {serving.plannedSlot && (
            <Tag tone="butter">
              <Icon name="clock" size={13} /> {t.slots[serving.plannedSlot]}
            </Tag>
          )}
          <p className="mt-2 text-xs font-extrabold text-ink-soft">{c.today.onTheMenu}</p>
          <h2 className="text-xl hyphens-auto [overflow-wrap:anywhere]">
            <button type="button" className="rounded-md text-left after:absolute after:inset-0" onClick={() => openServing(serving)}>
              {info.name}
            </button>
          </h2>
          <p className="mt-1 text-sm text-ink-soft">{cooking ? c.today.cookLine(partnerName) : c.today.tasterLine(nameOf(kitchen, cookOf(serving)))}</p>
          {serving.craving !== null && (
            <div className="mt-1.5">
              <HeartMeter value={serving.craving} size={15} showLabel={false} />
            </div>
          )}
        </div>
        <MealThumb info={info} seed={serving.id} size={72} />
      </div>
      {serving.note && <NoteBox className="mx-4 mb-4" label={noteLabel(serving, kitchen, c.shared)} note={serving.note} />}
      {cooking ? (
        <div className="px-4 pb-5">
          <Button size="lg" block variant={main ? 'primary' : 'secondary'} disabled={busy} onClick={() => void serve()}>
            {t.actions.served}
          </Button>
        </div>
      ) : (
        <EarlyProof serving={serving} className="px-4 pb-5" />
      )}
    </Card>
  )
}

function QueueRow({ serving, kitchen }: { serving: Serving; kitchen: Kitchen }) {
  const c = useCopy(planningCopy)
  const when = useWhen(kitchen.today)
  const info = useMealInfo()(serving, kitchen)
  const planned = serving.status === 'planned' && serving.plannedDate
  return (
    <button type="button" onClick={() => openServing(serving)} className="flex w-full items-center gap-3 p-3 text-left">
      <MealThumb info={info} seed={serving.id} size={56} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm font-extrabold leading-snug">{info.name}</span>
        <span className="block text-xs text-ink-soft">{planned ? when.at(planned, serving.plannedSlot) : c.shared.notPlanned}</span>
      </span>
      {serving.craving !== null && <HeartMeter value={serving.craving} size={15} showLabel={false} />}
    </button>
  )
}

export function TodayScreen() {
  const t = useT()
  const lang = useLang()
  const c = useCopy(planningCopy)
  const kitchen = useKitchen()
  const status = useSyncStatus()
  const [picking, setPicking] = useState(false)
  const plate = usePlate('today')

  if (!kitchen) return <Screen tabs>{null}</Screen>

  const { servings, today, me, partner, meId } = kitchen
  const served = onTheTable(servings)
  const planned = plannedFor(servings, today)
  const eaten = servings.filter((s) => eatenDay(s) === today)
  const queue = upNext(servings, today)
  const openCount = servings.filter(isOpen).length
  const wishes = servings.filter((s) => s.status === 'wishlist').length
  const week = eatenInWeek(servings, today)
  const streak = currentStreak(servings, today)

  // One main button per screen: the proof comes first, then "Served", then the invitation.
  const proofId = served.find((s) => roleIn(s, meId) === 'taster')?.id
  const serveId = proofId ? undefined : planned.find((s) => roleIn(s, meId) === 'cook')?.id
  const nothingToday = served.length === 0 && planned.length === 0 && eaten.length === 0

  return (
    <Screen tabs>
      <AwningHeader
        title={c.today.greeting[dayPart(zurichHour())](me?.name ?? '')}
        script={quoteOfTheDay(lang)}
        action={
          <button type="button" aria-label={c.today.settings} onClick={() => navigate('/settings')} className="shrink-0 rounded-full transition-transform duration-100 active:scale-90">
            <Avatar avatar={me?.avatar ?? 'fork'} color={me?.color} size={48} />
          </button>
        }
      >
        <div className="mt-3 flex flex-col items-start gap-3">
          {/* The bell sits under the avatar: top right, without squeezing the greeting. */}
          <div className="flex w-full items-center justify-between gap-3">
            <SyncPill status={status} />
            <span className="flex items-center gap-2">
              <ForkButton />
              <BasketButton />
              <Bell />
            </span>
          </div>
          {partner?.status && <StatusBubble name={partner.name} status={partner.status} avatar={partner.avatar} color={partner.color} />}
        </div>
      </AwningHeader>

      <main className="app-column flex flex-col gap-5 px-4 pt-5">
        {served.map((serving) => (
          <ServedCard key={serving.id} serving={serving} kitchen={kitchen} main={serving.id === proofId} />
        ))}

        {planned.map((serving) => (
          <HeroCard key={serving.id} serving={serving} kitchen={kitchen} main={serving.id === serveId} />
        ))}

        <EatenToday servings={eaten} kitchen={kitchen} />

        {nothingToday && (
          <Card pad={false} data-testid="today-empty">
            <EmptyState
              mood="happy"
              title={c.today.emptyTitle}
              body={wishes > 0 ? c.today.emptyWithWishes : c.today.emptyWithoutWishes}
              action={
                <div className="flex flex-col items-center gap-3">
                  <Button onClick={() => setPicking(true)}>{c.today.emptyAction}</Button>
                  {/* Nothing was planned, and still there is a plate: the photo first, the rest after. */}
                  <Button variant="secondary" icon={<Icon name="camera" size={20} />} onClick={plate.shoot}>
                    {t.addSheet.plate}
                  </Button>
                </div>
              }
            />
          </Card>
        )}

        <section aria-labelledby="next-title">
          <h2 id="next-title" className="mb-2.5 px-1 text-lg">
            {c.today.next}
          </h2>
          {queue.length > 0 ? (
            <Card pad={false} className="divide-y divide-line overflow-hidden" data-testid="up-next">
              {queue.map((serving) => (
                <QueueRow key={serving.id} serving={serving} kitchen={kitchen} />
              ))}
              {openCount - planned.length > queue.length && (
                <button type="button" onClick={() => navigate('/wishlist')} className="flex min-h-12 w-full items-center justify-center px-3 text-sm font-extrabold text-rose-ink">
                  {c.today.wholeWishlist}
                </button>
              )}
            </Card>
          ) : (
            <Card pad={false} className="flex flex-col items-start px-4 pb-1 pt-3">
              <p className="text-sm text-ink-soft">{c.today.nextEmpty}</p>
              <TextAction onClick={() => navigate('/recipes')}>{c.shared.openRecipes}</TextAction>
            </Card>
          )}
        </section>

        <Card tone="blush" pad={false} className="grid grid-cols-2 gap-4 px-5 py-4" data-testid="today-stats">
          <Stat value={week} label={c.today.statWeek(week)} />
          <Stat value={streak} unit={c.today.statDays(streak)} label={c.today.statStreak} />
        </Card>

        <PhotoWallCard kitchen={kitchen} />
      </main>

      <TodayPicker open={picking} onClose={() => setPicking(false)} />
      {plate.parts}
    </Screen>
  )
}
