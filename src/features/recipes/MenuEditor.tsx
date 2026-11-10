// The menu form: a name, and dishes in the order they come to the table. Dishes are
// picked from the recipe book or created on the spot by name.

import { useMemo, useState } from 'react'
import { back, navigate } from '../../app/router'
import { createDish, createMenu, updateMenu } from '../../data/actions'
import { useDishes, useMenu } from '../../data/queries'
import type { Course, Dish, ID, Menu } from '../../data/types'
import { useT } from '../../i18n'
import { Button, Card, Chip, DishThumb, EmptyState, Field, PageHeader, Screen, Sheet, SteamLoader, Tag, TextArea, toast } from '../../ui/components'
import { Icon } from '../../ui/deco/Icon'
import { useRecipesCopy } from './copy'
import { changedFields, COURSE_ORDER, draftKey, insertByCourse, matchesDish, moveItem, normalize, orderedCourses, sameValue, sortDishes } from './logic'
import { BottomBar, ConfirmSheet, FormHeader, RoundButton, SearchField, Section, useScrollTop } from './parts'
import { rememberView } from './RecipeBook'
import { DragHandle, SortableList } from './Sortable'
import { useLeaveGuard } from './useLeaveGuard'

/** One course in the form: a dish from the book, or a new one that is created when the menu is saved. */
interface Entry {
  key: string
  dishId?: ID
  fresh?: { name: string }
  course: Course
}

interface MenuDraft {
  name: string
  description: string
  entries: Entry[]
}

function draftFromMenu(menu: Menu | null, dishes: Map<ID, Dish>): MenuDraft {
  if (!menu) return { name: '', description: '', entries: [] }
  return {
    name: menu.name,
    description: menu.description ?? '',
    entries: orderedCourses(menu)
      .filter((course) => dishes.has(course.dishId))
      .map((course) => ({ key: draftKey(), dishId: course.dishId, course: (dishes.get(course.dishId) as Dish).course })),
  }
}

// ------------------------------------------------------------------ picker --

interface PickerProps {
  open: boolean
  dishes: Dish[]
  entries: Entry[]
  onToggle: (dish: Dish) => void
  onCreate: (name: string, course: Course) => void
  onClose: () => void
}

