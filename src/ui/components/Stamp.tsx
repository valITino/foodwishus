import { motion } from 'motion/react'
import { useT } from '../../i18n'
import { WaxSeal } from '../deco/Deco'

/** The wax seal coming down on a finished review, with a small squash and settle. */
export function Stamp({ size = 112, play = true }: { size?: number; play?: boolean }) {
  const t = useT()
  return (
    <motion.div
      className="inline-block drop-shadow-[0_6px_8px_#9f2f3a55]"
      initial={play ? { scale: 2.4, rotate: -28, opacity: 0 } : false}
      // Without play the seal simply sits there: no keyframes, so nothing swells over the page edge on the way in.
      animate={play ? { scale: [2.4, 0.9, 1.06, 1], rotate: [-28, -9, -12, -10], opacity: 1 } : { scale: 1, rotate: -10, opacity: 1 }}
      transition={{ duration: 0.55, times: [0, 0.55, 0.8, 1], ease: 'easeOut' }}
    >
      <WaxSeal size={size} text={t.review.sealText} label={t.review.sealLabel} />
    </motion.div>
  )
}
