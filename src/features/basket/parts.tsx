// The basket's doors from other screens: the button on Today, and "Ingredients into the
// basket" on a dish.

import { useEffect, useMemo, useState } from 'react'
import { navigate } from '../../app/router'
import { putOnBasket } from '../../data/actions'
import { useBasket, useBasketCount, usePantry } from '../../data/queries'
import type { Dish } from '../../data/types'
import { useLang } from '../../i18n'
import { Button, cx, Sheet, toast } from '../../ui/components'
import { Icon } from '../../ui/deco/Icon'
import { formatIngredient } from '../recipes/logic'
import { useBasketCopy } from './copy'
import { covers } from './logic'

/** On Today, next to the bell: one tap to the basket, with how many things wait to be bought. */
export function BasketButton() {
  const c = useBasketCopy()
  const count = useBasketCount() ?? 0
  return (
    <button
      type="button"
      data-testid="basket-button"
      aria-label={c.entry(count)}
      onClick={() => navigate('/basket')}
      className="relative grid size-11 shrink-0 place-items-center rounded-full border-[1.5px] border-line-strong bg-surface text-ink transition-transform duration-100 active:scale-90"
    >
      <Icon name="basket" size={22} />
      {count > 0 && (
        <span aria-hidden className="absolute -right-1 -top-1 grid min-w-4.5 place-items-center rounded-full bg-ink px-1 text-2xs font-extrabold leading-4.5 text-ground">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  )
}

/**
 * A dish's ingredients as a list to tick: what is in the pantry or on the basket already
 * starts unticked. `factor` scales the amounts to the servings chosen on the dish page.
 */
export function IngredientsToBasket({ dish, factor, open, onClose }: { dish: Dish; factor: number; open: boolean; onClose: () => void }) {
  const c = useBasketCopy()
  const lang = useLang()
  const pantry = usePantry()
  const basket = useBasket()
  const lines = useMemo(() => (dish.recipe.ingredients ?? []).filter((ingredient) => ingredient.name.trim()).map((ingredient) => formatIngredient(ingredient, factor, lang)), [dish, factor, lang])
  const where = (name: string): 'pantry' | 'basket' | null =>
    (pantry ?? []).some((row) => covers(row.name, name)) ? 'pantry' : (basket ?? []).some((item) => item.state !== 'bought' && covers(item.name, name)) ? 'basket' : null
  const [picked, setPicked] = useState<boolean[]>([])
  // Tick what is needed each time the sheet opens, with the pantry as it is then.
  useEffect(() => {
    if (open) setPicked(lines.map((line) => where(line.name) === null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const count = picked.filter(Boolean).length

  const add = async () => {
    const chosen = lines.filter((_, index) => picked[index])
    onClose()
    if (chosen.length === 0) return
    const { added } = await putOnBasket(chosen.map((line) => ({ name: line.name.split(/[,(]/)[0].trim(), amount: line.amount || null, note: dish.name, source: 'dish' as const, dishId: dish.id })))
    toast(added > 0 ? c.added(added) : c.alreadyThere(chosen[0].name))
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={c.fromDishTitle}
      footer={
        <Button block onClick={() => void add()} disabled={count === 0}>
          {c.fromDishAdd(count)}
        </Button>
      }
    >
      {lines.length === 0 ? (
        <p>{c.fromDishNone}</p>
      ) : (
        <>
          <p className="mb-2 text-sm text-ink-soft">{c.fromDishHint}</p>
          <ul className="rounded-card border border-line">
            {lines.map((line, index) => {
              const at = where(line.name)
              return (
                <li key={index} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={picked[index] ?? false}
                    onClick={() => setPicked(picked.map((on, i) => (i === index ? !on : on)))}
                    className="flex min-h-13 w-full items-center gap-3 px-3 py-2 text-left"
                    data-testid="to-basket-line"
                  >
                    <span className={cx('grid size-6 shrink-0 place-items-center rounded-md border-2', picked[index] ? 'border-rose-ink bg-rose text-on-rose' : 'border-line-strong bg-surface')}>{picked[index] && <Icon name="check" size={14} />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="min-w-0 break-words font-extrabold">{line.name}</span>
                        {line.amount && <span className="text-sm font-semibold text-ink-soft">{line.amount}</span>}
                      </span>
                      {at && <span className="block text-xs text-ink-soft">{at === 'pantry' ? c.inPantry : c.onBasket}</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Sheet>
  )
}