function DishPicker({ open, dishes, entries, onToggle, onCreate, onClose }: PickerProps) {
  const t = useT()
  const c = useRecipesCopy()
  const m = c.menu
  const [query, setQuery] = useState('')
  const [naming, setNaming] = useState<string | null>(null)
  const picked = new Set(entries.map((entry) => entry.dishId))
  const found = useMemo(() => sortDishes(dishes.filter((dish) => matchesDish(dish, query)), 'az'), [dishes, query])
  const typed = query.trim()
  const taken = typed !== '' && (dishes.some((dish) => normalize(dish.name) === normalize(typed)) || entries.some((entry) => entry.fresh && normalize(entry.fresh.name) === normalize(typed)))
  const close = () => {
    setQuery('')
    setNaming(null)
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title={m.pickTitle}
      footer={
        <Button block onClick={close}>
          {m.done}
        </Button>
      }
    >
      <SearchField
        label={m.pickSearch}
        placeholder={m.pickSearch}
        value={query}
        onChange={(next) => {
          setQuery(next)
          setNaming(null)
        }}
        clearLabel={c.book.clearSearch}
      />

      {naming !== null ? (
        <div className="mt-4 rounded-card bg-blush p-4">
          <p className="text-sm font-extrabold" id="new-dish-course">
            {m.whatCourse(naming)}
          </p>
          <div role="group" aria-labelledby="new-dish-course" className="mt-3 flex flex-wrap gap-2">
            {COURSE_ORDER.map((course) => (
              <Chip
                key={course}
                onClick={() => {
                  onCreate(naming, course)
                  setNaming(null)
                  setQuery('')
                }}
              >
                {t.courses[course]}
              </Chip>
            ))}
          </div>
        </div>
      ) : (
        typed !== '' &&
        !taken && (
          <button type="button" onClick={() => setNaming(typed)} className="mt-3 flex min-h-13 w-full items-center gap-3 rounded-card border-[1.5px] border-dashed border-line-strong px-4 py-2 text-left text-sm font-extrabold">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-blush">
              <Icon name="plus" size={20} />
            </span>
            <span className="min-w-0 break-words">{m.create(typed)}</span>
          </button>
        )
      )}

      {found.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">{dishes.length === 0 ? m.pickEmpty : m.pickNoMatch}</p>
      ) : (
        <ul className="mt-2" data-testid="picker-list">
          {found.map((dish) => {
            const inMenu = picked.has(dish.id)
            return (
              <li key={dish.id} className="border-b border-line last:border-b-0">
                <button type="button" role="checkbox" aria-checked={inMenu} onClick={() => onToggle(dish)} className="flex min-h-16 w-full items-center gap-3 py-2 text-left">
                  <DishThumb dish={dish} size={48} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 break-words text-sm font-extrabold leading-snug">{dish.name}</span>
                    <span className="mt-0.5 block text-xs font-bold text-ink-soft">{inMenu ? m.inMenu : t.courses[dish.course]}</span>
                  </span>
                  <span className={inMenu ? 'grid size-8 shrink-0 place-items-center rounded-full bg-rose text-on-rose' : 'grid size-8 shrink-0 place-items-center rounded-full border-2 border-line-strong text-ink-soft'}>
                    <Icon name={inMenu ? 'check' : 'plus'} size={18} />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Sheet>
  )
}

// -------------------------------------------------------------------- form --

function MenuForm({ menu, dishes }: { menu: Menu | null; dishes: Dish[] }) {
  const t = useT()
  const c = useRecipesCopy()
  const m = c.menu
  useScrollTop()
  const byId = useMemo(() => new Map(dishes.map((dish) => [dish.id, dish])), [dishes])
  const dishOf = (entry: Entry) => (entry.dishId ? byId.get(entry.dishId) : undefined)
  const courseName = (entry: Entry) => dishOf(entry)?.name ?? entry.fresh?.name ?? c.parts.gone
  const [initial] = useState<MenuDraft>(() => draftFromMenu(menu, byId))
  const [draft, setDraft] = useState<MenuDraft>(initial)
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<'name' | 'courses' | null>(null)
  const dirty = !sameValue(draft, initial)
  const guard = useLeaveGuard(dirty, () => back(menu ? `/menus/${menu.id}` : '/recipes'))
  const setEntries = (entries: Entry[]) => {
    setDraft((d) => ({ ...d, entries }))
    if (error === 'courses') setError(null)
  }

  const toggle = (dish: Dish) => {
    if (draft.entries.some((entry) => entry.dishId === dish.id)) setEntries(draft.entries.filter((entry) => entry.dishId !== dish.id))
    else setEntries(insertByCourse(draft.entries, { key: draftKey(), dishId: dish.id, course: dish.course }))
  }

  const save = async () => {
    if (saving) return
    if (!draft.name.trim()) {
      setError('name')
      toast(m.nameMissing, 'oops')
      window.scrollTo({ top: 0 })
      document.getElementById('menu-name')?.focus({ preventScroll: true })
      return
    }
    if (draft.entries.length === 0) {
      setError('courses')
      toast(m.coursesMissing, 'oops')
      return
    }
    setSaving(true)
    try {
      const courses = []
      for (const entry of draft.entries) {
        const dishId = entry.dishId ?? (await createDish({ name: (entry.fresh as { name: string }).name, course: entry.course })).id
        courses.push({ dishId, order: courses.length })
      }
      const input = { name: draft.name.trim(), description: draft.description.trim() || null, courses }
      rememberView('menus')
      if (menu) {
        const before = { name: menu.name, description: menu.description, courses: orderedCourses(menu).map((course, order) => ({ dishId: course.dishId, order })) }
        await updateMenu(menu.id, changedFields(before, input))
        guard.release()
        toast(t.common.saved)
        back(`/menus/${menu.id}`)
      } else {
        const created = await createMenu(input)
        guard.release()
        toast(t.common.saved)
        navigate(`/menus/${created.id}`, { replace: true })
      }
    } catch {
      setSaving(false)
      toast(t.common.somethingWrong, 'oops')
    }
  }

  return (
    <Screen>
      <FormHeader title={menu ? m.editTitle : m.newTitle} onBack={guard.tryLeave} />
      <main className="app-column flex flex-col gap-7 px-4 pb-28 pt-5">
        <Card className="flex flex-col gap-5">
          <div>
            <Field
              id="menu-name"
              label={m.name}
              placeholder={m.namePlaceholder}
              value={draft.name}
              aria-invalid={error === 'name' || undefined}
              onChange={(event) => {
                setDraft((d) => ({ ...d, name: event.target.value }))
                if (error === 'name') setError(null)
              }}
            />
            {error === 'name' && (
              <p role="alert" className="mt-1.5 text-xs font-bold text-rose-ink">
                {m.nameMissing}
              </p>
            )}
          </div>
          <TextArea label={m.description} placeholder={m.descriptionPlaceholder} rows={2} value={draft.description} onChange={(event) => setDraft((d) => ({ ...d, description: event.target.value }))} />
        </Card>

        <Section id="menu-courses" title={m.courses}>
          <Card pad={false}>
            {draft.entries.length === 0 ? (
              <p className="px-4 pt-4 text-sm text-ink-soft">{m.noCourses}</p>
            ) : (
              <SortableList items={draft.entries} name={courseName} onMove={(from, to) => setEntries(moveItem(draft.entries, from, to))} className="py-1" rowClassName="flex items-center gap-1 border-b border-line pl-1 pr-1 last:border-b-0">
                {(entry, index, handle) => {
                  const dish = dishOf(entry)
                  const name = courseName(entry)
                  return (
                    <>
                      <DragHandle {...handle} label={m.moveCourse(name)} />
                      <span className="tabular w-5 shrink-0 text-center font-display text-base font-bold" aria-hidden>
                        {index + 1}
                      </span>
                      <DishThumb dish={dish ?? { id: entry.key, name, coverPhotoId: null, icon: 'cloche' }} size={44} className="ml-1" />
                      <span className="min-w-0 flex-1 py-2.5 pl-1.5" data-testid="menu-course">
                        <span className="line-clamp-2 break-words text-sm font-extrabold leading-snug">{name}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs font-bold text-ink-soft">
                          {t.courses[entry.course]}
                          {entry.fresh && <Tag tone="butter">{m.isNew}</Tag>}
                        </span>
                      </span>
                      <RoundButton label={m.removeCourse(name)} onClick={() => setEntries(draft.entries.filter((other) => other.key !== entry.key))}>
                        <Icon name="close" size={20} className="text-ink-soft" />
                      </RoundButton>
                    </>
                  )
                }}
              </SortableList>
            )}
            <div className="p-4">
              <Button variant="secondary" block icon={<Icon name="plus" size={20} />} onClick={() => setPicking(true)}>
                {m.addDish}
              </Button>
              {error === 'courses' ? (
                <p role="alert" className="mt-3 text-xs font-bold text-rose-ink">
                  {m.coursesMissing}
                </p>
              ) : (
                draft.entries.length > 1 && <p className="mt-3 text-xs text-ink-soft">{m.coursesHint}</p>
              )}
            </div>
          </Card>
        </Section>
      </main>

      <BottomBar>
        <Button block onClick={() => void save()} disabled={saving}>
          {m.save}
        </Button>
      </BottomBar>

      <DishPicker
        open={picking}
        dishes={dishes.filter((dish) => !dish.archived || draft.entries.some((entry) => entry.dishId === dish.id))}
        entries={draft.entries}
        onToggle={toggle}
        onCreate={(name, course) => setEntries(insertByCourse(draft.entries, { key: draftKey(), fresh: { name }, course }))}
        onClose={() => setPicking(false)}
      />

      <ConfirmSheet open={guard.asking} title={c.editor.discardTitle} confirm={c.editor.keepEditing} onConfirm={guard.stay} other={{ label: c.editor.discard, onClick: guard.discard }} cancel={false} onClose={guard.stay}>
        <p>{c.editor.discardBody}</p>
      </ConfirmSheet>
    </Screen>
  )
}

/** `/menus/new` (no id) and `/menus/:id/edit`. */
export function MenuEditor({ id }: { id?: ID }) {
  const c = useRecipesCopy()
  const menu = useMenu(id)
  const dishes = useDishes({ includeArchived: true })
  const title = id ? c.menu.editTitle : c.menu.newTitle
  if (dishes === undefined || (id && menu === undefined)) {
    return (
      <Screen>
        <PageHeader title={title} backTo="/recipes" />
        <SteamLoader />
      </Screen>
    )
  }
  if (id && !menu) {
    return (
      <Screen>
        <PageHeader title={title} backTo="/recipes" />
        <EmptyState
          title={c.menu.goneTitle}
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
  return <MenuForm key={id ?? 'new'} menu={id ? (menu as Menu) : null} dishes={dishes} />
}
