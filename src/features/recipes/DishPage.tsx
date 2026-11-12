// One dish: its picture, the facts, ingredients that rescale with the servings,
// the steps, and what you can do with it.

import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { back, navigate } from '../../app/router'
import { deleteDish, updateDish, updateMenu } from '../../data/actions'
import { usePref } from '../../data/prefs'
import { useDish, useMenus, useServings } from '../../data/queries'
import type { Dish, ID } from '../../data/types'
import { useLang, useT } from '../../i18n'
import { Button, Card, DishThumb, EmptyState, PageHeader, PhotoImg, Screen, Stat, SteamLoader, Stepper, Tag, toast } from '../../ui/components'
import { Icon } from '../../ui/deco/Icon'
import { getChosenServings, isCooking, setChosenServings, useCookStore } from './cookSession'
import { useRecipesCopy } from './copy'
import { DEFAULT_SERVINGS, formatIngredient, formatTimer, scaleFactor, sourceLink, totalMinutes } from './logic'
import { BottomBar, ConfirmSheet, DurationFigure, LineIcon, Section, useScrollTop } from './parts'
import { rememberView } from './RecipeBook'

function TimeStat({ minutes, label }: { minutes: number; label: string }) {
  return <Stat value={<DurationFigure minutes={minutes} />} label={label} />
}

