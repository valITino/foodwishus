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

/** A person's picture: one of our kitchen icons on a soft plate of colour. */
export function Avatar({ avatar, color = 'rose', size = 44, name }: { avatar: string; color?: string; size?: number; name?: string }) {
  const Art = AVATAR_ART[avatar as keyof typeof AVATAR_ART]
  return (
    <span
      role={name ? 'img' : undefined}
      aria-label={name}
      className={cx('inline-grid shrink-0 place-items-center overflow-hidden rounded-full ring-2 ring-surface', AVATAR_TONES[color] ?? AVATAR_TONES.rose)}
      style={{ width: size, height: size, ['--color-art-outline' as string]: '#4a3833' }}
    >
      {Art ? <Art size={size * 0.68} /> : <Mascot size={size * 0.62} mood="happy" label="" style={{ marginTop: size * 0.12 }} />}
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
