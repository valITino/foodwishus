// The bell on Today: one tap to what the other one did. A number says how much is new.

import { navigate } from '../../app/router'
import { useUnseenNews } from '../../data/queries'
import { useCopy } from '../../i18n'
import { Icon } from '../../ui/deco/Icon'
import { newsCopy } from './copy'

export function Bell() {
  const c = useCopy(newsCopy)
  const unseen = useUnseenNews() ?? 0
  return (
    <button
      type="button"
      data-testid="bell"
      aria-label={c.bell(unseen)}
      onClick={() => navigate('/news')}
      className="relative grid size-11 shrink-0 place-items-center rounded-full border-[1.5px] border-line-strong bg-surface text-ink transition-transform duration-100 active:scale-90"
    >
      <Icon name="bell" size={22} />
      {unseen > 0 && (
        <span aria-hidden className="absolute -right-1 -top-1 grid min-w-4.5 place-items-center rounded-full bg-cherry px-1 text-2xs font-extrabold leading-4.5 text-on-cherry">
          {unseen > 9 ? '9+' : unseen}
        </span>
      )}
    </button>
  )
}
