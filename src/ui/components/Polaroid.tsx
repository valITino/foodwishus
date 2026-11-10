import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { useT } from '../../i18n'
import { WashiTape } from '../deco/Deco'
import { cx } from './cx'

interface Props {
  /** The photo itself: an <img> or any element that fills the frame. */
  children: ReactNode
  /** Handwritten line under the photo, usually the date. */
  caption?: string
  source?: 'camera' | 'gallery'
  tilt?: number
  tape?: 'rose' | 'sage' | 'butter' | false
  /** Play the "developing" effect once, for a photo that was just taken. */
  developing?: boolean
  className?: string
}

/** A proof photo, held by a strip of washi tape. The paper stays white in candlelight too. */
export function Polaroid({ children, caption, source, tilt = -2, tape = 'rose', developing = false, className }: Props) {
  const t = useT()
  return (
    <figure className={cx('relative w-full', className)} style={{ rotate: `${tilt}deg` }}>
      {tape && <WashiTape tone={tape} className="absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 -rotate-3" />}
      <div className="rounded-paper bg-[#fffefa] p-2.5 pb-2 shadow-paper">
        <div className="relative aspect-square overflow-hidden rounded-[2px] bg-[#efe6df]">
          <motion.div
            className="size-full"
            initial={developing ? { filter: 'brightness(2.6) saturate(0) blur(6px)', opacity: 0.5 } : false}
            animate={{ filter: 'brightness(1) saturate(1) blur(0px)', opacity: 1 }}
            transition={{ duration: 1.6, ease: 'easeOut' }}
          >
            {children}
          </motion.div>
          {source && (
            <span className="absolute left-1.5 top-1.5 rounded-full bg-[#4a3833cc] px-2 py-0.5 text-2xs font-extrabold text-[#fff8f0]">
              {source === 'camera' ? t.photo.live : t.photo.gallery}
            </span>
          )}
        </div>
        <figcaption className="flex min-h-9 items-center justify-center px-1 pt-1 font-script text-xl leading-none text-[#4a3833]">{caption}</figcaption>
      </div>
    </figure>
  )
}
