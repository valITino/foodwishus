// The basket and the pantry on one page: `/basket` and `/basket?view=pantry`.
// The basket is the shopping list the two of them share; the pantry is what is at home.
// Fork connects the two: he checks the plan and suggests what to buy.

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { navigate, type Route } from '../../app/router'
import { clearBought, notePantry, putOnBasket, removeFromBasket, removeFromPantry, tickBasket, updateBasketItem, updatePantryItem, usedUp } from '../../data/actions'
import { useSyncStatus } from '../../data/app'
import { ReadError, sortPantryNotes, type ReadProblem } from '../../data/helper'
import { setPref, usePref } from '../../data/prefs'
import { useBasket, usePantry } from '../../data/queries'
import type { BasketItem, PantryItem } from '../../data/types'
import { useLang, useT } from '../../i18n'
import { formatDay } from '../../lib/dates'
import { Button, Card, cx, EmptyState, Field, IconButton, PageHeader, Screen, Segmented, Sheet, SteamLoader, TextArea, toast, Toggle } from '../../ui/components'
import { Mascot } from '../../ui/deco/Deco'
import { Icon } from '../../ui/deco/Icon'
import { fallbackLine, tellProblemLine, useBasketCopy, type BasketCopy } from './copy'
import { checkPlan, type CheckOutcome } from './fork'
import { groupBasket, parseLines, sortPantry, type Line, type Need } from './logic'

const fieldLook =
  'w-full min-h-13 rounded-field border-[1.5px] border-line-strong bg-surface px-4 text-base font-semibold text-ink placeholder:text-ink-soft placeholder:font-medium focus:border-rose-ink focus:outline-none focus:ring-3 focus:ring-rose/40'

/** The words of a reason Fork gives when he only compared names. */
export function reasonWords(c: BasketCopy, lang: 'en' | 'de'): (need: Need) => string {
  return (need) => c.reason(need.dishName, formatDay(need.day, lang, 'weekday'), need.meals)
}

// --------------------------------------------------------------- adding --

/** One field and a plus: type a thing (or several, with commas) and it is on the list. */
function AddLine({ label, placeholder, hint, button, autoFocus, onAdd }: { label: string; placeholder: string; hint: string; button: string; autoFocus?: boolean; onAdd: (lines: Line[]) => Promise<void> }) {
  const lang = useLang()
  const [text, setText] = useState('')
  const field = useRef<HTMLInputElement>(null)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const lines = parseLines(text, lang)
    if (lines.length === 0) return
    setText('')
    await onAdd(lines)
    // The next thing can be typed right away.
    field.current?.focus()
  }
  return (
    <form onSubmit={(event) => void submit(event)}>
      <label htmlFor="add-line" className="mb-1.5 block px-1 text-xs font-extrabold">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id="add-line"
          ref={field}
          className={fieldLook}
          placeholder={placeholder}
          value={text}
          autoFocus={autoFocus}
          enterKeyHint="done"
          autoComplete="off"
          autoCapitalize="sentences"
          aria-describedby="add-line-hint"
          onChange={(event) => setText(event.target.value)}
        />
        <Button type="submit" className="min-h-13 shrink-0 px-4" aria-label={button} disabled={!text.trim()}>
          <Icon name="plus" size={22} />
        </Button>
      </div>
      <p id="add-line-hint" className="mt-1.5 px-1 text-xs text-ink-soft">
        {hint}
      </p>
    </form>
  )
}

// ------------------------------------------------------------- the basket --

