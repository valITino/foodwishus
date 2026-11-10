import type { ReactNode } from 'react'
import { cx } from './cx'

interface Props {
  title: string
  /** A line in handwriting under the title: a greeting or today's quote. */
  script?: string
  /** Top-right corner: usually the avatar that opens Settings. */
  action?: ReactNode
  children?: ReactNode
  className?: string
}

/** The top of every main screen: a blush awning with a scalloped edge. */
export function AwningHeader({ title, script, action, children, className }: Props) {
  return (
    <header className={cx('scallop-bottom bg-blush [--scallop:12px]', className)}>
      <div className="app-column px-5 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl">{title}</h1>
            {script && <p className="mt-1 font-script text-[1.6rem] leading-tight text-rose-ink">{script}</p>}
          </div>
          {action}
        </div>
        {children}
      </div>
    </header>
  )
}