function Facts({ dish }: { dish: Dish }) {
  const c = useRecipesCopy()
  const showCalories = usePref('showCalories')
  const { prepMinutes, cookMinutes } = dish.recipe
  const total = totalMinutes(dish.recipe)
  const { kcalPerServing, proteinG, carbsG, fatG, isEstimate } = dish.nutrition
  const macros = [
    proteinG !== undefined && `${c.dish.protein} ${proteinG} g`,
    carbsG !== undefined && `${c.dish.carbs} ${carbsG} g`,
    fatG !== undefined && `${c.dish.fat} ${fatG} g`,
  ].filter(Boolean)
  const calories = showCalories && (kcalPerServing !== undefined || macros.length > 0)
  if (total === null && !calories) return null
  return (
    <Card tone="blush" pad={false} data-testid="facts">
      {total !== null && (
        <div className="flex flex-wrap gap-x-5 gap-y-3 px-5 py-4 min-[400px]:gap-x-8">
          {prepMinutes ? <TimeStat minutes={prepMinutes} label={c.dish.prep} /> : null}
          {cookMinutes ? <TimeStat minutes={cookMinutes} label={c.dish.cook} /> : null}
          <TimeStat minutes={total} label={c.dish.total} />
        </div>
      )}
      {calories && (
        <div className={total !== null ? 'border-t border-line px-5 py-4' : 'px-5 py-4'}>
          {kcalPerServing !== undefined && (
            <div className="flex items-start justify-between gap-3">
              <Stat value={Math.round(kcalPerServing)} unit="kcal" label={c.parts.perServing} />
              {isEstimate && <Tag tone="butter">{c.parts.estimate}</Tag>}
            </div>
          )}
          {macros.length > 0 && (
            <p className={kcalPerServing !== undefined ? 'mt-2 text-xs font-bold text-ink-soft' : 'text-xs font-bold text-ink-soft'}>
              {macros.join(', ')}
              {kcalPerServing === undefined && ` (${c.parts.perServing})`}
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

function Ingredients({ dish }: { dish: Dish }) {
  const t = useT()
  const c = useRecipesCopy()
  const lang = useLang()
  useCookStore()
  const base = dish.recipe.servings && dish.recipe.servings > 0 ? dish.recipe.servings : DEFAULT_SERVINGS
  const servings = getChosenServings(dish.id) ?? base
  const factor = scaleFactor(base, servings)
  const ingredients = dish.recipe.ingredients ?? []
  // Amounts give a little nod when they change, but not when the page first opens.
  const calm = useReducedMotion()
  const settled = useRef(false)
  useEffect(() => {
    settled.current = true
  }, [])

  return (
    <Section id="ingredients" title={c.dish.ingredients}>
      <Card pad={false}>
        <div className="px-4 py-1">
          <Stepper label={c.dish.servings} value={servings} min={1} max={Math.max(24, base)} onChange={(next) => setChosenServings(dish.id, next === base ? null : next)} />
        </div>
        {servings !== base && (
          <div className="flex items-center justify-between gap-3 border-t border-line pl-4 pr-1 text-xs font-bold text-ink-soft">
            <span>{c.dish.scaled(t.common.servings(base))}</span>
            <Button variant="quiet" className="min-h-11" onClick={() => setChosenServings(dish.id, null)}>
              {c.dish.reset}
            </Button>
          </div>
        )}
        <ul className="border-t border-line" data-testid="ingredients">
          {ingredients.map((ingredient, i) => {
            const { amount, name } = formatIngredient(ingredient, factor, lang)
            return (
              <li key={i} className="flex gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                <motion.span
                  key={amount}
                  initial={settled.current && !calm ? { opacity: 0.3, y: -3 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  className="tabular w-24 shrink-0 break-words text-right font-extrabold"
                >
                  {amount}
                </motion.span>
                <span className="min-w-0 flex-1 break-words">{name}</span>
              </li>
            )
          })}
        </ul>
      </Card>
    </Section>
  )
}

function Steps({ dish }: { dish: Dish }) {
  const c = useRecipesCopy()
  const lang = useLang()
  const steps = dish.recipe.steps ?? []
  return (
    <Section id="steps" title={c.dish.steps}>
      <Card pad={false}>
        <ol className="divide-y divide-line">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3 p-4">
              <span className="tabular grid size-8 shrink-0 place-items-center rounded-full bg-blush font-display text-base font-bold" aria-hidden>
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="whitespace-pre-line break-words">{step.text}</p>
                {step.timerSeconds ? (
                  <p className="mt-2">
                    <Tag tone="butter">
                      <Icon name="clock" size={13} /> {c.dish.timer(formatTimer(step.timerSeconds, lang))}
                    </Tag>
                  </p>
                ) : null}
                {step.photoId && <PhotoImg photoId={step.photoId} variant="full" alt={c.dish.photoAlt(dish.name, i + 1)} className="mt-3 aspect-[4/3] w-full rounded-2xl" />}
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </Section>
  )
}

export function DishPage({ id }: { id: ID }) {
  const t = useT()
  const c = useRecipesCopy()
  const dish = useDish(id)
  const menus = useMenus({ includeArchived: true })
  const servings = useServings()
  useCookStore()
  useScrollTop()
  const [confirming, setConfirming] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => rememberView('dishes'), [])

  if (dish === undefined || leaving) {
    return (
      <Screen>
        <PageHeader title={c.dish.header} backTo="/recipes" />
        <SteamLoader />
      </Screen>
    )
  }
  if (dish === null) {
    return (
      <Screen>
        <PageHeader title={c.dish.header} backTo="/recipes" />
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

  const { recipe } = dish
  const ingredients = recipe.ingredients ?? []
  const steps = recipe.steps ?? []
  const source = sourceLink(recipe.sourceUrl)
  const inMenus = (menus ?? []).filter((menu) => menu.courses.some((course) => course.dishId === id))
  const usedIn = (servings ?? []).filter((serving) => serving.dishId === id).length
  const chosen = getChosenServings(id)

  const archive = async (archived: boolean) => {
    try {
      await updateDish(id, { archived })
      toast(archived ? c.dish.archivedToast : c.dish.unarchivedToast)
      if (archived) {
        setConfirming(false)
        back('/recipes')
      }
    } catch {
      toast(t.common.somethingWrong, 'oops')
    }
  }

  const remove = async () => {
    setLeaving(true)
    setConfirming(false)
    try {
      for (const menu of inMenus) {
        const courses = menu.courses.filter((course) => course.dishId !== id).map((course, order) => ({ ...course, order }))
        await updateMenu(menu.id, { courses })
      }
      await deleteDish(id)
      toast(c.dish.deletedToast)
      back('/recipes')
    } catch {
      setLeaving(false)
      toast(t.common.somethingWrong, 'oops')
    }
  }

  return (
    <Screen>
      <PageHeader
        title={c.dish.header}
        backTo="/recipes"
        action={
          <Button variant="quiet" onClick={() => navigate(`/recipes/${id}/edit`)}>
            {t.common.edit}
          </Button>
        }
      />
      <main className="app-column flex flex-col gap-6 px-4 pb-28 pt-4">
        {dish.archived && (
          <Card tone="blush" pad={false} className="px-4 py-3 text-sm font-bold" role="status">
            {c.dish.archivedBanner}
          </Card>
        )}

        <div className="flex flex-col gap-4">
          {dish.coverPhotoId && <PhotoImg photoId={dish.coverPhotoId} variant="full" alt={dish.name} className="aspect-[4/3] w-full rounded-card" />}
          {/* A short name sits next to its icon. A long one gets the full width underneath. */}
          <div className={dish.coverPhotoId || dish.name.length > 26 ? 'flex flex-col gap-3' : 'flex items-center gap-4'}>
            {!dish.coverPhotoId && <DishThumb dish={dish} size={dish.name.length > 26 ? 72 : 88} />}
            <h2 className="min-w-0 break-words text-2xl" data-testid="dish-name">
              {dish.name}
            </h2>
          </div>
          {dish.description && <p className="-mt-1.5 break-words text-ink-soft">{dish.description}</p>}
          <div className="flex flex-wrap gap-1.5">
            <Tag>{t.courses[dish.course]}</Tag>
            {dish.effort && <Tag tone="butter">{t.effort[dish.effort]}</Tag>}
            {dish.tags.map((tag) => (
              <Tag key={tag} tone="sage">
                {tag}
              </Tag>
            ))}
          </div>
        </div>

        <Facts dish={dish} />

        {ingredients.length === 0 && steps.length === 0 ? (
          <Card pad={false}>
            <EmptyState
              title={c.dish.noRecipeTitle}
              body={c.dish.noRecipeBody}
              action={
                <Button variant="secondary" onClick={() => navigate(`/recipes/${id}/edit`)}>
                  {c.dish.addRecipe}
                </Button>
              }
            />
          </Card>
        ) : (
          <>
            {ingredients.length > 0 && <Ingredients dish={dish} />}
            {steps.length > 0 && <Steps dish={dish} />}
          </>
        )}

        {recipe.notes && (
          <Card tone="note">
            <p className="text-2xs font-extrabold text-ink-soft">{c.dish.notes}</p>
            {recipe.notes.length <= 140 ? (
              <p className="mt-0.5 whitespace-pre-line break-words font-script text-[1.6rem] leading-tight text-rose-ink">{recipe.notes}</p>
            ) : (
              <p className="mt-1 whitespace-pre-line break-words text-sm">{recipe.notes}</p>
            )}
          </Card>
        )}

        {recipe.sourceUrl && (
          <p className="-my-2 flex items-center gap-2 px-1 text-sm">
            <span className="shrink-0 font-extrabold">{c.dish.source}</span>
            {source ? (
              <a href={source.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 min-w-11 items-center gap-1.5 font-bold text-rose-ink underline decoration-2 underline-offset-4">
                <LineIcon name="link" size={16} className="shrink-0" />
                <span className="truncate">{source.label}</span>
              </a>
            ) : (
              <span className="min-w-0 break-words py-3 text-ink-soft">{recipe.sourceUrl}</span>
            )}
          </p>
        )}

        <div className="flex flex-wrap justify-center gap-x-2">
          {!dish.archived && (
            <Button variant="quiet" onClick={() => void archive(true)}>
              {t.common.archive}
            </Button>
          )}
          <Button variant="quiet" onClick={() => setConfirming(true)}>
            {t.common.delete}
          </Button>
        </div>
      </main>

      <BottomBar>
        {steps.length > 0 && (
          <Button variant="secondary" className="flex-1 px-3" onClick={() => navigate(`/recipes/${id}/cook${chosen ? `?servings=${chosen}` : ''}`)}>
            {isCooking(id) ? c.dish.continueCooking : c.dish.startCooking}
          </Button>
        )}
        {dish.archived ? (
          <Button className="flex-1 px-3" onClick={() => void archive(false)}>
            {c.dish.unarchive}
          </Button>
        ) : (
          <Button className="flex-1 px-3" onClick={() => navigate(`/propose/dish/${id}`)}>
            {t.actions.propose}
          </Button>
        )}
      </BottomBar>

      <ConfirmSheet
        open={confirming}
        title={c.dish.deleteTitle(dish.name)}
        confirm={c.dish.deleteConfirm}
        onConfirm={() => void remove()}
        other={dish.archived ? undefined : { label: c.dish.archiveInstead, onClick: () => void archive(true) }}
        onClose={() => setConfirming(false)}
      >
        <p>{c.dish.deleteBody}</p>
        {inMenus.length > 0 && <p>{c.dish.deleteMenus(inMenus.length)}</p>}
        {usedIn > 0 && <p>{c.dish.deleteServings(usedIn)}</p>}
        {!dish.archived && <p>{c.dish.archiveHint}</p>}
      </ConfirmSheet>
    </Screen>
  )
}
