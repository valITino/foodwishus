// The deco kit: small kitchen objects in one hand-drawn style (cocoa outline, flat
// pastel fill). Every object has a job in the interface. Use at most one per screen area.
// All artwork is original to FoodwishUs.

import type { CSSProperties, ReactNode } from 'react'

export interface ArtProps {
  size?: number
  className?: string
  style?: CSSProperties
  /** Give a label only when the picture carries meaning on its own. */
  label?: string
}

const LINE = 'var(--color-art-outline)'
const DETAIL = '#4a3833'
const PAPER = 'var(--color-art-paper)'
const ROSE = 'var(--color-art-rose)'
const BLUSH = 'var(--color-art-blush)'
const CHERRY = 'var(--color-art-cherry)'
const GOLD = 'var(--color-art-gold)'
const SAGE = 'var(--color-art-sage)'

const stroke = { stroke: LINE, strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

function Art({ size = 48, className, style, label, children, box = '0 0 48 48', ratio = 1 }: ArtProps & { children: ReactNode; box?: string; ratio?: number }) {
  return (
    <svg
      width={size}
      height={size * ratio}
      viewBox={box}
      fill="none"
      className={className}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {children}
    </svg>
  )
}

const HEART = 'M24 40C10 30 6 22 7 16c1-6 6-9 11-8 3 .5 5 2.5 6 5 1-2.5 3-4.5 6-5 5-1 10 2 11 8 1 6-3 14-17 24Z'

export function Heart({ fill = ROSE, ...p }: ArtProps & { fill?: string }) {
  return (
    <Art {...p}>
      <path d={HEART} fill={fill} {...stroke} />
      <path d="M13 17c.5-2.5 2-4 4-4.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity=".7" />
    </Art>
  )
}

export function Bow({ fill = CHERRY, ...p }: ArtProps & { fill?: string }) {
  return (
    <Art {...p}>
      <path d="M22 25c-2 6-5 10-8 14l4.5-1 1.5 4c2-6 3.5-11 4-16Z" fill={fill} {...stroke} />
      <path d="M26 25c2 6 5 10 8 14l-4.5-1-1.5 4c-2-6-3.5-11-4-16Z" fill={fill} {...stroke} />
      <path d="M24 22C16 10 5 12 6 20s11 8 18 2Z" fill={fill} {...stroke} />
      <path d="M24 22c8-12 19-10 18-2s-11 8-18 2Z" fill={fill} {...stroke} />
      <ellipse cx="24" cy="22" rx="4" ry="4.5" fill={fill} {...stroke} />
      <path d="M12 17c2.5.5 5 1.5 7 3M36 17c-2.5.5-5 1.5-7 3" stroke={DETAIL} strokeWidth="1.6" strokeLinecap="round" opacity=".45" />
    </Art>
  )
}

export function Cherry(p: ArtProps) {
  return (
    <Art {...p}>
      <path d="M16 25c2-9 8-15 15-18M32 27.5c0-8.5-.5-15.5-1-20.5" {...stroke} />
      <path d="M31 7c5-4 11-2 12 3-5 2-10 1-12-3Z" fill={SAGE} {...stroke} />
      <circle cx="16" cy="33" r="8" fill={CHERRY} {...stroke} />
      <circle cx="32" cy="35" r="7.5" fill={CHERRY} {...stroke} />
      <path d="M11.5 31c.5-2 1.5-3 3-3.5M28 33c.5-2 1.5-3 3-3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".7" />
    </Art>
  )
}

export function Whisk(p: ArtProps) {
  return (
    <Art {...p}>
      <g transform="rotate(28 24 24)">
        <path d="M24 29C11 23 11 8 24 4c13 4 13 19 0 25ZM24 29c-6-6-6-19 0-25 6 6 6 19 0 25ZM24 29V4" {...stroke} />
        <rect x="21" y="28" width="6" height="16" rx="3" fill={ROSE} {...stroke} />
      </g>
    </Art>
  )
}

export function RollingPin(p: ArtProps) {
  return (
    <Art {...p}>
      <g transform="rotate(-28 24 24)">
        <rect x="2" y="21.5" width="9" height="5" rx="2.5" fill={ROSE} {...stroke} />
        <rect x="37" y="21.5" width="9" height="5" rx="2.5" fill={ROSE} {...stroke} />
        <rect x="9" y="18" width="30" height="12" rx="6" fill="#f0d9a8" {...stroke} />
        <path d="M15 22h10" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".7" />
      </g>
    </Art>
  )
}

export function Teacup(p: ArtProps) {
  return (
    <Art {...p}>
      <path d="M17 15c-2-3 2-5 0-8M25 15c-2-3 2-5 0-8" {...stroke} opacity=".7" />
      <path d="M34 23c6 0 6 9-1 9" {...stroke} />
      <path d="M9 20h25v6c0 7-5 11-12.5 11S9 33 9 26v-6Z" fill={PAPER} {...stroke} />
      <path d="M21.5 31.5c-3.5-2.5-4.5-4.5-4.2-6 .3-1.6 2.3-2.2 3.4-.6l.8 1 .8-1c1.1-1.6 3.1-1 3.4.6.3 1.5-.7 3.5-4.2 6Z" fill={ROSE} />
      <path d="M6 41h31" {...stroke} />
    </Art>
  )
}

export function Cloche(p: ArtProps) {
  return (
    <Art {...p}>
      <path d="M8 34c0-14 7-21 16-21s16 7 16 21H8Z" fill={PAPER} {...stroke} />
      <circle cx="24" cy="10" r="3" fill={ROSE} {...stroke} />
      <rect x="4" y="34" width="40" height="5" rx="2.5" fill={BLUSH} {...stroke} />
      <path d="M14 28c0-5 3-9 7-10" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".85" />
    </Art>
  )
}

export function Sprig(p: ArtProps) {
  return (
    <Art {...p}>
      <path d="M24 44V8" {...stroke} />
      <path d="M24 36c-6 0-10-4-11-8 6 0 10 3 11 8ZM24 36c6 0 10-4 11-8-6 0-10 3-11 8ZM24 25c-5 0-8-3-9-7 5 0 8 3 9 7ZM24 25c5 0 8-3 9-7-5 0-8 3-9 7ZM24 14c-3-2-3-6 0-9 3 3 3 7 0 9Z" fill={SAGE} {...stroke} />
    </Art>
  )
}

export function Flower({ fill = BLUSH, ...p }: ArtProps & { fill?: string }) {
  const petals = [0, 72, 144, 216, 288]
  return (
    <Art {...p}>
      {petals.map((angle) => (
        <ellipse key={angle} cx="24" cy="12.5" rx="6.5" ry="8" fill={fill} {...stroke} transform={`rotate(${angle} 24 24)`} />
      ))}
      <circle cx="24" cy="24" r="5" fill={GOLD} {...stroke} />
    </Art>
  )
}

export function Sparkle({ fill = GOLD, ...p }: ArtProps & { fill?: string }) {
  return (
    <Art {...p}>
      <path d="M24 4c2 13 5 16 18 20-13 4-16 7-18 20-2-13-5-16-18-20 13-4 16-7 18-20Z" fill={fill} />
    </Art>
  )
}

/** A strip of washi tape. It holds photos and notes in place. */
export function WashiTape({ tone = 'rose', ...p }: ArtProps & { tone?: 'rose' | 'sage' | 'butter' }) {
  const fill = { rose: '#e9a3b1', sage: '#b9c9ac', butter: '#f1dc94' }[tone]
  const id = `washi-${tone}`
  return (
    <Art {...p} size={p.size ?? 84} box="0 0 90 24" ratio={24 / 90}>
      <defs>
        <pattern id={id} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="9" height="9" fill={fill} />
          <rect width="3.5" height="9" fill="#fff" opacity=".38" />
        </pattern>
      </defs>
      <path d="M2 1h86l-3 3.7 3 3.6-3 3.7 3 3.7-3 3.6 3 3.7H2l3-3.7-3-3.6 3-3.7-3-3.7 3-3.6L2 1Z" fill={`url(#${id})`} opacity=".9" />
    </Art>
  )
}

/** The wax seal that closes a review: "Eaten with love". */
export function WaxSeal({ text = 'EATEN WITH LOVE', ...p }: ArtProps & { text?: string }) {
  const blobs = [8, 55, 97, 141, 190, 232, 281, 322]
  return (
    <Art {...p} size={p.size ?? 112} box="0 0 100 100" label={p.label ?? 'Wax seal'}>
      <g fill="#c8414b">
        <circle cx="50" cy="50" r="40" />
        {blobs.map((angle, i) => (
          <circle key={angle} cx="50" cy="12" r={i % 3 === 0 ? 10 : 8} transform={`rotate(${angle} 50 50)`} />
        ))}
      </g>
      <circle cx="50" cy="50" r="33" stroke="#9f2f3a" strokeWidth="2" />
      <circle cx="50" cy="50" r="19.5" stroke="#9f2f3a" strokeWidth="1.5" />
      <path id="seal-arc" d="M27.9 62.8a25.5 25.5 0 1 1 44.2 0" />
      <text fill="#ffe3e0" fontSize="7.4" fontWeight="800" letterSpacing="1.1" fontFamily="var(--font-sans)" textAnchor="middle">
        <textPath href="#seal-arc" startOffset="50%">
          {text}
        </textPath>
      </text>
      <path d="M50 79.5c-2.6-1.9-3.3-3.3-3.1-4.4.2-1.2 1.7-1.6 2.5-.4l.6.8.6-.8c.8-1.2 2.3-.8 2.5.4.2 1.1-.5 2.5-3.1 4.4Z" fill="#ffe3e0" />
      <path d="M50 61c-9-6.5-11.5-11.5-10.8-15.4.8-4.1 5.9-5.6 8.7-1.5l2.1 2.8 2.1-2.8c2.8-4.1 7.9-2.6 8.7 1.5.7 3.9-1.8 8.9-10.8 15.4Z" fill="#9f2f3a" />
      <path d="M22 36c3-8 9-14 17-17" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".28" />
    </Art>
  )
}

export type MascotMood = 'love' | 'happy' | 'sleepy'

const SMALL_HEART = 'M110 186C46 140 24 106 28 72c4-32 30-46 54-42 14 2 23 12 28 22 5-10 14-20 28-22 24-4 50 10 54 42 4 34-18 68-82 114Z'

/** Fork, our mascot: heart-eyed, hungry, wearing a gingham bib. */
export function Mascot({ mood = 'love', bib = '#e58a9c', ...p }: ArtProps & { mood?: MascotMood; bib?: string }) {
  const id = `bib-${bib.replace(/[^a-z0-9]/gi, '')}`
  const thick = { stroke: LINE, strokeWidth: 3.5, strokeLinejoin: 'round', strokeLinecap: 'round' } as const
  return (
    <Art {...p} size={p.size ?? 120} box="0 0 200 240" ratio={1.2} label={p.label ?? 'Fork, the FoodwishUs mascot'}>
      <defs>
        <pattern id={id} width="12" height="12" patternUnits="userSpaceOnUse">
          <rect width="12" height="12" fill="#fdf1f3" />
          <rect width="6" height="12" fill={bib} opacity=".55" />
          <rect width="12" height="6" fill={bib} opacity=".55" />
        </pattern>
      </defs>
      <rect x="91" y="120" width="18" height="100" rx="9" fill={PAPER} {...thick} />
      <path d={SMALL_HEART} transform="translate(100 202) scale(.065) translate(-110 -108)" fill={ROSE} />
      <path
        d="M58 30c0-7.5 11-7.5 11 0v36h13.3V30c0-7.5 11-7.5 11 0v36h13.4V30c0-7.5 11-7.5 11 0v36H131V30c0-7.5 11-7.5 11 0v68c0 24-19 40-42 40S58 122 58 98V30Z"
        fill={PAPER}
        {...thick}
      />
      <path d="M65 78v20c0 10 3 18 9 24M63.5 32v20" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".85" />

      {mood === 'love' && (
        <>
          <path d={SMALL_HEART} transform="translate(84 95) scale(.13) translate(-110 -108)" fill={CHERRY} />
          <path d={SMALL_HEART} transform="translate(116 95) scale(.13) translate(-110 -108)" fill={CHERRY} />
          <circle cx="79.5" cy="91" r="2.2" fill="#fff" />
          <circle cx="111.5" cy="91" r="2.2" fill="#fff" />
        </>
      )}
      {mood === 'happy' && (
        <path d="M76 97q8-10 16 0M108 97q8-10 16 0" stroke={DETAIL} strokeWidth="3.5" strokeLinecap="round" />
      )}
      {mood === 'sleepy' && (
        <>
          <path d="M76 93q8 8 16 0M108 93q8 8 16 0" stroke={DETAIL} strokeWidth="3.5" strokeLinecap="round" />
          <text x="150" y="52" fill={LINE} fontFamily="var(--font-display)" fontWeight="700" fontSize="24">z</text>
          <text x="166" y="34" fill={LINE} fontFamily="var(--font-display)" fontWeight="700" fontSize="17">z</text>
        </>
      )}

      <ellipse cx="71" cy="112" rx="7" ry="4" fill={BLUSH} />
      <ellipse cx="129" cy="112" rx="7" ry="4" fill={BLUSH} />

      {mood === 'sleepy' ? (
        <ellipse cx="100" cy="115" rx="4.5" ry="5" fill={DETAIL} />
      ) : (
        <>
          <path d="M88 110q12 18 24 0Z" fill={DETAIL} stroke={DETAIL} strokeWidth="2" strokeLinejoin="round" />
          <ellipse cx="100" cy="117" rx="5" ry="2.6" fill="#f28c9e" />
        </>
      )}
      {mood === 'love' && (
        <path d="M113 112c3.6 7 7 12 0 18-7-6-3.6-11 0-18Z" fill="#a9d4e8" stroke={DETAIL} strokeWidth="1.6" />
      )}

      <path d="M68 136h64l-32 50-32-50Z" fill={`url(#${id})`} stroke={LINE} strokeWidth="2.8" strokeLinejoin="round" />
      <path d="M70 137 57 125l20 6-7 6ZM130 137l13-12-20 6 7 6Z" fill={bib} stroke={LINE} strokeWidth="2.2" strokeLinejoin="round" />
    </Art>
  )
}

/** Three curls of steam. Used by the loading cloche. */
export function Steam({ className }: { className?: string }) {
  return (
    <svg width="44" height="26" viewBox="0 0 44 26" fill="none" aria-hidden className={className}>
      {[8, 22, 36].map((x, i) => (
        <path
          key={x}
          d={`M${x} 24c-4-5 4-9 0-14s2-6 0-8`}
          stroke={LINE}
          strokeWidth="2.4"
          strokeLinecap="round"
          opacity=".75"
          style={{ animation: `steam-rise 1.8s ease-in-out ${i * 0.28}s infinite`, transformOrigin: `${x}px 24px` }}
        />
      ))}
    </svg>
  )
}
