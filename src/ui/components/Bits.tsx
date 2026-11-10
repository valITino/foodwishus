import type { ReactNode } from 'react'
import { useT } from '../../i18n'
import type { SyncStatus } from '../../data/sync'
import { Bow, Cherry, Cloche, Flower, Mascot, Sprig, Steam, Teacup, Whisk, type MascotMood } from '../deco/Deco'
import { Icon, type IconName } from '../deco/Icon'
import { cx } from './cx'

const AVATAR_ART = { whisk: Whisk, cherry: Cherry, teacup: Teacup, bow: Bow, flower: Flower, cloche: Cloche, sprig: Sprig } as const
const AVATAR_TONES: Record<string, string> = {
  rose: 'bg-[#f6d5dc]',
  sage: 'bg-[#d5dfcb]',
  butter: 'bg-[#f8ecc0]',
  sky: 'bg-[#d3e8f2]',
}

export const AVATARS = ['whisk', 'fork', 'cherry', 'teacup', 'bow', 'flower', 'cloche', 'sprig'] as const

/** Things an avatar can wear. Stored in Member.accessory; null means nothing. */
export const ACCESSORIES = ['bow', 'chef-hat', 'crown', 'flower', 'sparkle'] as const

const COCOA = '#4a3833'
const wearLine = { stroke: COCOA, strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/** A baker's toque, in the deco style. */
function ChefHat({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
      <path
        d="M14 30.5C8 29.5 5 25 6 20.5c1-4.5 6-7 10-5.5 1-5 4.5-8 8-8s7 3 8 8c4-1.5 9 1 10 5.5 1 4.5-2 9-8 10V39a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2v-8.5Z"
        fill="var(--color-art-paper)"
        {...wearLine}
      />
      <path d="M14 34h20" {...wearLine} />
      <path d="M19.5 28.5v-5M24 29v-7M28.5 28.5v-5" stroke={COCOA} strokeWidth="1.6" strokeLinecap="round" opacity=".45" />
      <path d="M11 20c.5-1.8 1.8-3 3.5-3.3" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity=".9" />
    </svg>
  )
}

/** A small crown with three jewels, in the deco style. */
function Crown({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
      <path d="M9.5 35 6.5 17l9.5 7.5L24 11l8 13.5L41.5 17l-3 18h-29Z" fill="var(--color-art-gold)" {...wearLine} />
      <rect x="8.5" y="34" width="31" height="7" rx="2.5" fill="var(--color-art-gold)" {...wearLine} />
      <circle cx="6.5" cy="15.5" r="2.7" fill="var(--color-art-rose)" {...wearLine} strokeWidth="2" />
      <circle cx="24" cy="9.5" r="3" fill="var(--color-art-cherry)" {...wearLine} strokeWidth="2" />
      <circle cx="41.5" cy="15.5" r="2.7" fill="var(--color-art-rose)" {...wearLine} strokeWidth="2" />
      <path d="M14 37.5h6" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".7" />
    </svg>
  )
}

const STAR = 'M24 4c2 13 5 16 18 20-13 4-16 7-18 20-2-13-5-16-18-20 13-4 16-7 18-20Z'

/** Two sparkles, one big and one small. */
function Twinkle({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
      <path d={STAR} transform="translate(20 28) scale(.74) translate(-24 -24)" fill="var(--color-art-gold)" stroke={COCOA} strokeWidth="3" strokeLinejoin="round" />
      <path d={STAR} transform="translate(38 11) scale(.36) translate(-24 -24)" fill="var(--color-art-gold)" stroke={COCOA} strokeWidth="5" strokeLinejoin="round" />
    </svg>
  )
}

/** Where each accessory sits on the plate, as fractions of the avatar's size. */
const WEAR: Record<string, { art: (p: { size: number }) => ReactNode; scale: number; x: number; y: number; turn: number }> = {
  bow: { art: Bow, scale: 0.46, x: 0.62, y: -0.1, turn: 16 },
  'chef-hat': { art: ChefHat, scale: 0.58, x: 0.1, y: -0.29, turn: -12 },
  crown: { art: Crown, scale: 0.52, x: 0.13, y: -0.25, turn: -12 },
  flower: { art: Flower, scale: 0.42, x: 0.64, y: -0.07, turn: 10 },
  sparkle: { art: Twinkle, scale: 0.5, x: 0.62, y: -0.14, turn: 0 },
}

interface AvatarProps {
  avatar: string
  color?: string
  size?: number
  name?: string
  /** One of ACCESSORIES, or nothing. Unknown names draw nothing. */
  accessory?: string | null
}

/** A person's picture: one of our kitchen icons on a soft plate of colour, wearing an accessory if they picked one. */
export function Avatar({ avatar, color = 'rose', size = 44, name, accessory }: AvatarProps) {
  const Art = AVATAR_ART[avatar as keyof typeof AVATAR_ART]
  const wear = accessory ? WEAR[accessory] : undefined
  const plate = (
    <span
      role={!wear && name ? 'img' : undefined}
      aria-label={wear ? undefined : name}
      className={cx('inline-grid shrink-0 place-items-center overflow-hidden rounded-full ring-2 ring-surface', AVATAR_TONES[color] ?? AVATAR_TONES.rose)}
      style={{ width: size, height: size, ['--color-art-outline' as string]: COCOA }}
    >
      {Art ? <Art size={size * 0.68} /> : <Mascot size={size * 0.62} mood="happy" label="" style={{ marginTop: size * 0.12 }} />}
    </span>
  )
  if (!wear) return plate

  // The accessory overlaps the rim like a sticker, so it gets a thin paper edge of its own.
  const edge = Math.max(1, size / 64)
  const WearArt = wear.art
  return (
    <span role={name ? 'img' : undefined} aria-label={name} className="relative inline-grid shrink-0" style={{ width: size, height: size }}>
      {plate}
      <span
        aria-hidden
        data-accessory={accessory}
        className="pointer-events-none absolute"
        style={{
          left: size * wear.x,
          top: size * wear.y,
          transform: `rotate(${wear.turn}deg)`,
          filter: `drop-shadow(${edge}px 0 0 #fffdf9) drop-shadow(-${edge}px 0 0 #fffdf9) drop-shadow(0 ${edge}px 0 #fffdf9) drop-shadow(0 -${edge}px 0 #fffdf9)`,
          ['--color-art-outline' as string]: COCOA,
        }}
      >
        <WearArt size={size * wear.scale} />
      </span>
    </span>
  )
}

/** A person and their status line, as a little speech bubble. */
export function StatusBubble({ name, status, avatar, color }: { name: string; status: string; avatar: string; color?: string }) {
  return (
    <div className="flex items-end gap-2">
      <Avatar avatar={avatar} color={color} size={40} name={name} />
      <div className="min-w-0 rounded-[18px] rounded-bl-[6px] border border-line bg-surface px-3.5 py-2">
        <p className="text-2xs font-extrabold text-ink-soft">{name}</p>
        <p className="break-words text-sm font-bold leading-snug">{status}</p>
      </div>
    </div>
  )
}

/** An empty screen is an invitation: Fork, one line, one thing to do. */
export function EmptyState({ title, body, action, mood = 'sleepy' }: { title: string; body: string; action?: ReactNode; mood?: MascotMood }) {
  return (
    <div className="flex flex-col items-center px-6 py-8 text-center">
      <Mascot size={104} mood={mood} />
      <h2 className="mt-4 text-xl">{title}</h2>
      <p className="mt-1.5 font-script text-2xl leading-tight text-rose-ink">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/** Loading: steam curls rising from a cloche. */
export function SteamLoader({ label }: { label?: string }) {
  const t = useT()
  return (
    <div role="status" className="flex flex-col items-center gap-1 py-6">
      <Steam className="-mb-1" />
      <Cloche size={64} />
      <span className="mt-1 text-xs font-bold text-ink-soft">{label ?? t.loading}</span>
    </div>
  )
}

/** A quiet line telling you whether your changes have reached the cloud. */
export function SyncPill({ status }: { status: Pick<SyncStatus, 'state' | 'pending' | 'uploads'> }) {
  const t = useT()
  const waiting = status.pending + status.uploads
  let icon: IconName = 'synced'
  let text = t.sync.synced
  let dot = 'bg-sage text-on-rose'
  if (status.state === 'offline') {
    icon = 'offline'
    text = t.sync.offline
    dot = 'bg-butter text-on-rose'
  } else if (status.state === 'locked-out') {
    icon = 'offline'
    text = t.sync.lockedOut
    dot = 'bg-cherry text-white'
  } else if (status.state === 'error') {
    icon = 'offline'
    text = t.sync.error
    dot = 'bg-cherry text-white'
  } else if (waiting > 0) {
    icon = 'sending'
    text = t.sync.sending(waiting)
    dot = 'bg-butter text-on-rose'
  } else if (status.state === 'syncing') {
    icon = 'sending'
    text = t.sync.syncing
  }
  return (
    <span
      role="status"
      data-sync-state={status.state}
      className="inline-flex min-h-8 items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 text-2xs font-extrabold text-ink"
    >
      <span className={cx('grid size-6 place-items-center rounded-full', dot)}>
        <Icon name={icon} size={15} />
      </span>
      {text}
    </span>
  )
}

/** One number with its label, for the mini stats on Today and the Cockpit tiles. */
export function Stat({ value, label, unit }: { value: ReactNode; label: string; unit?: string }) {
  return (
    <div className="min-w-0">
      <div className="font-display text-2xl font-bold leading-none font-soft tabular">
        {value}
        {unit && <span className="ml-1 font-sans text-xs font-bold text-ink-soft">{unit}</span>}
      </div>
      <div className="mt-1 text-xs font-bold text-ink-soft">{label}</div>
    </div>
  )
}
