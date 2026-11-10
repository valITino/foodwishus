// Proposing: send a dish or a menu to the wishlist, with a note and a few good days.

import { useState } from 'react'
import { navigate } from '../../app/router'
import { proposeServing } from '../../data/actions'
import type { Day, ID } from '../../data/types'
import { useCopy, useT } from '../../i18n'
import { Button, Card, EmptyState, PageHeader, Screen, Segmented, Tag, TextArea, toast } from '../../ui/components'
import { planningCopy } from './copy'
import { defaultCook, isOpen, nextDays } from './logic'
import { DayStrip, MealThumb, StickyFooter, useKitchen, useMealInfo } from './shared'

export function ProposeScreen({ kind, id }: { kind: 'dish' | 'menu'; id: ID }) {
  const t = useT()
  const c = useCopy(planningCopy)
  const kitchen = useKitchen()
  const mealInfo = useMealInfo()
  const [note, setNote] = useState('')
  const [days, setDays] = useState<Day[]>([])
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

  async function propose() {
    setBusy(true)
    try {
      await proposeServing({
        ...(kind === 'dish' ? { dishId: id } : { menuId: id }),
        note,
        suggestedDays: [...days].sort(),
        cookedBy: chosenCook,
      })
      toast(c.propose.proposed)
      navigate('/wishlist', { replace: true })
    } catch {
      toast(t.common.somethingWrong, 'oops')
      setBusy(false)
    }
  }

  return (
    <Screen>
      <PageHeader title={title} backTo={backTo} />
      <main className="app-column flex flex-col gap-6 px-4 pb-24 pt-4">
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

        <TextArea label={c.propose.noteLabel(partnerName)} placeholder={c.propose.notePlaceholder} value={note} maxLength={140} onChange={(event) => setNote(event.target.value)} />

        <div>
          <p className="text-xs font-extrabold">{c.propose.daysLabel}</p>
          <p className="text-xs text-ink-soft">{c.propose.daysHint}</p>
          <DayStrip
            label={c.propose.daysLabel}
            days={nextDays(kitchen.today, 7)}
            selected={days}
            today={kitchen.today}
            onToggle={(day) => setDays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day]))}
          />
        </div>

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
        <Button size="lg" block disabled={busy} onClick={() => void propose()}>
          {t.actions.propose}
        </Button>
      </StickyFooter>
    </Screen>
  )
}
