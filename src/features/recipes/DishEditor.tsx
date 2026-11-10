// The dish form: new dish and edit dish. It is long, so it is cut into titled sections
// with a jump rail on top and the Save button always at the bottom of the screen.

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { back, navigate } from '../../app/router'
import { createDish, updateDish } from '../../data/actions'
import { store } from '../../data/app'
import { usePhotoUrl } from '../../data/hooks'
import { addPhotoFromFile } from '../../data/photos'
import { usePref } from '../../data/prefs'
import { useDish, useDishes } from '../../data/queries'
import type { Course, Dish, Effort, ID, PhotoSource } from '../../data/types'
import { useLang, useT } from '../../i18n'
import { Button, Card, Chip, cx, DishThumb, EmptyState, Field, PageHeader, Screen, Sheet, SteamLoader, Stepper, TextArea, toast, Toggle } from '../../ui/components'
import { DecoIcon, DISH_ICONS } from '../../ui/deco/registry'
import { Icon } from '../../ui/deco/Icon'
import { useRecipesCopy } from './copy'
import {
  addTag,
  changedFields,
  COURSE_ORDER,
  detectTimerMinutes,
  dishInputFromDraft,
  draftFromDish,
  draftKey,
  emptyDraft,
  formatAmount,
  formatDuration,
  formatTimer,
  moveItem,
  parseAmount,
  parseIngredientList,
  parseQuantity,
  quantityInputValue,
  sameValue,
  suggestTags,
  type DishDraft,
  type DraftIngredient,
  type DraftStep,
} from './logic'
import { BottomBar, ConfirmSheet, fieldBox, fieldLook, FormHeader, LineIcon, RoundButton, Section, useScrollTop } from './parts'
import { DragHandle, SortableList } from './Sortable'
import { useLeaveGuard } from './useLeaveGuard'

const EFFORTS: Effort[] = ['easy', 'medium', 'fancy']

/** A picture that was chosen but is only stored once the dish is saved. */
interface PendingPhoto {
  file: File
  url: string
  source: PhotoSource
}

const prefersCalm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

// --------------------------------------------------------------- jump rail --

interface RailSection {
  id: string
  label: string
}

