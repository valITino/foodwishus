import { motion } from 'motion/react'
import { useT } from '../../i18n'
import { Icon, type IconName } from '../deco/Icon'
import { buzz, cx } from './cx'

export type TabId = 'today' | 'wishlist' | 'week' | 'cockpit' | 'recipes'

interface Props {
  active: TabId
  onSelect: (tab: TabId) => void
  onAdd: () => void
  /** Small counters, for example proofs waiting on Today. */
  badges?: Partial<Record<TabId, number>>
  /** Render in the page flow instead of fixed to the bottom (for previews). */
  inline?: boolean
}

const tabs: { id: TabId; icon: IconName }[] = [
  { id: 'today', icon: 'today' },
  { id: 'wishlist', icon: 'wishlist' },
  { id: 'week', icon: 'week' },
  { id: 'cockpit', icon: 'cockpit' },
  { id: 'recipes', icon: 'book' },
]

/** Bottom navigation with a doily edge. The "add" button sits raised on the edge, dead centre. */
export function TabBar({ active, onSelect, onAdd, badges = {}, inline = false }: Props) {
  const t = useT()

  const tab = ({ id, icon }: { id: TabId; icon: IconName }) => {
    const on = active === id
    const count = badges[id] ?? 0
    return (
      <button
        key={id}
        type="button"
        aria-current={on ? 'page' : undefined}
        onClick={() => onSelect(id)}
        className={cx('relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl', on ? 'text-rose-ink' : 'text-ink-soft')}
      >
        <span className="relative">
          <Icon name={icon} size={24} />
          {count > 0 && (
            <span className="absolute -right-2.5 -top-1.5 grid min-w-4.5 place-items-center rounded-full bg-cherry px-1 text-2xs font-extrabold leading-4.5 text-white">
              {count}
            </span>
          )}
        </span>
        <span className={cx('text-2xs', on ? 'font-extrabold' : 'font-bold')}>{t.tabs[id]}</span>
        {on && <motion.span layoutId="tab-dot" className="absolute bottom-0.5 size-1.5 rounded-full bg-rose-ink" />}
      </button>
    )
  }

  return (
    <nav aria-label="Main" className={cx('z-40 w-full', inline ? 'relative' : 'fixed inset-x-0 bottom-0')}>
      <div className="app-column relative">
        <div className="scallop-top bg-blush px-1 pb-[max(0.375rem,env(safe-area-inset-bottom))] [--scallop:9px]">
          <div className="flex items-stretch">
            {tabs.map(tab)}
          </div>
        </div>
        <motion.button
          type="button"
          aria-label={t.tabs.add}
          onClick={() => {
            buzz(14)
            onAdd()
          }}
          whileTap={{ scale: 0.9, rotate: 90 }}
          transition={{ type: 'spring', stiffness: 500, damping: 18 }}
          className="absolute left-1/2 -top-13.5 grid size-15 -translate-x-1/2 place-items-center rounded-full bg-rose text-on-rose shadow-float ring-4 ring-ground"
        >
          <Icon name="plus" size={28} />
        </motion.button>
      </div>
    </nav>
  )
}