function ItemSheet({ item, onClose }: { item: BasketItem | null; onClose: () => void }) {
  const c = useBasketCopy()
  const t = useT()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const id = item?.id
  useEffect(() => {
    if (!item) return
    setName(item.name)
    setAmount(item.amount ?? '')
    setNote(item.note ?? '')
    // Only when another thing is opened: typing must not be overwritten by a sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  const save = async () => {
    if (item) await updateBasketItem(item.id, { name, amount, note })
    onClose()
  }
  return (
    <Sheet
      open={item !== null}
      onClose={onClose}
      title={c.itemTitle}
      footer={
        <div className="flex items-center gap-3">
          <Button
            variant="quiet"
            onClick={() => {
              if (item) void removeFromBasket([item.id]).then(() => toast(c.removed))
              onClose()
            }}
          >
            {c.remove}
          </Button>
          <Button className="flex-1" onClick={() => void save()}>
            {t.actions.done}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={c.name} value={name} onChange={(event) => setName(event.target.value)} />
        <Field label={c.amount} placeholder={c.amountPlaceholder} value={amount} onChange={(event) => setAmount(event.target.value)} />
        <Field label={c.note} placeholder={c.notePlaceholder} value={note} onChange={(event) => setNote(event.target.value)} />
      </div>
    </Sheet>
  )
}

/** A row of the list: the round tick on the left, the thing itself opens its sheet. */
function BasketRow({ item, onOpen }: { item: BasketItem; onOpen: () => void }) {
  const c = useBasketCopy()
  const bought = item.state === 'bought'
  return (
    <li className="flex items-center border-b border-line last:border-b-0" data-testid={bought ? 'bought-row' : 'basket-row'}>
      <button type="button" aria-label={bought ? c.untick(item.name) : c.tick(item.name)} onClick={() => void tickBasket(item.id, !bought)} className="grid size-13 shrink-0 place-items-center">
        <span className={cx('grid size-6 place-items-center rounded-full border-2', bought ? 'border-rose-ink bg-rose text-on-rose' : 'border-line-strong bg-surface')}>{bought && <Icon name="check" size={14} />}</span>
      </button>
      <button type="button" aria-label={c.edit(item.name)} onClick={onOpen} className="flex min-h-13 min-w-0 flex-1 flex-col justify-center py-2 pr-4 text-left">
        <span className={cx('flex flex-wrap items-baseline gap-x-2', bought && 'text-ink-soft line-through')}>
          <span className="min-w-0 break-words font-extrabold">{item.name}</span>
          {item.amount && <span className="text-sm font-semibold text-ink-soft">{item.amount}</span>}
        </span>
        {item.note && !bought && <span className="break-words text-xs text-ink-soft">{item.note}</span>}
      </button>
    </li>
  )
}

function outcomeLine(c: BasketCopy, outcome: CheckOutcome): string {
  if (outcome.kind === 'no_meals') return c.outcome.noMeals
  if (outcome.by === 'fork') return outcome.count === 0 ? c.outcome.nothing : c.outcome.found(outcome.count)
  return outcome.count === 0 ? c.outcome.plainNothing : c.outcome.plain(outcome.count)
}

/** Fork's corner: one button to have the plan checked, and what came of it. */
function ForkCard() {
  const c = useBasketCopy()
  const lang = useLang()
  const auto = usePref('forkAuto')
  const [checking, setChecking] = useState(false)
  const [outcome, setOutcome] = useState<CheckOutcome | null>(null)
  const check = async () => {
    if (checking) return
    setChecking(true)
    setOutcome(null)
    try {
      const result = await checkPlan(lang, { reason: reasonWords(c, lang) })
      setOutcome(result)
      // What he found stands above this card: bring it into view.
      if (result.kind === 'checked' && result.count > 0) requestAnimationFrame(() => document.getElementById('suggested')?.scrollIntoView({ block: 'start', behavior: 'auto' }))
    } finally {
      setChecking(false)
    }
  }
  return (
    <Card tone="blush" data-testid="fork-card">
      <div className="flex items-center gap-3">
        <Mascot size={44} mood="happy" label="" className="shrink-0" />
        <div className="min-w-0">
          <h2 className="text-base">{c.forkTitle}</h2>
          <p className="text-sm leading-snug">{c.forkBody}</p>
        </div>
      </div>
      {checking ? (
        <SteamLoader label={c.forkChecking} />
      ) : (
        <Button variant="secondary" block className="mt-3" onClick={() => void check()}>
          {c.forkButton}
        </Button>
      )}
      <div role="status" className="text-sm leading-snug">
        {outcome && !checking && (
          <div className="mt-3" data-testid="fork-outcome">
            <p className="font-bold">{outcomeLine(c, outcome)}</p>
            {outcome.kind === 'checked' && outcome.why && <p className="mt-1">{fallbackLine(c, outcome.why)}</p>}
            {outcome.kind === 'checked' && outcome.note && <p className="mt-1">{outcome.note}</p>}
          </div>
        )}
      </div>
      <div className="mt-2 border-t border-line">
        <Toggle label={c.forkAuto} checked={auto} onChange={(on) => setPref('forkAuto', on)} />
      </div>
    </Card>
  )
}

/** More suggestions than this are folded away at first: a long list is not a reason to scroll past the basket. */
const SHOWN_AT_FIRST = 8

function Suggestions({ items }: { items: BasketItem[] }) {
  const c = useBasketCopy()
  const [all, setAll] = useState(false)
  if (items.length === 0) return null
  const shown = all ? items : items.slice(0, SHOWN_AT_FIRST)
  return (
    <section aria-labelledby="suggested-title" id="suggested" className="scroll-mt-20">
      <h2 id="suggested-title" className="mb-2 px-1 text-lg">
        {c.suggestsCount(items.length)}
      </h2>
      <Card pad={false}>
        <ul>
          {shown.map((item) => (
            <li key={item.id} className="flex items-center gap-1 border-b border-line py-2 pl-4 pr-1 last:border-b-0" data-testid="suggestion">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="min-w-0 break-words font-extrabold">{item.name}</span>
                  {item.amount && <span className="text-sm font-semibold text-ink-soft">{item.amount}</span>}
                </p>
                {item.reason && <p className="break-words text-xs leading-snug text-ink-soft">{item.reason}</p>}
              </div>
              <IconButton icon="close" label={c.dismiss(item.name)} onClick={() => void removeFromBasket([item.id])} />
              <IconButton icon="plus" tone="paper" label={c.accept(item.name)} onClick={() => void tickBasket(item.id, false)} />
            </li>
          ))}
        </ul>
        {items.length > shown.length && (
          <div className="border-t border-line px-1">
            <Button variant="quiet" block className="min-h-11" onClick={() => setAll(true)}>
              {c.showAll(items.length)}
            </Button>
          </div>
        )}
      </Card>
      <div className="mt-3 flex gap-3">
        <Button variant="secondary" className="flex-1 px-3" onClick={() => void removeFromBasket(items.map((item) => item.id))}>
          {c.dismissAll}
        </Button>
        <Button variant="secondary" className="flex-1 px-3" onClick={() => void Promise.all(items.map((item) => tickBasket(item.id, false))).then(() => toast(c.added(items.length)))}>
          {c.acceptAll}
        </Button>
      </div>
    </section>
  )
}

function BasketView({ autoFocus }: { autoFocus: boolean }) {
  const c = useBasketCopy()
  const basket = useBasket()
  const status = useSyncStatus()
  const [editing, setEditing] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const groups = useMemo(() => groupBasket(basket ?? []), [basket])

  const add = async (lines: Line[]) => {
    const { added, there } = await putOnBasket(lines)
    if (added > 0) toast(c.added(added))
    else if (there > 0) toast(c.alreadyThere(lines[0].name))
  }
  const clear = async (intoPantry: boolean) => {
    setClearing(false)
    await clearBought({ intoPantry })
    toast(intoPantry ? c.clearedIntoPantry : c.cleared)
  }

  if (basket === undefined) return <SteamLoader />
  return (
    <>
      <AddLine label={c.addLabel} placeholder={c.addPlaceholder} hint={c.addHint} button={c.addButton} autoFocus={autoFocus} onAdd={add} />
      {status.later > 0 && (
        <p className="rounded-card bg-blush px-4 py-3 text-sm leading-snug" data-testid="later-note">
          {c.later}
        </p>
      )}

      <section aria-labelledby="to-buy-title">
        <h2 id="to-buy-title" className="mb-2 px-1 text-lg">
          {c.toBuy}
        </h2>
        {groups.open.length === 0 ? (
          <Card pad={false}>
            <EmptyState mood="happy" title={c.emptyTitle} body={c.emptyBody} />
          </Card>
        ) : (
          <Card pad={false}>
            <ul>
              {groups.open.map((item) => (
                <BasketRow key={item.id} item={item} onOpen={() => setEditing(item.id)} />
              ))}
            </ul>
          </Card>
        )}
      </section>

      <Suggestions items={groups.suggested} />
      <ForkCard />

      {groups.bought.length > 0 && (
        <section aria-labelledby="bought-title">
          <div className="mb-2 flex items-end justify-between gap-3 px-1">
            <h2 id="bought-title" className="text-lg">
              {c.bought}
            </h2>
            <Button variant="quiet" className="min-h-11" onClick={() => setClearing(true)}>
              {c.clear}
            </Button>
          </div>
          <Card pad={false}>
            <ul>
              {groups.bought.map((item) => (
                <BasketRow key={item.id} item={item} onOpen={() => setEditing(item.id)} />
              ))}
            </ul>
          </Card>
        </section>
      )}

      <ItemSheet item={(basket ?? []).find((item) => item.id === editing) ?? null} onClose={() => setEditing(null)} />
      <Sheet
        open={clearing}
        onClose={() => setClearing(false)}
        title={c.clearTitle}
        footer={
          <div className="flex flex-col gap-3 pb-1">
            <Button block onClick={() => void clear(true)}>
              {c.clearIntoPantry}
            </Button>
            <Button block variant="secondary" onClick={() => void clear(false)}>
              {c.clearOnly}
            </Button>
          </div>
        }
      >
        <p>{c.clearBody(groups.bought.length)}</p>
      </Sheet>
    </>
  )
}

// -------------------------------------------------------------- the pantry --

function PantrySheet({ item, onClose }: { item: PantryItem | null; onClose: () => void }) {
  const c = useBasketCopy()
  const t = useT()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const id = item?.id
  useEffect(() => {
    if (!item) return
    setName(item.name)
    setAmount(item.amount ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  return (
    <Sheet
      open={item !== null}
      onClose={onClose}
      title={c.pantryItemTitle}
      footer={
        <div className="flex flex-col gap-3 pb-1">
          <Button
            block
            onClick={() => {
              if (item) void updatePantryItem(item.id, { name, amount })
              onClose()
            }}
          >
            {t.actions.done}
          </Button>
          <Button
            block
            variant="secondary"
            onClick={() => {
              if (item) void usedUp(item.id).then(() => toast(c.usedUpDone(item.name)))
              onClose()
            }}
          >
            {c.usedUp}
          </Button>
          <Button
            block
            variant="quiet"
            onClick={() => {
              if (item) void removeFromPantry(item.id)
              onClose()
            }}
          >
            {c.removeFromPantry}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={c.name} value={name} onChange={(event) => setName(event.target.value)} />
        <Field label={c.left} placeholder={c.leftPlaceholder} value={amount} onChange={(event) => setAmount(event.target.value)} />
      </div>
    </Sheet>
  )
}

/** Write a sentence about what is at home; Fork turns it into pantry lines to look over. */
function TellSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const c = useBasketCopy()
  const lang = useLang()
  const [text, setText] = useState('')
  const [sorting, setSorting] = useState(false)
  const [lines, setLines] = useState<Line[] | null>(null)
  const [problem, setProblem] = useState<ReadProblem | null>(null)
  useEffect(() => {
    if (open) return
    setText('')
    setLines(null)
    setProblem(null)
    setSorting(false)
  }, [open])

  const sort = async () => {
    if (sorting || !text.trim()) return
    setSorting(true)
    setProblem(null)
    try {
      setLines((await sortPantryNotes(text.trim().slice(0, 2000), lang)).lines)
    } catch (error) {
      setProblem(error instanceof ReadError ? error.code : 'helper_down')
    } finally {
      setSorting(false)
    }
  }
  const save = async () => {
    if (!lines || lines.length === 0) return
    const { added, updated } = await notePantry(lines)
    toast(c.noted(added + updated))
    onClose()
  }

  const footer = sorting ? undefined : lines && lines.length > 0 ? (
    <div className="flex flex-col gap-3 pb-1">
      <Button block onClick={() => void save()}>
        {c.tellSave}
      </Button>
      <Button block variant="quiet" onClick={() => setLines(null)}>
        {c.tellAgain}
      </Button>
    </div>
  ) : (
    <Button block onClick={() => void sort()} disabled={!text.trim()}>
      {c.tellSort}
    </Button>
  )

  return (
    <Sheet open={open} onClose={onClose} title={c.tellTitle} footer={footer}>
      {sorting ? (
        <SteamLoader label={c.tellSorting} />
      ) : lines && lines.length > 0 ? (
        <div>
          <p className="mb-2 text-sm font-extrabold">{c.tellResult}</p>
          <ul className="rounded-card border border-line">
            {lines.map((line, index) => (
              <li key={index} className="flex items-center gap-2 border-b border-line py-1 pl-4 pr-1 last:border-b-0" data-testid="told-line">
                <span className="min-w-0 flex-1 break-words">
                  <span className="font-extrabold">{line.name}</span>
                  {line.amount && <span className="ml-2 text-sm font-semibold text-ink-soft">{line.amount}</span>}
                </span>
                <IconButton icon="close" label={c.dismiss(line.name)} onClick={() => setLines(lines.filter((_, at) => at !== index))} />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <TextArea label={c.tellLabel} placeholder={c.tellPlaceholder} rows={4} value={text} maxLength={2000} onChange={(event) => setText(event.target.value)} />
          <div role="alert" className="text-sm leading-snug">
            {problem && <p data-testid="tell-problem">{tellProblemLine(c, problem)}</p>}
            {lines && lines.length === 0 && <p data-testid="tell-problem">{c.tellNothing}</p>}
          </div>
        </div>
      )}
    </Sheet>
  )
}

function PantryView() {
  const c = useBasketCopy()
  const lang = useLang()
  const pantry = usePantry()
  const status = useSyncStatus()
  const [editing, setEditing] = useState<string | null>(null)
  const [telling, setTelling] = useState(false)
  const sorted = useMemo(() => sortPantry(pantry ?? [], lang), [pantry, lang])
  const now = Date.now()

  const add = async (lines: Line[]) => {
    const { added, updated } = await notePantry(lines)
    toast(c.noted(added + updated))
  }

  if (pantry === undefined) return <SteamLoader />
  return (
    <>
      <AddLine label={c.pantryAddLabel} placeholder={c.pantryPlaceholder} hint={c.pantryHint} button={c.addButton} onAdd={add} />
      <Button variant="secondary" block onClick={() => setTelling(true)}>
        {c.tell}
      </Button>
      {status.later > 0 && (
        <p className="rounded-card bg-blush px-4 py-3 text-sm leading-snug" data-testid="later-note">
          {c.later}
        </p>
      )}

      {sorted.length === 0 ? (
        <Card pad={false}>
          <EmptyState title={c.pantryEmptyTitle} body={c.pantryEmptyBody} />
        </Card>
      ) : (
        <section aria-labelledby="pantry-title">
          <h2 id="pantry-title" className="mb-2 px-1 text-lg">
            {c.pantryCount(sorted.length)}
          </h2>
          <Card pad={false}>
            <ul>
              {sorted.map((item) => {
                const days = Math.max(0, Math.floor((now - new Date(item.updatedAt).getTime()) / 86_400_000))
                return (
                  <li key={item.id} className="border-b border-line last:border-b-0" data-testid="pantry-row">
                    <button type="button" aria-label={c.editPantry(item.name)} onClick={() => setEditing(item.id)} className="flex min-h-13 w-full flex-col justify-center px-4 py-2 text-left">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="min-w-0 break-words font-extrabold">{item.name}</span>
                        <span className="text-sm font-semibold text-ink-soft">{item.amount ?? c.noAmount}</span>
                      </span>
                      <span className="text-xs text-ink-soft">{c.notedAgo(days)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Card>
        </section>
      )}

      <PantrySheet item={sorted.find((item) => item.id === editing) ?? null} onClose={() => setEditing(null)} />
      <TellSheet open={telling} onClose={() => setTelling(false)} />
    </>
  )
}

// ---------------------------------------------------------------- the page --

export function BasketScreen({ route }: { route: Route }) {
  const c = useBasketCopy()
  const view = route.query.get('view') === 'pantry' ? 'pantry' : 'basket'
  return (
    <Screen>
      <PageHeader title={c.title} backTo="/" />
      <main className="app-column flex flex-col gap-5 px-4 pb-16 pt-4">
        <Segmented
          label={c.views}
          value={view}
          options={[
            { value: 'basket', label: c.basket },
            { value: 'pantry', label: c.pantry },
          ]}
          onChange={(next) => navigate(next === 'pantry' ? '/basket?view=pantry' : '/basket', { replace: true })}
        />
        {view === 'basket' ? <BasketView autoFocus={route.query.get('add') === '1'} /> : <PantryView />}
      </main>
    </Screen>
  )
}