/** The row of section names under the header. Tap one to jump there; it follows along as you scroll. */
function JumpRail({ sections, label }: { sections: RailSection[]; label: string }) {
  const [active, setActive] = useState(sections[0].id)
  const rail = useRef<HTMLDivElement>(null)
  const ids = sections.map((s) => s.id).join(' ')

  useEffect(() => {
    let frame = 0
    const measure = () => {
      frame = 0
      const all = ids.split(' ')
      // A section is "the current one" once its title has come up to just under the rail.
      const line = (rail.current?.getBoundingClientRect().bottom ?? 113) + 32
      let current = all[0]
      for (const id of all) {
        const element = document.getElementById(id)
        if (element && element.getBoundingClientRect().top <= line) current = id
      }
      // The last section is short and can never climb that high: at the very bottom it wins.
      if (window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = all[all.length - 1]
      setActive(current)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [ids])

  useEffect(() => {
    const box = rail.current
    const chip = box?.querySelector<HTMLElement>(`[data-section="${active}"]`)
    if (!box || !chip) return
    box.scrollTo({ left: chip.offsetLeft - (box.clientWidth - chip.offsetWidth) / 2, behavior: prefersCalm() ? 'auto' : 'smooth' })
  }, [active])

  return (
    <nav aria-label={label}>
      <div ref={rail} className="app-column relative flex gap-2 overflow-x-auto px-4 pb-2.5 pt-0.5 [scrollbar-width:none]">
        {sections.map((section) => (
          <span key={section.id} data-section={section.id} className="shrink-0">
            <Chip
              selected={active === section.id}
              onClick={() => document.getElementById(section.id)?.scrollIntoView({ behavior: prefersCalm() ? 'auto' : 'smooth', block: 'start' })}
            >
              {section.label}
            </Chip>
          </span>
        ))}
      </div>
    </nav>
  )
}

// ------------------------------------------------------------------- tags --

function TagsField({ tags, text, onText, onChange, suggestions }: { tags: string[]; text: string; onText: (text: string) => void; onChange: (tags: string[]) => void; suggestions: string[] }) {
  const e = useRecipesCopy().editor
  const commit = () => {
    onChange(addTag(tags, text))
    onText('')
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commit()
    } else if (event.key === 'Backspace' && !text && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }
  return (
    <div>
      <Field
        label={e.tags}
        hint={e.tagsHint}
        placeholder={tags.length ? '' : e.tagsPlaceholder}
        value={text}
        enterKeyHint="done"
        autoCapitalize="words"
        onChange={(event) => (event.target.value.includes(',') ? (onChange(addTag(tags, event.target.value)), onText('')) : onText(event.target.value))}
        onKeyDown={onKeyDown}
        onBlur={() => text.trim() && commit()}
      />
      {tags.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-2" data-testid="tags">
          {tags.map((tag) => (
            <li key={tag}>
              <button
                type="button"
                aria-label={e.removeTag(tag)}
                onClick={() => onChange(tags.filter((other) => other !== tag))}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-ink pl-4 pr-3 text-xs font-bold text-ground"
              >
                {tag}
                <Icon name="close" size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {suggestions.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-bold text-ink-soft">{e.usedBefore}</p>
          <ul className="flex flex-wrap gap-2">
            {suggestions.map((tag) => (
              <li key={tag}>
                <button
                  type="button"
                  aria-label={e.addTag(tag)}
                  onClick={() => onChange(addTag(tags, tag))}
                  className="inline-flex min-h-11 items-center gap-1 rounded-full border-[1.5px] border-dashed border-line-strong pl-3 pr-4 text-xs font-bold text-ink"
                >
                  <Icon name="plus" size={15} />
                  {tag}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- picture --

function FilePicker({ testId, capture, onPick, children }: { testId: string; capture?: boolean; onPick: (file: File) => void; children: (open: () => void) => ReactNode }) {
  const input = useRef<HTMLInputElement>(null)
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onPick(file)
  }
  return (
    <>
      <input ref={input} type="file" accept="image/*" capture={capture ? 'environment' : undefined} onChange={onChange} className="sr-only" tabIndex={-1} aria-hidden data-testid={testId} />
      {children(() => input.current?.click())}
    </>
  )
}

interface PictureProps {
  /** The dish being edited. A new dish has none yet, so its plate colour is not known either. */
  dish: Dish | null
  name: string
  coverPhotoId: ID | null
  pending: PendingPhoto | null
  icon: string | null
  onPhoto: (file: File, source: PhotoSource) => void
  onRemovePhoto: () => void
  onIcon: (icon: string) => void
}

function PictureField({ dish, name, coverPhotoId, pending, icon, onPhoto, onRemovePhoto, onIcon }: PictureProps) {
  const e = useRecipesCopy().editor
  const stored = usePhotoUrl(pending ? null : coverPhotoId, 'thumb')
  const photoUrl = pending?.url ?? stored
  const hasPhoto = Boolean(pending || coverPhotoId)
  return (
    <Card pad={false} className="p-4">
      <div className="flex items-center gap-3">
        {hasPhoto ? (
          photoUrl ? (
            <img src={photoUrl} alt={e.photoAlt} className="size-20 shrink-0 rounded-2xl object-cover" data-testid="cover-preview" />
          ) : (
            <div className="size-20 shrink-0 animate-pulse rounded-2xl bg-blush" />
          )
        ) : dish ? (
          <DishThumb dish={{ id: dish.id, name, coverPhotoId: null, icon }} size={80} />
        ) : (
          <div className="grid size-20 shrink-0 place-items-center rounded-2xl bg-blush">
            <DecoIcon name={icon} size={50} />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <FilePicker testId="photo-camera" capture onPick={(file) => onPhoto(file, 'camera')}>
            {(open) => (
              <Button variant="secondary" block className="whitespace-nowrap px-3" icon={<Icon name="camera" size={20} />} onClick={open}>
                {e.takePhoto}
              </Button>
            )}
          </FilePicker>
          <FilePicker testId="photo-gallery" onPick={(file) => onPhoto(file, 'gallery')}>
            {(open) => (
              <Button variant="secondary" block className="whitespace-nowrap px-3" icon={<LineIcon name="image" size={20} />} onClick={open}>
                {e.fromGallery}
              </Button>
            )}
          </FilePicker>
        </div>
      </div>
      {hasPhoto ? (
        <div className="mt-2 flex justify-end">
          <Button variant="quiet" onClick={onRemovePhoto}>
            {e.removePhoto}
          </Button>
        </div>
      ) : (
        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-2 text-xs font-extrabold" id="icon-choice">
            {e.orIcon}
          </p>
          <div role="radiogroup" aria-labelledby="icon-choice" className="grid grid-cols-4 gap-2.5">
            {DISH_ICONS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={icon === option}
                aria-label={e.icons[option] ?? option}
                onClick={() => onIcon(option)}
                className={cx(
                  'grid h-16 place-items-center rounded-2xl border-[1.5px] transition-colors duration-150',
                  icon === option ? 'border-rose-ink bg-blush ring-2 ring-rose-ink' : 'border-line-strong bg-surface',
                )}
              >
                <DecoIcon name={option} size={38} />
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

// ------------------------------------------------------------ ingredients --

function IngredientSheet({ ingredient, onChange, onRemove, onClose }: { ingredient: DraftIngredient | null; onChange: (next: DraftIngredient) => void; onRemove: () => void; onClose: () => void }) {
  const e = useRecipesCopy().editor
  const t = useT()
  const [amount, setAmount] = useState('')
  const key = ingredient?.key
  useEffect(() => {
    if (ingredient) setAmount(quantityInputValue(ingredient.quantity))
    // Only when another ingredient is opened: typing must not be overwritten by its own result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return (
    <Sheet
      open={ingredient !== null}
      onClose={onClose}
      title={e.ingredientTitle}
      footer={
        <div className="flex items-center gap-3">
          <Button variant="quiet" onClick={onRemove}>
            {e.removeIngredient}
          </Button>
          <Button className="flex-1" onClick={onClose}>
            {t.actions.done}
          </Button>
        </div>
      }
    >
      {ingredient && (
        <div className="flex flex-col gap-4">
          <Field label={e.ingredientName} value={ingredient.name} onChange={(event) => onChange({ ...ingredient, name: event.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={e.amount}
              value={amount}
              inputMode="decimal"
              onChange={(event) => {
                setAmount(event.target.value)
                onChange({ ...ingredient, quantity: parseQuantity(event.target.value) })
              }}
            />
            <Field label={e.unit} value={ingredient.unit ?? ''} autoCapitalize="none" onChange={(event) => onChange({ ...ingredient, unit: event.target.value || undefined })} />
          </div>
          <p className="-mt-1 text-xs text-ink-soft">{e.amountHint}</p>
        </div>
      )}
    </Sheet>
  )
}

interface IngredientsProps {
  ingredients: DraftIngredient[]
  quick: string
  onQuick: (text: string) => void
  onChange: (ingredients: DraftIngredient[]) => void
}

function IngredientsField({ ingredients, quick, onQuick, onChange }: IngredientsProps) {
  const e = useRecipesCopy().editor
  const lang = useLang()
  const [editing, setEditing] = useState<string | null>(null)
  const current = ingredients.find((i) => i.key === editing) ?? null

  const addLines = (text: string): number => {
    const parsed = parseIngredientList(text)
    if (parsed.length) onChange([...ingredients, ...parsed.map((i) => ({ ...i, key: draftKey() }))])
    return parsed.length
  }
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (addLines(quick)) onQuick('')
  }
  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text')
    if (!/\n/.test(text.trim())) return
    event.preventDefault()
    const count = addLines(text)
    if (count) toast(e.added(count))
  }

  return (
    <Card pad={false}>
      {ingredients.length === 0 ? (
        <p className="px-4 pt-4 text-sm text-ink-soft">{e.noIngredients}</p>
      ) : (
        <SortableList items={ingredients} onMove={(from, to) => onChange(moveItem(ingredients, from, to))} className="py-1" rowClassName="flex items-center border-b border-line pl-1 pr-1 last:border-b-0">
          {(ingredient, _index, handle) => {
            const { quantity, unit } = ingredient.quantity === undefined ? { quantity: '', unit: ingredient.unit } : formatAmount(ingredient.quantity, ingredient.unit, lang, false)
            const amount = [quantity, unit].filter(Boolean).join(' ')
            return (
              <>
                <DragHandle {...handle} label={e.moveIngredient(ingredient.name)} />
                <button type="button" aria-label={e.editIngredient(ingredient.name)} onClick={() => setEditing(ingredient.key)} className="flex min-h-12 min-w-0 flex-1 items-baseline gap-2 py-2 text-left" data-testid="ingredient-row">
                  {amount && <span className="tabular shrink-0 font-extrabold">{amount}</span>}
                  <span className="min-w-0 break-words">{ingredient.name}</span>
                </button>
                <RoundButton label={`${e.removeIngredient}: ${ingredient.name}`} onClick={() => onChange(ingredients.filter((i) => i.key !== ingredient.key))}>
                  <Icon name="close" size={20} className="text-ink-soft" />
                </RoundButton>
              </>
            )
          }}
        </SortableList>
      )}
      <form onSubmit={onSubmit} className={cx('grid grid-cols-[1fr_auto] items-end gap-2 p-4', ingredients.length > 0 && 'border-t border-line')}>
        <Field label={e.quickAdd} placeholder={e.quickAddPlaceholder} value={quick} enterKeyHint="done" autoCapitalize="none" autoComplete="off" onChange={(event) => onQuick(event.target.value)} onPaste={onPaste} />
        <Button type="submit" variant="secondary" className="min-h-13 px-4" aria-label={e.addIngredient} disabled={!quick.trim()}>
          <Icon name="plus" size={22} />
        </Button>
        <p className="col-span-2 text-xs text-ink-soft">{e.quickAddHint}</p>
      </form>
      <IngredientSheet
        ingredient={current}
        onChange={(next) => onChange(ingredients.map((i) => (i.key === next.key ? next : i)))}
        onRemove={() => {
          onChange(ingredients.filter((i) => i.key !== editing))
          setEditing(null)
        }}
        onClose={() => setEditing(null)}
      />
    </Card>
  )
}

// ------------------------------------------------------------------ steps --

function StepPhoto({ photoId, pending, alt }: { photoId?: ID; pending?: PendingPhoto; alt: string }) {
  const stored = usePhotoUrl(pending ? null : photoId, 'thumb')
  const url = pending?.url ?? stored
  if (!url) return <div className="size-14 shrink-0 animate-pulse rounded-xl bg-blush" />
  return <img src={url} alt={alt} className="size-14 shrink-0 rounded-xl object-cover" />
}

interface StepsProps {
  steps: DraftStep[]
  photos: Record<string, PendingPhoto>
  onChange: (steps: DraftStep[]) => void
  onPhoto: (key: string, file: File | null) => void
}

function StepsField({ steps, photos, onChange, onPhoto }: StepsProps) {
  const e = useRecipesCopy().editor
  const lang = useLang()
  const added = useRef<string | null>(null)
  const patch = (key: string, changes: Partial<DraftStep>) => onChange(steps.map((s) => (s.key === key ? { ...s, ...changes } : s)))
  const add = () => {
    const key = draftKey()
    added.current = key
    onChange([...steps, { key, text: '', timerMinutes: '' }])
  }

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {steps.map((step, index) => {
          const n = index + 1
          const suggestion = step.timerMinutes.trim() ? null : detectTimerMinutes(step.text)
          const hasPhoto = Boolean(step.photoId || photos[step.key])
          return (
            <li key={step.key}>
              <Card pad={false} className="p-3" data-testid="step">
                <div className="flex items-center gap-2">
                  <span className="tabular grid size-8 shrink-0 place-items-center rounded-full bg-blush font-display text-base font-bold" aria-hidden>
                    {n}
                  </span>
                  <label htmlFor={`step-${step.key}`} className="flex-1 text-xs font-extrabold">
                    {e.step(n)}
                  </label>
                  <RoundButton label={e.moveUp(n)} disabled={index === 0} onClick={() => onChange(moveItem(steps, index, index - 1))}>
                    <LineIcon name="up" />
                  </RoundButton>
                  <RoundButton label={e.moveDown(n)} disabled={index === steps.length - 1} onClick={() => onChange(moveItem(steps, index, index + 1))}>
                    <LineIcon name="down" />
                  </RoundButton>
                  <RoundButton
                    label={e.removeStep(n)}
                    onClick={() => {
                      onPhoto(step.key, null)
                      onChange(steps.filter((s) => s.key !== step.key))
                    }}
                  >
                    <LineIcon name="trash" size={20} />
                  </RoundButton>
                </div>
                <textarea
                  id={`step-${step.key}`}
                  rows={3}
                  placeholder={e.stepPlaceholder}
                  value={step.text}
                  autoFocus={added.current === step.key}
                  onChange={(event) => patch(step.key, { text: event.target.value })}
                  className={cx(fieldBox, 'mt-2 block resize-none py-3 leading-snug')}
                />
                {suggestion !== null && (
                  <button
                    type="button"
                    onClick={() => patch(step.key, { timerMinutes: String(suggestion) })}
                    className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-line-strong px-4 text-xs font-bold text-ink"
                  >
                    <Icon name="clock" size={16} />
                    {e.setTimer(formatTimer(suggestion * 60, lang))}
                  </button>
                )}
                <div className="mt-2 flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-xs font-extrabold">
                    <Icon name="clock" size={18} className="text-ink-soft" />
                    <span>{e.timerShort}</span>
                    <input
                      inputMode="decimal"
                      aria-label={e.timer(n)}
                      value={step.timerMinutes}
                      onChange={(event) => patch(step.key, { timerMinutes: event.target.value })}
                      className={cx(fieldLook, 'min-h-11 w-[4.5rem] px-2 text-center')}
                    />
                    <span className="text-ink-soft">{e.min}</span>
                  </label>
                  {hasPhoto ? (
                    <span className="flex items-center gap-1">
                      <StepPhoto photoId={step.photoId} pending={photos[step.key]} alt={e.stepPhotoAlt(n)} />
                      <RoundButton
                        label={e.removeStepPhoto(n)}
                        onClick={() => {
                          onPhoto(step.key, null)
                          patch(step.key, { photoId: undefined })
                        }}
                      >
                        <Icon name="close" size={20} className="text-ink-soft" />
                      </RoundButton>
                    </span>
                  ) : (
                    <FilePicker testId={`step-photo-${n}`} onPick={(file) => onPhoto(step.key, file)}>
                      {(open) => (
                        <RoundButton label={e.stepPhoto(n)} tone="paper" onClick={open}>
                          <Icon name="camera" size={20} />
                        </RoundButton>
                      )}
                    </FilePicker>
                  )}
                </div>
              </Card>
            </li>
          )
        })}
      </ol>
      <Button variant="secondary" block icon={<Icon name="plus" size={20} />} onClick={add}>
        {e.addStep}
      </Button>
    </div>
  )
}

// --------------------------------------------------------------- calories --

/** One optional figure in grams, as a row: the word on the left, a small field on the right. */
function GramsRow({ label, name, value, onChange }: { label: string; name: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex min-h-14 items-center justify-between gap-3 text-sm font-bold">
      {label}
      <span className="flex items-center gap-2">
        <input inputMode="decimal" aria-label={name} value={value} onChange={(event) => onChange(event.target.value)} className={cx(fieldLook, 'min-h-11 w-24 px-3 text-right')} />
        <span className="w-4 text-xs text-ink-soft" aria-hidden>
          g
        </span>
      </span>
    </label>
  )
}

// ------------------------------------------------------------------- form --

function DishForm({ dish }: { dish: Dish | null }) {
  const t = useT()
  const c = useRecipesCopy()
  const e = c.editor
  const lang = useLang()
  const showCalories = usePref('showCalories')
  const others = useDishes({ includeArchived: true })
  useScrollTop()

  const [initial] = useState<DishDraft>(() => (dish ? draftFromDish(dish) : emptyDraft()))
  const [draft, setDraft] = useState<DishDraft>(initial)
  const [tagText, setTagText] = useState('')
  const [quick, setQuick] = useState('')
  const [cover, setCover] = useState<PendingPhoto | null>(null)
  const [stepPhotos, setStepPhotos] = useState<Record<string, PendingPhoto>>({})
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState(false)
  const set = <K extends keyof DishDraft>(key: K, value: DishDraft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  // Pictures picked but not saved are shown from memory; let go of them when the form closes.
  const urls = useRef<string[]>([])
  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), [])
  const pending = (file: File, source: PhotoSource): PendingPhoto | null => {
    if (!file.type.startsWith('image/')) {
      toast(e.photoFailed, 'oops')
      return null
    }
    const url = URL.createObjectURL(file)
    urls.current.push(url)
    return { file, url, source }
  }

  const dirty = cover !== null || Object.keys(stepPhotos).length > 0 || tagText.trim() !== '' || quick.trim() !== '' || !sameValue(draft, initial)
  const guard = useLeaveGuard(dirty, () => back(dish ? `/recipes/${dish.id}` : '/recipes'))

  const suggestions = useMemo(() => suggestTags(others ?? [], draft.tags), [others, draft.tags])
  const prep = parseAmount(draft.prepMinutes) ?? 0
  const cook = parseAmount(draft.cookMinutes) ?? 0

  const sections: RailSection[] = [
    { id: 'ed-basics', label: e.sections.basics },
    { id: 'ed-picture', label: e.sections.picture },
    { id: 'ed-recipe', label: e.sections.recipe },
    { id: 'ed-ingredients', label: e.sections.ingredients },
    { id: 'ed-steps', label: e.sections.steps },
    { id: 'ed-notes', label: e.sections.notes },
    ...(showCalories ? [{ id: 'ed-calories', label: e.sections.calories }] : []),
  ]

  const save = async () => {
    if (saving) return
    if (!draft.name.trim()) {
      setNameError(true)
      toast(e.nameMissing, 'oops')
      document.getElementById('ed-basics')?.scrollIntoView({ behavior: prefersCalm() ? 'auto' : 'smooth', block: 'start' })
      document.getElementById('dish-name')?.focus({ preventScroll: true })
      return
    }
    setSaving(true)
    try {
      // Whatever is still sitting in the two "type and press enter" fields counts too.
      let next: DishDraft = {
        ...draft,
        tags: addTag(draft.tags, tagText),
        ingredients: [...draft.ingredients, ...parseIngredientList(quick).map((i) => ({ ...i, key: draftKey() }))],
      }
      try {
        if (cover) {
          const photo = await addPhotoFromFile(store, cover.file, { kind: 'cover', source: cover.source })
          next = { ...next, coverPhotoId: photo.id }
        }
        const steps: DraftStep[] = []
        for (const step of next.steps) {
          const picked = stepPhotos[step.key]
          steps.push(picked && step.text.trim() ? { ...step, photoId: (await addPhotoFromFile(store, picked.file, { kind: 'step', source: picked.source })).id } : step)
        }
        next = { ...next, steps }
      } catch {
        setSaving(false)
        toast(e.photoFailed, 'oops')
        return
      }
      const input = dishInputFromDraft(next)
      if (dish) {
        await updateDish(dish.id, changedFields(dishInputFromDraft(initial), input))
        guard.release()
        toast(t.common.saved)
        back(`/recipes/${dish.id}`)
      } else {
        const created = await createDish(input)
        guard.release()
        toast(t.common.saved)
        navigate(`/recipes/${created.id}`, { replace: true })
      }
    } catch {
      setSaving(false)
      toast(t.common.somethingWrong, 'oops')
    }
  }

  return (
    <Screen>
      <FormHeader title={dish ? e.editTitle : e.newTitle} onBack={guard.tryLeave}>
        <JumpRail sections={sections} label={e.jump} />
      </FormHeader>

      <main className="app-column flex flex-col gap-7 px-4 pb-28 pt-5">
        <Section id="ed-basics" title={e.sections.basics}>
          <Card className="flex flex-col gap-5">
            <div>
              <Field
                id="dish-name"
                label={e.name}
                placeholder={e.namePlaceholder}
                value={draft.name}
                autoCapitalize="sentences"
                aria-invalid={nameError || undefined}
                onChange={(event) => {
                  set('name', event.target.value)
                  if (nameError) setNameError(false)
                }}
              />
              {nameError && (
                <p role="alert" className="mt-1.5 text-xs font-bold text-rose-ink">
                  {e.nameMissing}
                </p>
              )}
            </div>
            <TextArea label={e.description} placeholder={e.descriptionPlaceholder} rows={2} value={draft.description} onChange={(event) => set('description', event.target.value)} />
            <div>
              <p className="mb-1.5 text-xs font-extrabold" id="course-label">
                {e.course}
              </p>
              <div role="group" aria-labelledby="course-label" className="flex flex-wrap gap-2">
                {COURSE_ORDER.map((course: Course) => (
                  <Chip key={course} selected={draft.course === course} onClick={() => set('course', course)}>
                    {t.courses[course]}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-extrabold" id="effort-label">
                {e.effort} <span className="font-semibold text-ink-soft">({t.common.optional})</span>
              </p>
              <div role="group" aria-labelledby="effort-label" className="flex flex-wrap gap-2">
                {EFFORTS.map((effort) => (
                  <Chip key={effort} selected={draft.effort === effort} onClick={() => set('effort', draft.effort === effort ? null : effort)}>
                    {t.effort[effort]}
                  </Chip>
                ))}
              </div>
            </div>
            <TagsField tags={draft.tags} text={tagText} onText={setTagText} onChange={(tags) => set('tags', tags)} suggestions={suggestions} />
          </Card>
        </Section>

        <Section id="ed-picture" title={e.sections.picture}>
          <PictureField
            dish={dish}
            name={draft.name}
            coverPhotoId={draft.coverPhotoId}
            pending={cover}
            icon={draft.icon}
            onPhoto={(file, source) => {
              const picked = pending(file, source)
              if (picked) setCover(picked)
            }}
            onRemovePhoto={() => {
              setCover(null)
              set('coverPhotoId', null)
              if (!draft.icon) set('icon', 'cloche')
            }}
            onIcon={(icon) => set('icon', icon)}
          />
        </Section>

        <Section id="ed-recipe" title={e.sections.recipe}>
          <Card pad={false} className="px-4 pb-4 pt-1">
            <Stepper label={e.servings} value={draft.servings} min={1} max={24} onChange={(servings) => set('servings', servings)} />
            <div className="mt-2 grid grid-cols-2 items-end gap-3">
              <Field label={e.prep} inputMode="numeric" value={draft.prepMinutes} onChange={(event) => set('prepMinutes', event.target.value)} />
              <Field label={e.cook} inputMode="numeric" value={draft.cookMinutes} onChange={(event) => set('cookMinutes', event.target.value)} />
            </div>
            {prep + cook > 0 && (
              <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-ink-soft" data-testid="total-time">
                <Icon name="clock" size={16} />
                {e.totalTime(formatDuration(prep + cook, lang))}
              </p>
            )}
          </Card>
        </Section>

        <Section id="ed-ingredients" title={e.sections.ingredients}>
          <IngredientsField ingredients={draft.ingredients} quick={quick} onQuick={setQuick} onChange={(ingredients) => set('ingredients', ingredients)} />
        </Section>

        <Section id="ed-steps" title={e.sections.steps}>
          <StepsField
            steps={draft.steps}
            photos={stepPhotos}
            onChange={(steps) => set('steps', steps)}
            onPhoto={(key, file) => {
              const picked = file ? pending(file, 'gallery') : null
              setStepPhotos((current) => {
                const next = { ...current }
                if (picked) next[key] = picked
                else delete next[key]
                return next
              })
            }}
          />
        </Section>

        <Section id="ed-notes" title={e.sections.notes}>
          <Card className="flex flex-col gap-5">
            <TextArea label={e.notes} placeholder={e.notesPlaceholder} value={draft.notes} onChange={(event) => set('notes', event.target.value)} />
            <Field label={e.source} placeholder={e.sourcePlaceholder} inputMode="url" autoCapitalize="none" autoCorrect="off" value={draft.sourceUrl} onChange={(event) => set('sourceUrl', event.target.value)} />
          </Card>
        </Section>

        {showCalories && (
          <Section id="ed-calories" title={e.sections.calories}>
            <Card pad={false} className="px-4 pb-2 pt-4">
              <Field label={e.kcal} hint={e.kcalHint} inputMode="decimal" value={draft.kcal} onChange={(event) => set('kcal', event.target.value)} />
              <div className="mt-3 divide-y divide-line border-t border-line">
                <GramsRow label={c.dish.protein} name={e.protein} value={draft.protein} onChange={(value) => set('protein', value)} />
                <GramsRow label={c.dish.carbs} name={e.carbs} value={draft.carbs} onChange={(value) => set('carbs', value)} />
                <GramsRow label={c.dish.fat} name={e.fat} value={draft.fat} onChange={(value) => set('fat', value)} />
              </div>
              <div className="border-t border-line">
                <Toggle label={e.isEstimate} checked={draft.isEstimate} onChange={(isEstimate) => set('isEstimate', isEstimate)} />
              </div>
            </Card>
          </Section>
        )}
      </main>

      <BottomBar>
        <Button block onClick={() => void save()} disabled={saving}>
          {e.save}
        </Button>
      </BottomBar>

      <ConfirmSheet open={guard.asking} title={e.discardTitle} confirm={e.keepEditing} onConfirm={guard.stay} other={{ label: e.discard, onClick: guard.discard }} cancel={false} onClose={guard.stay}>
        <p>{e.discardBody}</p>
      </ConfirmSheet>
    </Screen>
  )
}

/** `/recipes/new` (no id) and `/recipes/:id/edit`. */
export function DishEditor({ id }: { id?: ID }) {
  const c = useRecipesCopy()
  const dish = useDish(id)
  if (id && dish === undefined) {
    return (
      <Screen>
        <PageHeader title={c.editor.editTitle} backTo="/recipes" />
        <SteamLoader />
      </Screen>
    )
  }
  if (id && !dish) {
    return (
      <Screen>
        <PageHeader title={c.editor.editTitle} backTo="/recipes" />
        <EmptyState
          title={c.dish.goneTitle}
          body={c.dish.goneBody}
          action={
            <Button variant="secondary" onClick={() => navigate('/recipes', { replace: true })}>
              {c.dish.backToBook}
            </Button>
          }
        />
      </Screen>
    )
  }
  return <DishForm key={id ?? 'new'} dish={id ? (dish as Dish) : null} />
}
