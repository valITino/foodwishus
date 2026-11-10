// A QR code in our own hand: rounded cocoa modules on paper, with Fork in the middle.
// It is always dark on light, also in candlelight, because that is what cameras read best.

import { useMemo } from 'react'
import { Mascot } from '../../ui/deco/Deco'
import { finderCorners, logoModules, modulesPath, qrMatrix } from './qr'

const COCOA = '#4a3833'
const PAPER = '#fffdf9'
/**
 * The three corner squares, in modules. Readers find a code by these, and measured with
 * OpenCV's two readers on deliberately bad photos, any rounding of the frame cost reads
 * (0.2 lost about 5%, 0.4 about 20%, fully round all of them), while round modules, a
 * round centre dot and the mascot in the middle cost nothing. So: square frame, round dot.
 */
const FINDER_DOT_RADIUS = 1
/** The middle of Fork's face in the mascot drawing (200 x 240 units), and how much of it to show. */
const FACE = { x: 100, y: 80, span: 132 }

interface Props {
  /** The text inside the code, for example an invite link. */
  value: string
  size?: number
  /** Read aloud instead of the picture. */
  label: string
}

export function QrCode({ value, size = 232, label }: Props) {
  const { count, path, hole } = useMemo(() => {
    const matrix = qrMatrix(value)
    return { count: matrix.size, path: modulesPath(matrix, { logo: true }), hole: logoModules(matrix.size) }
  }, [value])
  const holePx = (hole / count) * size
  const zoom = holePx / FACE.span

  return (
    <div
      role="img"
      aria-label={label}
      data-testid="qr"
      data-qr-value={value}
      className="relative"
      style={{ width: size, height: size, background: PAPER, ['--color-art-outline' as string]: COCOA }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${count} ${count}`} aria-hidden>
        <path d={path} fill={COCOA} />
        {finderCorners(count).map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <rect x={x + 0.5} y={y + 0.5} width="6" height="6" stroke={COCOA} strokeWidth="1" fill="none" />
            <rect x={x + 2} y={y + 2} width="3" height="3" rx={FINDER_DOT_RADIUS} fill={COCOA} />
          </g>
        ))}
      </svg>
      {/* Fork's face, cropped like a portrait so he stays recognisable at this size. */}
      <span className="absolute overflow-hidden rounded-[22%]" style={{ left: (size - holePx) / 2, top: (size - holePx) / 2, width: holePx, height: holePx, background: PAPER }} aria-hidden>
        <Mascot size={200 * zoom} mood="love" label="" style={{ position: 'absolute', left: holePx / 2 - FACE.x * zoom, top: holePx / 2 - FACE.y * zoom }} />
      </span>
    </div>
  )
}
